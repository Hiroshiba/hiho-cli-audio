import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import { LoggerService } from './loggerService'
import { TranscriptionJobService } from './transcriptionJobService'
import { WindowService } from './windowService'
import { RecordingData } from './types'
import type { RecordingErrorPayload } from '../shared/types/recording'

const RecordingErrorPayloadSchema = z
  .object({
    message: z.string().min(1),
    details: z.string().min(1)
  })
  .strict()

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private transcriptionJobService: TranscriptionJobService
  private loggerService: LoggerService
  private isRecording: boolean = false

  constructor() {
    this.transcriptionJobService = TranscriptionJobService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
    ipcMain.on('recording:error', this.handleRecordingError.bind(this))
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

  private handleRecordingError(_event: Electron.IpcMainEvent, payload: unknown): void {
    const recordingErrorPayload: RecordingErrorPayload = RecordingErrorPayloadSchema.parse(payload)

    this.isRecording = false
    this.transcriptionJobService.notifyRecordingFailure(recordingErrorPayload.message)
    this.loggerService.error('録音処理に失敗しました', recordingErrorPayload)
  }

  private getRecordingWindowForOperation(operationName: string): BrowserWindow | null {
    try {
      return WindowService.getExistingInstance().getRecordingWindow()
    } catch (error) {
      this.loggerService.error(`${operationName}時に録音ウィンドウを取得できません`, error)
      this.transcriptionJobService.notifyRecordingFailure('録音機能に問題が発生しました')
      return null
    }
  }

  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeAllListeners('recording:data')
    ipcMain.removeAllListeners('recording:error')
    this.transcriptionJobService.cleanup()
  }
}
