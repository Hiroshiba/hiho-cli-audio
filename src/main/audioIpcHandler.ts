import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { LoggerService } from './loggerService'
import { TranscriptionJobService } from './transcriptionJobService'
import { WindowService } from './windowService'
import type { RecordingData } from './types'
import type {
  RecordingErrorPayload,
  RecordingSessionPayload,
  RecordingStartOptions,
  RecordingStopOptions,
  RecordingStoppedPayload
} from '../shared/types/recording'

const RecordingSessionPayloadSchema = z
  .object({
    sessionId: z.string().uuid()
  })
  .strict()

const RecordingDataSchema = RecordingSessionPayloadSchema.extend({
  webmData: z.instanceof(Uint8Array)
}).strict()

const RecordingErrorPayloadSchema = RecordingSessionPayloadSchema.extend({
  message: z.string().min(1),
  details: z.string().min(1)
}).strict()

const RecordingStoppedPayloadSchema = RecordingSessionPayloadSchema.extend({
  reason: z.enum(['requested', 'auto-stop'])
}).strict()

type RecordingControlState =
  | { kind: 'not-ready'; pendingStart: boolean }
  | { kind: 'idle' }
  | { kind: 'starting'; sessionId: string; stopAfterStart: boolean }
  | { kind: 'recording'; sessionId: string }
  | { kind: 'stopping'; sessionId: string; pendingStart: boolean }

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private transcriptionJobService: TranscriptionJobService
  private loggerService: LoggerService
  private recordingState: RecordingControlState = { kind: 'not-ready', pendingStart: false }

  constructor() {
    this.transcriptionJobService = TranscriptionJobService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:ready', this.handleRecordingReady.bind(this))
    ipcMain.on('recording:started', this.handleRecordingStarted.bind(this))
    ipcMain.on('recording:stopped', this.handleRecordingStopped.bind(this))
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
    ipcMain.on('recording:error', this.handleRecordingError.bind(this))
  }

  /** 録音開始 */
  startRecording(): void {
    const state = this.recordingState

    switch (state.kind) {
      case 'not-ready':
        if (state.pendingStart) {
          this.loggerService.info('録音開始は録音ウィンドウの準備完了待ちです')
          return
        }

        this.recordingState = { kind: 'not-ready', pendingStart: true }
        this.loggerService.info('録音ウィンドウの準備完了後に録音を開始します')
        return
      case 'idle':
        this.sendStartRecordingCommand()
        return
      case 'starting':
        this.loggerService.info('録音開始処理中です')
        return
      case 'recording':
        this.loggerService.info('録音は既に開始されています')
        return
      case 'stopping':
        if (state.pendingStart) {
          this.loggerService.info('録音停止完了後の録音開始は既に予約されています')
          return
        }

        this.recordingState = {
          kind: 'stopping',
          sessionId: state.sessionId,
          pendingStart: true
        }
        this.loggerService.info('録音停止完了後に次の録音を開始します')
        return
      default:
        throw createUnreachableStateError(state)
    }
  }

  /** 録音停止 */
  stopRecording(): void {
    const state = this.recordingState

    switch (state.kind) {
      case 'not-ready':
        if (state.pendingStart) {
          this.recordingState = { kind: 'not-ready', pendingStart: false }
          this.loggerService.info('録音ウィンドウ準備前の録音開始予約を取り消しました')
          return
        }

        this.loggerService.info('録音は開始されていません')
        return
      case 'idle':
        this.loggerService.info('録音は開始されていません')
        return
      case 'starting':
        if (state.stopAfterStart) {
          this.loggerService.info('録音開始完了後の録音停止は既に予約されています')
          return
        }

        this.recordingState = {
          kind: 'starting',
          sessionId: state.sessionId,
          stopAfterStart: true
        }
        this.loggerService.info('録音開始完了後に録音を停止します')
        return
      case 'recording':
        this.sendStopRecordingCommand(state.sessionId, false)
        return
      case 'stopping':
        this.loggerService.info('録音停止処理中です')
        return
      default:
        throw createUnreachableStateError(state)
    }
  }

  /** 録音トグル */
  toggleRecording(): void {
    const state = this.recordingState

    if (state.kind === 'starting' || state.kind === 'recording') {
      this.stopRecording()
      return
    }

    if (state.kind === 'not-ready' && state.pendingStart) {
      this.stopRecording()
      return
    }

    this.startRecording()
  }

  private handleRecordingReady(): void {
    const state = this.recordingState
    const shouldStart = state.kind === 'not-ready' && state.pendingStart

    if (state.kind !== 'not-ready' && state.kind !== 'idle') {
      this.loggerService.warnWithDetails('録音ウィンドウが録音中に準備完了を通知しました', {
        state
      })
      this.transcriptionJobService.notifyRecordingFailure('録音機能を再読み込みしました')
    }

    this.recordingState = { kind: 'idle' }
    this.loggerService.info('録音ウィンドウの準備完了を受信しました')

    if (shouldStart) {
      this.startRecording()
    }
  }

  private handleRecordingStarted(_event: Electron.IpcMainEvent, payload: unknown): void {
    const startedPayload: RecordingSessionPayload = RecordingSessionPayloadSchema.parse(payload)
    const state = this.recordingState

    if (state.kind !== 'starting' || state.sessionId !== startedPayload.sessionId) {
      this.loggerService.warnWithDetails('想定外の録音開始完了通知を受信しました', {
        payload: startedPayload,
        state
      })
      this.sendStopCommandForSession(startedPayload.sessionId)
      return
    }

    this.recordingState = {
      kind: 'recording',
      sessionId: startedPayload.sessionId
    }
    this.transcriptionJobService.startRecording()
    this.loggerService.infoWithDetails('録音開始を確定しました', startedPayload)

    if (state.stopAfterStart) {
      this.stopRecording()
    }
  }

  private handleRecordingStopped(_event: Electron.IpcMainEvent, payload: unknown): void {
    const stoppedPayload: RecordingStoppedPayload = RecordingStoppedPayloadSchema.parse(payload)
    this.finishRecordingSession(stoppedPayload.sessionId)
    this.loggerService.infoWithDetails('録音停止を確定しました', stoppedPayload)
  }

  private handleRecordingData(_event: Electron.IpcMainEvent, payload: unknown): void {
    const recordingData: RecordingData = RecordingDataSchema.parse(payload)

    console.log('WebM音声データを受信しました:', {
      sessionId: recordingData.sessionId,
      dataSize: recordingData.webmData.length
    })
    this.loggerService.infoWithDetails('WebM音声データを受信しました', {
      sessionId: recordingData.sessionId,
      dataSize: recordingData.webmData.length
    })

    if (this.isCurrentSession(recordingData.sessionId)) {
      this.finishRecordingSession(recordingData.sessionId)
    }

    this.transcriptionJobService.submitRecordingData(recordingData)
  }

  private handleRecordingError(_event: Electron.IpcMainEvent, payload: unknown): void {
    const recordingErrorPayload: RecordingErrorPayload = RecordingErrorPayloadSchema.parse(payload)

    if (this.isCurrentSession(recordingErrorPayload.sessionId)) {
      const state = this.recordingState
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.notifyRecordingFailure(recordingErrorPayload.message)

      if (state.kind === 'stopping' && state.pendingStart) {
        this.startRecording()
      }
    } else {
      this.transcriptionJobService.notifyFailure(recordingErrorPayload.message)
    }

    this.loggerService.error('録音処理に失敗しました', recordingErrorPayload)
  }

  private sendStartRecordingCommand(): void {
    const recordingWindow = this.getRecordingWindowForOperation('録音開始')
    if (recordingWindow == null) {
      this.transcriptionJobService.notifyRecordingFailure('録音機能に問題が発生しました')
      return
    }

    const sessionId = randomUUID()
    const options: RecordingStartOptions = {
      sessionId,
      autoStopSeconds: WindowService.getExistingInstance().getRecordingAutoStopSeconds()
    }
    this.recordingState = {
      kind: 'starting',
      sessionId,
      stopAfterStart: false
    }
    recordingWindow.webContents.send('recording:start', options)
    console.log('録音開始指示を送信しました')
    this.loggerService.infoWithDetails('録音開始指示を送信しました', options)
  }

  private sendStopRecordingCommand(sessionId: string, pendingStart: boolean): void {
    const recordingWindow = this.getRecordingWindowForOperation('録音停止')
    if (recordingWindow == null) {
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.notifyRecordingFailure('録音機能に問題が発生しました')
      return
    }

    this.recordingState = {
      kind: 'stopping',
      sessionId,
      pendingStart
    }
    this.sendStopCommand(recordingWindow, sessionId)
    console.log('録音停止指示を送信しました')
    this.loggerService.infoWithDetails('録音停止指示を送信しました', { sessionId })
  }

  private sendStopCommandForSession(sessionId: string): void {
    const recordingWindow = this.getRecordingWindowForOperation('録音停止')
    if (recordingWindow == null) {
      return
    }

    this.sendStopCommand(recordingWindow, sessionId)
  }

  private sendStopCommand(recordingWindow: BrowserWindow, sessionId: string): void {
    const options: RecordingStopOptions = { sessionId }
    recordingWindow.webContents.send('recording:stop', options)
  }

  private finishRecordingSession(sessionId: string): void {
    const state = this.recordingState

    if (state.kind === 'stopping' && state.sessionId === sessionId) {
      const pendingStart = state.pendingStart
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording()

      if (pendingStart) {
        this.startRecording()
      }

      return
    }

    if (state.kind === 'recording' && state.sessionId === sessionId) {
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording()
      return
    }

    if (state.kind === 'starting' && state.sessionId === sessionId) {
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording()
      return
    }

    this.loggerService.warnWithDetails('終了済み録音セッションの通知を無視しました', {
      sessionId,
      state
    })
  }

  private isCurrentSession(sessionId: string): boolean {
    const state = this.recordingState

    if (state.kind === 'starting' || state.kind === 'recording' || state.kind === 'stopping') {
      return state.sessionId === sessionId
    }

    return false
  }

  private getRecordingWindowForOperation(operationName: string): BrowserWindow | null {
    try {
      return WindowService.getExistingInstance().getRecordingWindow()
    } catch (error) {
      this.loggerService.error(`${operationName}時に録音ウィンドウを取得できません`, error)
      return null
    }
  }

  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeAllListeners('recording:ready')
    ipcMain.removeAllListeners('recording:started')
    ipcMain.removeAllListeners('recording:stopped')
    ipcMain.removeAllListeners('recording:data')
    ipcMain.removeAllListeners('recording:error')
    this.transcriptionJobService.cleanup()
  }
}

function createUnreachableStateError(state: never): Error {
  return new Error(`到達不能な録音状態です: ${JSON.stringify(state)}`)
}
