import { app, clipboard } from 'electron'
import { randomUUID } from 'node:crypto'
import { AudioProcessor } from './audioProcessor'
import { ConfigService } from './configService'
import { GeminiService } from './geminiService'
import { LoggerService } from './loggerService'
import { RecordingData, StatusWindowState } from './types'
import { WindowService } from './windowService'

const COMPLETED_MESSAGE = 'クリップボードにコピーしました'
const FAILED_MESSAGE = '文字起こしに失敗しました'
const COMPLETED_NOTIFICATION_MILLISECONDS = 3000
const FAILED_NOTIFICATION_MILLISECONDS = 5000

type TranscriptionJobNotification =
  | { id: string; kind: 'completed'; message: string; durationMilliseconds: number }
  | { id: string; kind: 'failed'; message: string; durationMilliseconds: number }

/** 文字起こしジョブ管理サービス */
export class TranscriptionJobService {
  private static instance: TranscriptionJobService | null = null
  private readonly activeJobIds = new Set<string>()
  private readonly audioProcessor: AudioProcessor
  private readonly configService: ConfigService
  private readonly geminiService: GeminiService
  private readonly loggerService: LoggerService
  private notification: TranscriptionJobNotification | null = null
  private notificationTimer: ReturnType<typeof setTimeout> | null = null
  private recordingStartedAt: string | null = null

  private constructor(userDataDir: string) {
    this.audioProcessor = new AudioProcessor(userDataDir)
    this.configService = ConfigService.getInstance()
    this.geminiService = GeminiService.getInstance()
    this.loggerService = LoggerService.getInstance()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): TranscriptionJobService {
    if (TranscriptionJobService.instance == null) {
      TranscriptionJobService.instance = new TranscriptionJobService(app.getPath('userData'))
    }

    return TranscriptionJobService.instance
  }

  /** 録音開始状態を通知 */
  startRecording(): void {
    if (this.recordingStartedAt != null) {
      throw new Error('録音状態は既に開始されています')
    }

    this.recordingStartedAt = new Date().toISOString()
    this.clearNotificationTimer()
    this.notification = null
    this.publishStatus()
  }

  /** 録音停止状態を通知 */
  stopRecording(): void {
    if (this.recordingStartedAt == null) {
      return
    }

    this.recordingStartedAt = null
    this.publishStatus()
  }

  /** 録音データから文字起こしジョブを開始 */
  submitRecordingData(recordingData: RecordingData): void {
    const jobId = randomUUID()
    this.activeJobIds.add(jobId)
    this.stopRecording()
    this.publishStatus()

    this.loggerService.infoWithDetails('文字起こしジョブを開始しました', {
      jobId,
      dataSize: recordingData.webmData.length
    })

    void this.runJob(jobId, recordingData)
  }

  /** サービスをクリーンアップ */
  cleanup(): void {
    this.clearNotificationTimer()
    this.activeJobIds.clear()
    this.notification = null
    this.recordingStartedAt = null
    this.publishStatus()
  }

  private async runJob(jobId: string, recordingData: RecordingData): Promise<void> {
    try {
      const processResult = await this.audioProcessor.processAudioData(recordingData)
      if (!processResult.success) {
        throw new Error(processResult.error)
      }

      const processedAudio = processResult.data
      const config = await this.configService.loadConfig()
      const geminiClient = this.geminiService.getClient()
      const transcriptionResult = await geminiClient.transcribe(
        processedAudio.wavFilePath,
        config.vocabulary,
        config.transcription.language
      )

      clipboard.writeText(transcriptionResult.text)

      this.loggerService.infoWithDetails('文字起こしジョブが完了しました', {
        jobId,
        audioId: processedAudio.id,
        wavFilePath: processedAudio.wavFilePath,
        textLength: transcriptionResult.text.length,
        costInfo: transcriptionResult.costInfo
      })

      this.completeJob(jobId, {
        id: randomUUID(),
        kind: 'completed',
        message: COMPLETED_MESSAGE,
        durationMilliseconds: COMPLETED_NOTIFICATION_MILLISECONDS
      })
    } catch (error) {
      this.loggerService.error('文字起こしジョブに失敗しました', {
        jobId,
        error: this.formatError(error)
      })

      this.completeJob(jobId, {
        id: randomUUID(),
        kind: 'failed',
        message: FAILED_MESSAGE,
        durationMilliseconds: FAILED_NOTIFICATION_MILLISECONDS
      })
    }
  }

  private completeJob(jobId: string, notification: TranscriptionJobNotification): void {
    const wasActive = this.activeJobIds.delete(jobId)
    if (!wasActive) {
      throw new Error(`未登録の文字起こしジョブが完了しました: ${jobId}`)
    }

    this.setNotification(notification)
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
    const processingJobCount = this.activeJobIds.size

    if (this.recordingStartedAt != null) {
      return {
        kind: 'recording',
        recordingStartedAt: this.recordingStartedAt,
        processingJobCount
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
