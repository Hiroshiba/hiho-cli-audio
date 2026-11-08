import { app, clipboard, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { z } from 'zod'
import { AudioProcessor } from './audioProcessor'
import { ConfigService } from './configService'
import { GeminiService } from './geminiService'
import { HistoryService } from './historyService'
import { LoggerService } from './loggerService'
import type {
  AudioProcessingFailure,
  ProcessedAudioData,
  RecordingData,
  RecordingTarget,
  Result,
  StatusWindowState
} from './types'
import type { RecordingTargetSummary } from '../shared/types/status'
import type { HistoryItem } from '../shared/types/history'
import { WindowService } from './windowService'

const CLIPBOARD_COMPLETED_MESSAGE = 'クリップボードにコピーしました'
const HERDR_COMPLETED_MESSAGE = 'Herdrへ入力しました'
const TRANSCRIPTION_FAILED_MESSAGE = '文字起こしに失敗しました'
const HERDR_FAILED_MESSAGE = 'Herdrへの入力に失敗しました'
const COMPLETED_NOTIFICATION_MILLISECONDS = 3000
const FAILED_NOTIFICATION_MILLISECONDS = 5000

type TranscriptionJobNotification =
  | { id: string; kind: 'completed'; message: string; durationMilliseconds: number }
  | { id: string; kind: 'failed'; message: string; durationMilliseconds: number }

type TranscriptionOutput = { kind: 'clipboard' } | { kind: 'herdr' } | { kind: 'herdr-failed' }

type RecordingState =
  | { kind: 'inactive' }
  | {
      kind: 'recording'
      sessionId: string
      recordingStartedAt: string
      target: RecordingTargetSummary
      inputWarning: boolean
    }

type TranscriptionJobState = {
  controller: AbortController
  cancelled: boolean
  committed: boolean
}

type TranscriptionJobInput =
  | {
      kind: 'recording'
      recordingData: RecordingData
      targetPromise: Promise<RecordingTarget>
      historyId: string
      createdAt: string
    }
  | { kind: 'retry'; item: HistoryItem }

/** 文字起こしジョブ管理サービス */
export class TranscriptionJobService {
  private static instance: TranscriptionJobService | null = null
  private readonly jobsById = new Map<string, TranscriptionJobState>()
  private readonly activeJobPromises = new Set<Promise<void>>()
  private readonly pendingRetryStarts = new Set<Promise<void>>()
  private readonly cancelledRetryHistoryIds = new Set<string>()
  private readonly retryHistoryIds = new Set<string>()
  private readonly audioProcessor: AudioProcessor
  private readonly configService: ConfigService
  private readonly geminiService: GeminiService
  private readonly historyService: HistoryService
  private readonly loggerService: LoggerService
  private isCleaningUp = false
  private notification: TranscriptionJobNotification | null = null
  private notificationTimer: ReturnType<typeof setTimeout> | null = null
  private recordingState: RecordingState = { kind: 'inactive' }

  private constructor(userDataDir: string) {
    this.audioProcessor = new AudioProcessor(userDataDir)
    this.configService = ConfigService.getInstance()
    this.geminiService = GeminiService.getInstance()
    this.historyService = HistoryService.getInstance()
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): TranscriptionJobService {
    if (TranscriptionJobService.instance == null) {
      TranscriptionJobService.instance = new TranscriptionJobService(app.getPath('userData'))
    }

    return TranscriptionJobService.instance
  }

  /** 録音開始状態を通知 */
  startRecording(sessionId: string): void {
    if (this.recordingState.kind === 'recording') {
      throw new Error('録音状態は既に開始されています')
    }

    this.recordingState = {
      kind: 'recording',
      sessionId,
      recordingStartedAt: new Date().toISOString(),
      target: { kind: 'pending' },
      inputWarning: false
    }
    this.clearNotificationTimer()
    this.notification = null
    this.publishStatus()
  }

  /** 録音出力先の解決結果を通知 */
  updateRecordingTarget(sessionId: string, target: RecordingTarget): void {
    if (this.recordingState.kind !== 'recording' || this.recordingState.sessionId !== sessionId) {
      return
    }

    this.recordingState.target = createRecordingTargetSummary(target)
    this.publishStatus()
  }

  /** 録音入力の警告状態を更新 */
  updateRecordingInputWarning(sessionId: string, state: 'no-input' | 'input-detected'): boolean {
    if (this.recordingState.kind !== 'recording' || this.recordingState.sessionId !== sessionId) {
      return false
    }

    if (state === 'no-input' && this.recordingState.inputWarning) {
      return false
    }

    if (state === 'input-detected' && !this.recordingState.inputWarning) {
      return false
    }

    this.recordingState.inputWarning = state === 'no-input'
    this.publishStatus()
    return true
  }

  /** 録音停止状態を通知 */
  stopRecording(sessionId: string): void {
    if (this.recordingState.kind === 'inactive' || this.recordingState.sessionId !== sessionId) {
      return
    }

    this.recordingState = { kind: 'inactive' }
    this.publishStatus()
  }

  /** 録音失敗状態を通知 */
  notifyRecordingFailure(message: string): void {
    this.recordingState = { kind: 'inactive' }
    this.notifyFailure(message)
  }

  /** 失敗状態を通知 */
  notifyFailure(message: string): void {
    this.setNotification({
      id: randomUUID(),
      kind: 'failed',
      message,
      durationMilliseconds: FAILED_NOTIFICATION_MILLISECONDS
    })
  }

  /** 録音データから文字起こしジョブを開始 */
  submitRecordingData(recordingData: RecordingData, targetPromise: Promise<RecordingTarget>): void {
    if (this.isCleaningUp) {
      this.loggerService.info('終了処理中の録音データを破棄しました')
      return
    }

    const jobId = randomUUID()
    const createdAt = new Date().toISOString()
    this.jobsById.set(jobId, {
      controller: new AbortController(),
      cancelled: false,
      committed: false
    })
    this.publishStatus()

    this.loggerService.infoWithDetails('文字起こしジョブを開始しました', {
      jobId,
      dataSize: recordingData.webmData.length
    })

    this.trackJob(
      this.runJob(jobId, {
        kind: 'recording',
        recordingData,
        targetPromise,
        historyId: jobId,
        createdAt
      })
    )
  }

  /** 失敗履歴から再認識を開始する */
  async retryHistoryItem(historyId: string): Promise<void> {
    if (this.isCleaningUp) {
      throw new Error('終了処理中は再認識を開始できません')
    }
    if (this.retryHistoryIds.has(historyId)) {
      throw new Error(`履歴項目は既に再認識中です: ${historyId}`)
    }

    this.retryHistoryIds.add(historyId)
    const startPromise = this.startRetryJob(historyId)
    this.pendingRetryStarts.add(startPromise)
    try {
      await startPromise
    } finally {
      this.pendingRetryStarts.delete(startPromise)
    }
  }

  /** 実行中ジョブの終了と音声保護の解放を待つ */
  async waitForJobs(): Promise<void> {
    await Promise.allSettled([...this.pendingRetryStarts])
    await Promise.all([...this.activeJobPromises])
  }

  /** 録音と実行中の文字起こしをキャンセル */
  cancel(): void {
    for (const historyId of this.retryHistoryIds) {
      this.cancelledRetryHistoryIds.add(historyId)
    }
    for (const job of this.jobsById.values()) {
      if (!job.committed) {
        job.cancelled = true
        job.controller.abort()
      }
    }

    this.clearNotificationTimer()
    this.notification = null
    this.recordingState = { kind: 'inactive' }
    this.publishStatus()
  }

  /** 実行中の文字起こしジョブがあるかを返す */
  hasActiveJobs(): boolean {
    return this.jobsById.size > 0 || this.pendingRetryStarts.size > 0
  }

  /** サービスをクリーンアップ */
  cleanup(): void {
    this.isCleaningUp = true
    for (const historyId of this.retryHistoryIds) {
      this.cancelledRetryHistoryIds.add(historyId)
    }
    for (const job of this.jobsById.values()) {
      if (!job.committed) {
        job.cancelled = true
        job.controller.abort()
      }
    }

    this.clearNotificationTimer()
    ipcMain.removeHandler('status:get')
    ipcMain.removeHandler('history:retry')
    this.notification = null
    this.recordingState = { kind: 'inactive' }
    this.publishStatus()
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('status:get', this.handleGetStatus.bind(this))
    ipcMain.handle('history:retry', this.handleRetryHistoryItem.bind(this))
  }

  private async handleRetryHistoryItem(
    _event: Electron.IpcMainInvokeEvent,
    historyId: unknown
  ): Promise<void> {
    const validatedHistoryId = z.string().min(1).parse(historyId)
    await this.retryHistoryItem(validatedHistoryId)
  }

  private async startRetryJob(historyId: string): Promise<void> {
    let item: HistoryItem
    try {
      item = await this.historyService.beginRetry(historyId)
    } catch (error) {
      this.retryHistoryIds.delete(historyId)
      this.cancelledRetryHistoryIds.delete(historyId)
      throw error
    }

    if (this.isCleaningUp || this.cancelledRetryHistoryIds.has(historyId)) {
      await this.historyService.finishRetry(historyId, null)
      this.retryHistoryIds.delete(historyId)
      this.cancelledRetryHistoryIds.delete(historyId)
      return
    }

    const jobId = randomUUID()
    this.jobsById.set(jobId, {
      controller: new AbortController(),
      cancelled: false,
      committed: false
    })
    this.publishStatus()
    this.trackJob(this.runJob(jobId, { kind: 'retry', item }))
  }

  private handleGetStatus(): StatusWindowState {
    return this.createStatusWindowState()
  }

  private async runJob(jobId: string, input: TranscriptionJobInput): Promise<void> {
    let processedAudio: ProcessedAudioData | null = null
    let failedAudioPath: string | null = input.kind === 'retry' ? input.item.audioPath : null
    const job = this.jobsById.get(jobId)
    if (job == null) {
      throw new Error(`文字起こしジョブが見つかりません: ${jobId}`)
    }

    try {
      const target: RecordingTarget =
        input.kind === 'recording' ? await input.targetPromise : { kind: 'clipboard' }
      this.throwIfCancelled(jobId)
      const processResult =
        input.kind === 'recording'
          ? await this.audioProcessor.processAudioData(
              input.recordingData,
              jobId,
              job.controller.signal
            )
          : await this.prepareRetryAudio(input.item, jobId, job.controller.signal)
      if (!processResult.success) {
        failedAudioPath = processResult.error.savedWebmPath
        throw new Error(processResult.error.message)
      }

      processedAudio = processResult.data
      failedAudioPath = processedAudio.wavFilePath
      this.throwIfCancelled(jobId)
      const config = this.configService.getConfig()
      const geminiClient = this.geminiService.getClient()
      const transcriptionResult = await geminiClient.transcribe(
        processedAudio.wavFilePath,
        {
          language: config.transcription.language,
          mode: config.transcription.mode,
          customVocabulary: config.transcription.customVocabulary
        },
        job.controller.signal
      )
      this.throwIfCancelled(jobId)

      const output = await this.outputTranscription(
        target,
        transcriptionResult.text,
        job.controller.signal
      )
      this.throwIfCancelled(jobId)
      await this.historyService.recordCompletedItem({
        id: input.kind === 'recording' ? input.historyId : input.item.id,
        createdAt: input.kind === 'recording' ? input.createdAt : input.item.createdAt,
        completedAt: new Date().toISOString(),
        transcript: transcriptionResult.text,
        audioPath: processedAudio.wavFilePath,
        sourceWebmPath: processedAudio.sourceWebmPath
      })
      job.committed = true
      this.loggerService.infoWithDetails('文字起こしジョブが完了しました', {
        jobId,
        audioId: processedAudio.id,
        wavFilePath: processedAudio.wavFilePath,
        textLength: transcriptionResult.text.length
      })

      this.completeJob(jobId, createTranscriptionNotification(output))
    } catch (error) {
      if (job.committed) {
        throw error
      }
      if (this.isCancelled(jobId)) {
        this.loggerService.infoWithDetails('キャンセルされた文字起こしジョブを終了しました', {
          jobId,
          error: this.formatError(error)
        })
        return
      }

      this.loggerService.error('文字起こしジョブに失敗しました', {
        jobId,
        error: this.formatError(error)
      })

      if (input.kind === 'recording') {
        this.throwIfCancelled(jobId)
        try {
          await this.historyService.recordFailedItem({
            id: input.historyId,
            createdAt: input.createdAt,
            completedAt: new Date().toISOString(),
            audioPath: failedAudioPath,
            sourceWebmPath: processedAudio?.sourceWebmPath ?? null
          })
        } catch (historyError) {
          if (!this.isCancelled(jobId)) {
            this.notifyFailure(TRANSCRIPTION_FAILED_MESSAGE)
          }
          throw historyError
        }
      }
      if (this.isCancelled(jobId)) {
        return
      }

      this.completeJob(jobId, {
        id: randomUUID(),
        kind: 'failed',
        message: TRANSCRIPTION_FAILED_MESSAGE,
        durationMilliseconds: FAILED_NOTIFICATION_MILLISECONDS
      })
    } finally {
      try {
        if (input.kind === 'retry') {
          try {
            await this.historyService.finishRetry(
              input.item.id,
              processedAudio?.sourceWebmPath == null ? null : processedAudio.wavFilePath
            )
          } finally {
            this.retryHistoryIds.delete(input.item.id)
            this.cancelledRetryHistoryIds.delete(input.item.id)
          }
        }
      } finally {
        this.finishJob(jobId)
      }
    }
  }

  private async prepareRetryAudio(
    item: HistoryItem,
    jobId: string,
    signal: AbortSignal
  ): Promise<Result<ProcessedAudioData, AudioProcessingFailure>> {
    if (item.audioPath == null) {
      throw new Error(`再認識する音声がありません: ${item.id}`)
    }
    if (extname(item.audioPath) === '.webm') {
      return await this.audioProcessor.processSavedWebm(item.audioPath, jobId, signal)
    }
    if (extname(item.audioPath) === '.wav') {
      return {
        success: true,
        data: { id: jobId, wavFilePath: item.audioPath, sourceWebmPath: null }
      }
    }

    throw new Error(`再認識できない音声形式です: ${item.audioPath}`)
  }

  private async outputTranscription(
    target: RecordingTarget,
    transcript: string,
    signal: AbortSignal
  ): Promise<TranscriptionOutput> {
    switch (target.kind) {
      case 'clipboard':
        throwIfAborted(signal)
        clipboard.writeText(transcript)
        return { kind: 'clipboard' }
      case 'herdr': {
        const text = transcript.replace(/\r\n|\r|\n/g, ' ')
        try {
          throwIfAborted(signal)
          await target.transport.run(target.pane, text, signal)
          throwIfAborted(signal)
        } catch (error) {
          if (signal.aborted) {
            throw error
          }

          this.loggerService.warnWithDetails(
            'Herdrへの入力に失敗しました。文字起こし結果を成功履歴へ保存します',
            error
          )
          return { kind: 'herdr-failed' }
        }
        return { kind: 'herdr' }
      }
      default:
        throw createUnreachableRecordingTargetError(target)
    }
  }

  private completeJob(jobId: string, notification: TranscriptionJobNotification): void {
    const job = this.jobsById.get(jobId)
    if (job == null) {
      throw new Error(`未登録の文字起こしジョブが完了しました: ${jobId}`)
    }

    if ((job.cancelled || job.controller.signal.aborted) && !job.committed) {
      return
    }

    if (this.isCleaningUp) {
      this.loggerService.infoWithDetails('終了処理中の文字起こしジョブ完了通知を破棄しました', {
        jobId,
        notificationKind: notification.kind
      })
      return
    }

    this.setNotification(notification)
  }

  private trackJob(jobPromise: Promise<void>): void {
    const settled = jobPromise.catch((error: unknown) => {
      this.loggerService.error('文字起こしジョブの終了処理に失敗しました', error)
    })
    this.activeJobPromises.add(settled)
    void settled.then(() => {
      this.activeJobPromises.delete(settled)
    })
  }

  private finishJob(jobId: string): void {
    if (this.jobsById.delete(jobId) && !this.isCleaningUp) {
      this.publishStatus()
    }
  }

  private isCancelled(jobId: string): boolean {
    const job = this.jobsById.get(jobId)
    return job == null || job.cancelled || job.controller.signal.aborted || this.isCleaningUp
  }

  private throwIfCancelled(jobId: string): void {
    const job = this.jobsById.get(jobId)
    if (job == null) {
      throw new Error(`文字起こしジョブが見つかりません: ${jobId}`)
    }

    throwIfAborted(job.controller.signal)
    if (job.cancelled || this.isCleaningUp) {
      throw new Error('文字起こしジョブがキャンセルされました')
    }
  }

  private setNotification(notification: TranscriptionJobNotification): void {
    this.clearNotificationTimer()
    this.notification = notification
    this.publishStatus()

    this.notificationTimer = setTimeout(() => {
      if (this.notification == null || this.notification.id !== notification.id) {
        return
      }

      this.notification = null
      this.notificationTimer = null
      this.publishStatus()
    }, notification.durationMilliseconds)
  }

  private clearNotificationTimer(): void {
    if (this.notificationTimer == null) {
      return
    }

    clearTimeout(this.notificationTimer)
    this.notificationTimer = null
  }

  private publishStatus(): void {
    const status = this.createStatusWindowState()

    try {
      const windowService = WindowService.getExistingInstance()
      windowService.getStatusWindow().webContents.send('status:update', status)

      if (status.kind === 'idle') {
        windowService.hideStatusWindow()
      } else {
        windowService.showStatusWindow()
      }
    } catch (error) {
      this.loggerService.error('状態ウィンドウへの通知に失敗しました', error)
    }
  }

  private createStatusWindowState(): StatusWindowState {
    const processingJobCount = [...this.jobsById.values()].filter((job) => !job.cancelled).length

    if (this.recordingState.kind === 'recording') {
      return {
        kind: 'recording',
        recordingStartedAt: this.recordingState.recordingStartedAt,
        processingJobCount,
        target: this.recordingState.target,
        inputWarning: this.recordingState.inputWarning
      }
    }

    if (processingJobCount > 0) {
      return {
        kind: 'transcribing',
        processingJobCount
      }
    }

    if (this.notification != null) {
      return {
        kind: this.notification.kind,
        message: this.notification.message,
        processingJobCount
      }
    }

    return {
      kind: 'idle',
      processingJobCount
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack ?? error.message
    }

    return String(error)
  }
}

function createRecordingTargetSummary(target: RecordingTarget): RecordingTargetSummary {
  switch (target.kind) {
    case 'clipboard':
      return { kind: 'clipboard' }
    case 'herdr':
      return { kind: 'herdr', paneId: target.pane.paneId }
    default:
      throw createUnreachableRecordingTargetError(target)
  }
}

function createUnreachableRecordingTargetError(target: never): Error {
  return new Error(`到達不能な録音出力先です: ${JSON.stringify(target)}`)
}

function createTranscriptionNotification(
  output: TranscriptionOutput
): TranscriptionJobNotification {
  switch (output.kind) {
    case 'clipboard':
      return {
        id: randomUUID(),
        kind: 'completed',
        message: CLIPBOARD_COMPLETED_MESSAGE,
        durationMilliseconds: COMPLETED_NOTIFICATION_MILLISECONDS
      }
    case 'herdr':
      return {
        id: randomUUID(),
        kind: 'completed',
        message: HERDR_COMPLETED_MESSAGE,
        durationMilliseconds: COMPLETED_NOTIFICATION_MILLISECONDS
      }
    case 'herdr-failed':
      return {
        id: randomUUID(),
        kind: 'failed',
        message: HERDR_FAILED_MESSAGE,
        durationMilliseconds: FAILED_NOTIFICATION_MILLISECONDS
      }
    default:
      throw createUnreachableTranscriptionOutputError(output)
  }
}

function createUnreachableTranscriptionOutputError(output: never): Error {
  return new Error(`到達不能な文字起こし出力です: ${JSON.stringify(output)}`)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('文字起こしがキャンセルされました')
  }
}
