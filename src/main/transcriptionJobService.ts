import { app, clipboard, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { AudioProcessor } from './audioProcessor'
import { ConfigService } from './configService'
import { GeminiService } from './geminiService'
import { HistoryService } from './historyService'
import { LoggerService } from './loggerService'
import type { ProcessedAudioData, RecordingData, RecordingTarget, StatusWindowState } from './types'
import type { RecordingTargetSummary } from '../shared/types/status'
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
    }

type TranscriptionJobState = {
  controller: AbortController
  cancelled: boolean
}

/** 文字起こしジョブ管理サービス */
export class TranscriptionJobService {
  private static instance: TranscriptionJobService | null = null
  private readonly jobsById = new Map<string, TranscriptionJobState>()
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
      target: { kind: 'pending' }
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
      cancelled: false
    })
    this.publishStatus()

    this.loggerService.infoWithDetails('文字起こしジョブを開始しました', {
      jobId,
      dataSize: recordingData.webmData.length
    })

    void this.runJob(jobId, createdAt, recordingData, targetPromise)
  }

  /** 録音と実行中の文字起こしをキャンセル */
  cancel(): void {
    for (const job of this.jobsById.values()) {
      job.cancelled = true
      job.controller.abort()
    }

    this.clearNotificationTimer()
    this.notification = null
    this.recordingState = { kind: 'inactive' }
    this.publishStatus()
  }

  /** サービスをクリーンアップ */
  cleanup(): void {
    this.isCleaningUp = true
    for (const job of this.jobsById.values()) {
      job.cancelled = true
      job.controller.abort()
    }

    this.clearNotificationTimer()
    ipcMain.removeHandler('status:get')
    this.notification = null
    this.recordingState = { kind: 'inactive' }
    this.publishStatus()
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('status:get', this.handleGetStatus.bind(this))
  }

  private handleGetStatus(): StatusWindowState {
    return this.createStatusWindowState()
  }

  private async runJob(
    jobId: string,
    createdAt: string,
    recordingData: RecordingData,
    targetPromise: Promise<RecordingTarget>
  ): Promise<void> {
    let processedAudio: ProcessedAudioData | null = null
    const job = this.jobsById.get(jobId)
    if (job == null) {
      throw new Error(`文字起こしジョブが見つかりません: ${jobId}`)
    }

    try {
      const target = await targetPromise
      this.throwIfCancelled(jobId)
      const processResult = await this.audioProcessor.processAudioData(
        recordingData,
        jobId,
        job.controller.signal
      )
      this.throwIfCancelled(jobId)
      if (!processResult.success) {
        throw new Error(processResult.error)
      }

      processedAudio = processResult.data
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

      this.loggerService.infoWithDetails('文字起こしジョブが完了しました', {
        jobId,
        audioId: processedAudio.id,
        wavFilePath: processedAudio.wavFilePath,
        textLength: transcriptionResult.text.length
      })

      await this.recordCompletedHistoryItem(
        processedAudio,
        createdAt,
        transcriptionResult.text,
        job.controller.signal
      )
      this.throwIfCancelled(jobId)

      this.completeJob(jobId, createTranscriptionNotification(output))
    } catch (error) {
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

      try {
        await this.recordFailedHistoryItem(jobId, createdAt, processedAudio, job.controller.signal)
      } catch (historyError) {
        if (this.isCancelled(jobId)) {
          return
        }

        throw historyError
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
      this.finishJob(jobId)
    }
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

  private async recordCompletedHistoryItem(
    processedAudio: ProcessedAudioData,
    createdAt: string,
    transcript: string,
    signal: AbortSignal
  ): Promise<void> {
    try {
      throwIfAborted(signal)
      await this.historyService.recordCompletedItem({
        id: processedAudio.id,
        createdAt,
        completedAt: new Date().toISOString(),
        transcript,
        audioPath: processedAudio.wavFilePath
      })
      throwIfAborted(signal)
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      this.loggerService.error('成功履歴の保存に失敗しました', {
        historyId: processedAudio.id,
        error: this.formatError(error)
      })
    }
  }

  private async recordFailedHistoryItem(
    jobId: string,
    createdAt: string,
    processedAudio: ProcessedAudioData | null,
    signal: AbortSignal
  ): Promise<void> {
    const historyId = processedAudio == null ? jobId : processedAudio.id
    const audioPath = processedAudio == null ? null : processedAudio.wavFilePath

    try {
      throwIfAborted(signal)
      await this.historyService.recordFailedItem({
        id: historyId,
        createdAt,
        completedAt: new Date().toISOString(),
        audioPath
      })
      throwIfAborted(signal)
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      this.loggerService.error('失敗履歴の保存に失敗しました', {
        historyId,
        error: this.formatError(error)
      })
    }
  }

  private completeJob(jobId: string, notification: TranscriptionJobNotification): void {
    const job = this.jobsById.get(jobId)
    if (job == null) {
      throw new Error(`未登録の文字起こしジョブが完了しました: ${jobId}`)
    }

    if (job.cancelled || job.controller.signal.aborted) {
      return
    }

    if (this.isCleaningUp) {
      this.jobsById.delete(jobId)
      this.loggerService.infoWithDetails('終了処理中の文字起こしジョブ完了通知を破棄しました', {
        jobId,
        notificationKind: notification.kind
      })
      return
    }

    this.jobsById.delete(jobId)
    this.setNotification(notification)
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
        target: this.recordingState.target
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
