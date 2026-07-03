import { app, clipboard, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { AudioProcessor } from './audioProcessor'
import { GeminiService } from './geminiService'
import { ConfigService } from './configService'
import { ErrorDialogService } from './errorDialogService'
import { LoggerService } from './loggerService'
import { WindowService } from './windowService'
import { createError } from '../shared/types/error'
import { RecordingData } from './types'

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private audioProcessor: AudioProcessor
  private geminiService: GeminiService
  private configService: ConfigService
  private errorDialogService: ErrorDialogService
  private loggerService: LoggerService
  private isRecording: boolean = false

  constructor() {
    this.audioProcessor = new AudioProcessor(app.getPath('userData'))
    this.geminiService = GeminiService.getInstance()
    this.configService = ConfigService.getInstance()
    this.errorDialogService = ErrorDialogService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
    ipcMain.handle('recording:status', this.getRecordingStatus.bind(this))
    ipcMain.handle('clipboard:writeText', this.handleClipboardWrite.bind(this))
  }

  /** 録音開始 */
  startRecording(): void {
    if (this.isRecording) {
      console.log('録音は既に開始されています')
      this.loggerService.info('録音は既に開始されています')
      return
    }

    const recordingWindow = this.getRecordingWindowForOperation('録音開始')
    if (recordingWindow == null) {
      return
    }

    this.isRecording = true
    recordingWindow.webContents.send('recording:start')
    console.log('録音開始指示を送信しました')
    this.loggerService.info('録音開始指示を送信しました')
  }

  /** 録音停止 */
  stopRecording(): void {
    if (!this.isRecording) {
      console.log('録音は開始されていません')
      this.loggerService.info('録音は開始されていません')
      return
    }

    const recordingWindow = this.getRecordingWindowForOperation('録音停止')
    if (recordingWindow == null) {
      this.isRecording = false
      return
    }

    this.isRecording = false
    recordingWindow.webContents.send('recording:stop')
    console.log('録音停止指示を送信しました')
    this.loggerService.info('録音停止指示を送信しました')
  }

  /** 録音トグル */
  toggleRecording(): void {
    if (this.isRecording) {
      this.stopRecording()
    } else {
      this.startRecording()
    }
  }

  /** 録音状態を取得 */
  private getRecordingStatus(): boolean {
    return this.isRecording
  }

  /** 録音データ受信ハンドラー */
  private async handleRecordingData(
    _event: Electron.IpcMainEvent,
    recordingData: RecordingData
  ): Promise<void> {
    try {
      console.log('WebM音声データを受信しました:', {
        dataSize: recordingData.webmData.length
      })
      this.loggerService.infoWithDetails('WebM音声データを受信しました', {
        dataSize: recordingData.webmData.length
      })

      this.isRecording = false

      const processResult = await this.audioProcessor.processAudioData(recordingData)
      if (!processResult.success) {
        const error = createError(
          '音声ファイルの処理に失敗しました',
          `音声処理エラー: ${processResult.error}`
        )
        this.errorDialogService.showErrorDialog(error)
        this.loggerService.error('音声ファイルの処理に失敗しました', processResult.error)
        return
      }

      const processedAudio = processResult.data
      const wavFilePath = processedAudio.wavFilePath
      console.log('音声処理完了、音声認識開始')
      this.loggerService.infoWithDetails('音声処理完了、音声認識開始', {
        audioId: processedAudio.id,
        wavFilePath
      })

      const geminiClient = this.geminiService.getClient()
      const config = await this.configService.loadConfig()
      const transcriptionResult = await geminiClient.transcribe(
        wavFilePath,
        config.vocabulary,
        config.transcription.language
      )

      console.log('音声認識完了:', transcriptionResult)
      this.loggerService.infoWithDetails('音声認識完了', {
        textLength: transcriptionResult.text.length,
        costInfo: transcriptionResult.costInfo
      })

      const recordingWindow = this.getRecordingWindowForOperation('音声認識結果送信')
      if (recordingWindow != null) {
        recordingWindow.webContents.send('transcription:result', transcriptionResult)
      }
    } catch (error) {
      const appError = createError(
        '音声認識処理中に予期しないエラーが発生しました',
        `録音データ処理エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      this.loggerService.error('録音データ処理中に予期しないエラーが発生しました', error)
    }
  }

  /** クリップボードにテキストを書き込み */
  private async handleClipboardWrite(
    _event: Electron.IpcMainInvokeEvent,
    text: string
  ): Promise<boolean> {
    try {
      clipboard.writeText(text)
      console.log('クリップボードにテキストを書き込みました')
      this.loggerService.info('クリップボードにテキストを書き込みました')
      return true
    } catch (error) {
      const appError = createError(
        'クリップボードへのアクセス権限が拒否されました',
        `クリップボード書き込みエラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      this.loggerService.error('クリップボードへの書き込みに失敗しました', error)
      return false
    }
  }

  private getRecordingWindowForOperation(operationName: string): BrowserWindow | null {
    try {
      return WindowService.getExistingInstance().getRecordingWindow()
    } catch (error) {
      const appError = createError(
        '録音ウィンドウに問題が発生しました',
        `${operationName}時に録音ウィンドウを取得できません: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      this.loggerService.error(`${operationName}時に録音ウィンドウを取得できません`, error)
      return null
    }
  }

  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeAllListeners('recording:data')
    ipcMain.removeAllListeners('recording:status')
    ipcMain.removeAllListeners('clipboard:writeText')
  }
}
