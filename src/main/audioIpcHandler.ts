import { ipcMain, BrowserWindow, clipboard } from 'electron'
import { promises as fs } from 'node:fs'
import { AudioProcessor } from './audioProcessor'
import { GeminiService } from './geminiService'
import { ConfigService } from './configService'
import { RecordingData } from './types'

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private audioProcessor: AudioProcessor
  private geminiService: GeminiService
  private configService: ConfigService
  private isRecording: boolean = false

  constructor() {
    this.audioProcessor = new AudioProcessor()
    this.geminiService = GeminiService.getInstance()
    this.configService = ConfigService.getInstance()
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
      return
    }

    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) {
      console.error('メインウィンドウが見つかりません')
      return
    }

    this.isRecording = true
    mainWindow.webContents.send('recording:start')
    console.log('録音開始指示を送信しました')
  }

  /** 録音停止 */
  stopRecording(): void {
    if (!this.isRecording) {
      console.log('録音は開始されていません')
      return
    }

    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) {
      console.error('メインウィンドウが見つかりません')
      this.isRecording = false
      return
    }

    this.isRecording = false
    mainWindow.webContents.send('recording:stop')
    console.log('録音停止指示を送信しました')
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
    let wavFilePath: string | null = null
    try {
      console.log('WebM音声データを受信しました:', {
        dataSize: recordingData.webmData.length
      })

      this.isRecording = false

      const processResult = await this.audioProcessor.processAudioData(recordingData)
      if (!processResult.success) {
        console.error('音声処理エラー:', processResult.error)
        return
      }

      wavFilePath = processResult.data
      console.log('音声処理完了、音声認識開始')

      const geminiClient = this.geminiService.getClient()
      const config = await this.configService.loadConfig()
      const transcriptionResult = await geminiClient.transcribe(
        wavFilePath,
        config.vocabulary.entries
      )

      console.log('音声認識完了:', transcriptionResult)

      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('transcription:result', transcriptionResult)
      }
    } catch (error) {
      console.error('録音データ処理中にエラーが発生しました:', error)
    } finally {
      if (wavFilePath) {
        await fs.unlink(wavFilePath).catch(() => {})
      }
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
      return true
    } catch (error) {
      console.error('クリップボードへの書き込みに失敗しました:', error)
      return false
    }
  }

  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeAllListeners('recording:data')
    ipcMain.removeAllListeners('recording:status')
    ipcMain.removeAllListeners('clipboard:writeText')
  }
}
