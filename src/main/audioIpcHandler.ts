import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { ErrorDialogService } from './errorDialogService'
import { LoggerService } from './loggerService'
import { TranscriptionJobService } from './transcriptionJobService'
import { WindowService } from './windowService'
import { createError } from '../shared/types/error'
import { RecordingData } from './types'

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private errorDialogService: ErrorDialogService
  private transcriptionJobService: TranscriptionJobService
  private loggerService: LoggerService
  private isRecording: boolean = false

  constructor() {
    this.errorDialogService = ErrorDialogService.getInstance()
    this.transcriptionJobService = TranscriptionJobService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
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
    this.transcriptionJobService.startRecording()
    recordingWindow.webContents.send('recording:start', {
      autoStopSeconds: WindowService.getExistingInstance().getRecordingAutoStopSeconds()
    })
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
      this.transcriptionJobService.stopRecording()
      return
    }

    this.isRecording = false
    this.transcriptionJobService.stopRecording()
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

  /** 録音データ受信ハンドラー */
  private handleRecordingData(_event: Electron.IpcMainEvent, recordingData: RecordingData): void {
    console.log('WebM音声データを受信しました:', {
      dataSize: recordingData.webmData.length
    })
    this.loggerService.infoWithDetails('WebM音声データを受信しました', {
      dataSize: recordingData.webmData.length
    })

    this.isRecording = false
    this.transcriptionJobService.submitRecordingData(recordingData)
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
    this.transcriptionJobService.cleanup()
  }
}
