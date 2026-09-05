import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { LoggerService } from './loggerService'
import type { RecordingTargetResolver } from './recordingTargetResolver'
import { TranscriptionJobService } from './transcriptionJobService'
import { WindowService } from './windowService'
import type { RecordingData, RecordingTarget } from './types'
import type {
  RecordingErrorPayload,
  RecordingSessionPayload,
  RecordingStartOptions,
  RecordingStopOptions,
  RecordingStopReason,
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
  reason: z.enum(['requested', 'auto-stop', 'cancelled'])
}).strict()

const CANCELLED_SESSION_ID_LIMIT = 20

type RecordingControlState =
  | { kind: 'not-ready'; pendingStart: boolean }
  | { kind: 'idle' }
  | { kind: 'starting'; sessionId: string; stopAfterStart: boolean }
  | { kind: 'recording'; sessionId: string }
  | { kind: 'stopping'; sessionId: string; pendingStart: boolean }

type RecordingTargetResolverState =
  | { kind: 'uninitialized' }
  | { kind: 'initialized'; resolver: RecordingTargetResolver }

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private transcriptionJobService: TranscriptionJobService
  private loggerService: LoggerService
  private recordingState: RecordingControlState = { kind: 'not-ready', pendingStart: false }
  private recordingTargetResolverState: RecordingTargetResolverState = {
    kind: 'uninitialized'
  }
  private readonly targetsBySessionId = new Map<string, RecordingTarget>()
  private readonly targetResolutionPromises = new Map<string, Promise<RecordingTarget>>()
  private readonly targetResolutionControllers = new Map<string, AbortController>()
  private readonly cancelledSessionIds = new Set<string>()

  constructor() {
    this.transcriptionJobService = TranscriptionJobService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** 録音出力先の解決処理を初期化 */
  initializeRecordingTargetResolver(resolver: RecordingTargetResolver): void {
    if (this.recordingTargetResolverState.kind === 'initialized') {
      throw new Error('録音出力先の解決処理は既に初期化されています')
    }

    this.recordingTargetResolverState = { kind: 'initialized', resolver }
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:ready', this.handleRecordingReady.bind(this))
    ipcMain.on('recording:started', this.handleRecordingStarted.bind(this))
    ipcMain.on('recording:stopped', this.handleRecordingStopped.bind(this))
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
    ipcMain.on('recording:error', this.handleRecordingError.bind(this))
    ipcMain.on('status:cancel', this.handleStatusCancel.bind(this))
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
        this.startRecordingWithTargetResolution()
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

  private handleStatusCancel(): void {
    this.cancelRecording()
    this.transcriptionJobService.cancel()
  }

  private cancelRecording(): void {
    const sessionIds = new Set([
      ...this.targetsBySessionId.keys(),
      ...this.targetResolutionPromises.keys(),
      ...this.targetResolutionControllers.keys()
    ])
    for (const sessionId of sessionIds) {
      this.rememberCancelledSession(sessionId)
      this.abortTargetResolution(sessionId)
    }

    const state = this.recordingState

    switch (state.kind) {
      case 'not-ready':
        if (state.pendingStart) {
          this.recordingState = { kind: 'not-ready', pendingStart: false }
          this.loggerService.info('録音ウィンドウ準備前の録音開始予約をキャンセルしました')
        }
        return
      case 'idle':
        return
      case 'starting':
        this.rememberCancelledSession(state.sessionId)
        this.abortTargetResolution(state.sessionId)
        this.recordingState = {
          kind: 'stopping',
          sessionId: state.sessionId,
          pendingStart: false
        }
        if (!this.sendStopCommandForSession(state.sessionId, 'cancelled')) {
          this.finishRecordingSession(state.sessionId)
          this.forgetCancelledSession(state.sessionId)
        }
        this.loggerService.info('録音開始処理をキャンセルしました')
        return
      case 'recording':
        this.rememberCancelledSession(state.sessionId)
        this.abortTargetResolution(state.sessionId)
        this.recordingState = {
          kind: 'stopping',
          sessionId: state.sessionId,
          pendingStart: false
        }
        if (!this.sendStopCommandForSession(state.sessionId, 'cancelled')) {
          this.finishRecordingSession(state.sessionId)
          this.forgetCancelledSession(state.sessionId)
        }
        this.loggerService.info('録音をキャンセルしました')
        return
      case 'stopping':
        this.rememberCancelledSession(state.sessionId)
        this.abortTargetResolution(state.sessionId)
        this.recordingState = {
          kind: 'stopping',
          sessionId: state.sessionId,
          pendingStart: false
        }
        if (!this.sendStopCommandForSession(state.sessionId, 'cancelled')) {
          this.finishRecordingSession(state.sessionId)
          this.forgetCancelledSession(state.sessionId)
        }
        this.loggerService.info('録音停止処理をキャンセルしました')
        return
      default:
        throw createUnreachableStateError(state)
    }
  }

  private handleRecordingReady(): void {
    const state = this.recordingState
    const shouldStart = state.kind === 'not-ready' && state.pendingStart

    if (state.kind !== 'not-ready' && state.kind !== 'idle') {
      this.rememberCancelledSession(state.sessionId)
      this.abortTargetResolution(state.sessionId)
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

    if (this.cancelledSessionIds.has(startedPayload.sessionId)) {
      this.abortTargetResolution(startedPayload.sessionId)
      if (!this.sendStopCommandForSession(startedPayload.sessionId, 'cancelled')) {
        if (this.isCurrentSession(startedPayload.sessionId)) {
          this.finishRecordingSession(startedPayload.sessionId)
        }
        this.forgetCancelledSession(startedPayload.sessionId)
      }
      this.loggerService.infoWithDetails('キャンセル済み録音セッションの開始通知を無視しました', {
        payload: startedPayload
      })
      return
    }

    if (state.kind !== 'starting' || state.sessionId !== startedPayload.sessionId) {
      this.loggerService.warnWithDetails('想定外の録音開始完了通知を受信しました', {
        payload: startedPayload,
        state
      })
      this.sendStopCommandForSession(startedPayload.sessionId, 'requested')
      return
    }

    this.recordingState = {
      kind: 'recording',
      sessionId: startedPayload.sessionId
    }
    this.transcriptionJobService.startRecording(startedPayload.sessionId)
    const target = this.targetsBySessionId.get(startedPayload.sessionId)
    if (target != null) {
      this.transcriptionJobService.updateRecordingTarget(startedPayload.sessionId, target)
    }
    this.loggerService.infoWithDetails('録音開始を確定しました', startedPayload)

    if (state.stopAfterStart) {
      this.stopRecording()
    }
  }

  private handleRecordingStopped(_event: Electron.IpcMainEvent, payload: unknown): void {
    const stoppedPayload: RecordingStoppedPayload = RecordingStoppedPayloadSchema.parse(payload)
    if (stoppedPayload.reason === 'cancelled') {
      this.rememberCancelledSession(stoppedPayload.sessionId)
      this.abortTargetResolution(stoppedPayload.sessionId)
    }

    this.finishRecordingSession(stoppedPayload.sessionId)
    if (stoppedPayload.reason === 'cancelled') {
      this.forgetCancelledSession(stoppedPayload.sessionId)
    }
    this.loggerService.infoWithDetails('録音停止を確定しました', stoppedPayload)
  }

  private handleRecordingData(_event: Electron.IpcMainEvent, payload: unknown): void {
    const recordingData: RecordingData = RecordingDataSchema.parse(payload)

    if (this.cancelledSessionIds.has(recordingData.sessionId)) {
      this.abortTargetResolution(recordingData.sessionId)
      this.forgetCancelledSession(recordingData.sessionId)
      this.loggerService.infoWithDetails('キャンセル済み録音セッションの音声データを破棄しました', {
        sessionId: recordingData.sessionId,
        dataSize: recordingData.webmData.length
      })
      return
    }

    const targetPromise = this.targetResolutionPromises.get(recordingData.sessionId)
    if (targetPromise == null) {
      throw new Error(`録音セッションの出力先解決処理が見つかりません: ${recordingData.sessionId}`)
    }

    this.targetsBySessionId.delete(recordingData.sessionId)
    this.targetResolutionPromises.delete(recordingData.sessionId)

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

    this.transcriptionJobService.submitRecordingData(recordingData, targetPromise)
  }

  private handleRecordingError(_event: Electron.IpcMainEvent, payload: unknown): void {
    const recordingErrorPayload: RecordingErrorPayload = RecordingErrorPayloadSchema.parse(payload)

    if (this.cancelledSessionIds.has(recordingErrorPayload.sessionId)) {
      this.abortTargetResolution(recordingErrorPayload.sessionId)
      if (this.isCurrentSession(recordingErrorPayload.sessionId)) {
        this.finishRecordingSession(recordingErrorPayload.sessionId)
      }
      this.forgetCancelledSession(recordingErrorPayload.sessionId)
      this.loggerService.infoWithDetails('キャンセル済み録音セッションのエラー通知を無視しました', {
        sessionId: recordingErrorPayload.sessionId
      })
      return
    }

    this.rememberCancelledSession(recordingErrorPayload.sessionId)
    this.abortTargetResolution(recordingErrorPayload.sessionId)

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

  private startRecordingWithTargetResolution(): void {
    const resolver = this.getRecordingTargetResolver()
    const sessionId = randomUUID()
    const controller = new AbortController()
    this.targetResolutionControllers.set(sessionId, controller)
    const targetPromise = this.resolveRecordingTarget(sessionId, resolver, controller.signal)
    this.targetResolutionPromises.set(sessionId, targetPromise)
    void targetPromise.catch((error: unknown) => {
      this.handleTargetResolutionError(sessionId, controller.signal, error)
    })
    this.sendStartRecordingCommand(sessionId)
  }

  private async resolveRecordingTarget(
    sessionId: string,
    resolver: RecordingTargetResolver,
    signal: AbortSignal
  ): Promise<RecordingTarget> {
    try {
      const target = await resolver.resolveAtRecordingStart(signal)

      if (signal.aborted || this.cancelledSessionIds.has(sessionId)) {
        throw signal.reason ?? new Error('録音出力先の解決がキャンセルされました')
      }

      if (this.targetResolutionPromises.has(sessionId)) {
        this.targetsBySessionId.set(sessionId, target)
        this.transcriptionJobService.updateRecordingTarget(sessionId, target)
      }

      return target
    } finally {
      this.targetResolutionControllers.delete(sessionId)
    }
  }

  private handleTargetResolutionError(
    sessionId: string,
    signal: AbortSignal,
    error: unknown
  ): void {
    if (signal.aborted || this.cancelledSessionIds.has(sessionId)) {
      return
    }

    this.targetsBySessionId.delete(sessionId)
    const state = this.recordingState
    if (this.isCurrentSession(sessionId)) {
      this.rememberCancelledSession(sessionId)
      this.abortTargetResolution(sessionId)
      this.transcriptionJobService.notifyRecordingFailure('録音出力先を解決できませんでした')

      if (state.kind !== 'stopping') {
        this.recordingState = {
          kind: 'stopping',
          sessionId,
          pendingStart: false
        }
      }

      if (!this.sendStopCommandForSession(sessionId, 'cancelled')) {
        this.finishRecordingSession(sessionId)
        this.forgetCancelledSession(sessionId)
      }
    }

    this.loggerService.error('録音出力先の解決に失敗しました', error)
  }

  private getRecordingTargetResolver(): RecordingTargetResolver {
    const state = this.recordingTargetResolverState
    if (state.kind === 'initialized') {
      return state.resolver
    }

    throw new Error('録音出力先の解決処理が初期化されていません')
  }

  private sendStartRecordingCommand(sessionId: string): void {
    if (this.cancelledSessionIds.has(sessionId)) {
      this.abortTargetResolution(sessionId)
      return
    }

    const recordingWindow = this.getRecordingWindowForOperation('録音開始')
    if (recordingWindow == null) {
      this.abortTargetResolution(sessionId)
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.notifyRecordingFailure('録音機能に問題が発生しました')
      return
    }

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
      this.rememberCancelledSession(sessionId)
      this.abortTargetResolution(sessionId)
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.notifyRecordingFailure('録音機能に問題が発生しました')
      return
    }

    this.recordingState = {
      kind: 'stopping',
      sessionId,
      pendingStart
    }
    this.sendStopCommand(recordingWindow, sessionId, 'requested')
    console.log('録音停止指示を送信しました')
    this.loggerService.infoWithDetails('録音停止指示を送信しました', { sessionId })
  }

  private sendStopCommandForSession(sessionId: string, reason: RecordingStopReason): boolean {
    const recordingWindow = this.getRecordingWindowForOperation('録音停止')
    if (recordingWindow == null) {
      this.abortTargetResolution(sessionId)
      return false
    }

    this.sendStopCommand(recordingWindow, sessionId, reason)
    return true
  }

  private sendStopCommand(
    recordingWindow: BrowserWindow,
    sessionId: string,
    reason: RecordingStopReason
  ): void {
    const options: RecordingStopOptions = { sessionId, reason }
    recordingWindow.webContents.send('recording:stop', options)
  }

  private finishRecordingSession(sessionId: string): void {
    const state = this.recordingState

    if (state.kind === 'stopping' && state.sessionId === sessionId) {
      const pendingStart = state.pendingStart
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording(sessionId)

      if (pendingStart) {
        this.startRecording()
      }

      return
    }

    if (state.kind === 'recording' && state.sessionId === sessionId) {
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording(sessionId)
      return
    }

    if (state.kind === 'starting' && state.sessionId === sessionId) {
      this.recordingState = { kind: 'idle' }
      this.transcriptionJobService.stopRecording(sessionId)
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

  private abortTargetResolution(sessionId: string): void {
    const controller = this.targetResolutionControllers.get(sessionId)
    if (controller != null) {
      controller.abort()
      this.targetResolutionControllers.delete(sessionId)
    }

    this.targetResolutionPromises.delete(sessionId)
    this.targetsBySessionId.delete(sessionId)
  }

  /** クリーンアップ */
  cleanup(): void {
    this.cancelRecording()
    ipcMain.removeAllListeners('recording:ready')
    ipcMain.removeAllListeners('recording:started')
    ipcMain.removeAllListeners('recording:stopped')
    ipcMain.removeAllListeners('recording:data')
    ipcMain.removeAllListeners('recording:error')
    ipcMain.removeAllListeners('status:cancel')
    this.targetsBySessionId.clear()
    this.targetResolutionPromises.clear()
    for (const controller of this.targetResolutionControllers.values()) {
      controller.abort()
    }
    this.targetResolutionControllers.clear()
    this.cancelledSessionIds.clear()
    this.transcriptionJobService.cleanup()
  }

  private rememberCancelledSession(sessionId: string): void {
    this.cancelledSessionIds.add(sessionId)

    while (this.cancelledSessionIds.size > CANCELLED_SESSION_ID_LIMIT) {
      const oldestSessionId = this.cancelledSessionIds.values().next().value
      if (oldestSessionId == null) {
        throw new Error('キャンセル済み録音セッションIDの削除に失敗しました')
      }

      this.cancelledSessionIds.delete(oldestSessionId)
    }
  }

  private forgetCancelledSession(sessionId: string): void {
    this.cancelledSessionIds.delete(sessionId)
  }
}

function createUnreachableStateError(state: never): Error {
  return new Error(`到達不能な録音状態です: ${JSON.stringify(state)}`)
}
