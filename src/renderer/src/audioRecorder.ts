import type {
  RecordingData,
  RecordingErrorPayload,
  RecordingStartOptions,
  RecordingStopReason,
  RecordingStoppedPayload
} from '../../shared/types/recording'

const STOPPED_SESSION_ID_LIMIT = 20

/** Result型 - 成功とエラーを表現 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

/** 録音状態 */
export type RecordingState = 'idle' | 'recording'

/** 音声録音クラス */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private startTime: number = 0
  private currentSessionId: string | null = null
  private stopReason: RecordingStopReason | null = null
  private stoppedSessionIds: string[] = []
  private onStateChange: (state: RecordingState) => void
  private onError: (payload: RecordingErrorPayload) => void

  constructor(
    onStateChange: (state: RecordingState) => void,
    onError: (payload: RecordingErrorPayload) => void
  ) {
    this.onStateChange = onStateChange
    this.onError = onError
  }

  /** 録音開始 */
  async startRecording(options: RecordingStartOptions): Promise<Result<void, string>> {
    validateAutoStopSeconds(options.autoStopSeconds)

    if (this.currentSessionId != null) {
      return { success: false, error: '録音は既に開始されています' }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      this.audioChunks = []
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })
      this.currentSessionId = options.sessionId
      this.stopReason = null

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        this.finishRecording(options.sessionId)
      }

      this.mediaRecorder.start(1000)
      this.startTime = Date.now()
      this.onStateChange('recording')

      this.startDurationTimer(options.sessionId, options.autoStopSeconds)

      return { success: true, data: undefined }
    } catch (error) {
      this.resetRecording()
      return { success: false, error: `録音開始エラー: ${error}` }
    }
  }

  /** 録音停止 */
  stopRecording(sessionId: string, reason: RecordingStopReason): Result<void, string> {
    if (this.currentSessionId == null || this.mediaRecorder == null) {
      return { success: false, error: '録音は開始されていません' }
    }

    if (this.currentSessionId !== sessionId) {
      return {
        success: false,
        error: `別の録音セッションが実行中です: ${this.currentSessionId}`
      }
    }

    if (this.mediaRecorder.state === 'inactive' && this.stopReason != null) {
      return { success: true, data: undefined }
    }

    if (this.mediaRecorder.state !== 'recording') {
      return { success: false, error: `録音を停止できない状態です: ${this.mediaRecorder.state}` }
    }

    this.stopReason = reason
    this.mediaRecorder.stop()
    return { success: true, data: undefined }
  }

  /** 停止済み録音セッションかどうかを返す */
  hasStoppedSession(sessionId: string): boolean {
    return this.stoppedSessionIds.includes(sessionId)
  }

  /** 録音時間タイマー */
  private startDurationTimer(sessionId: string, autoStopSeconds: number): void {
    const updateDuration = (): void => {
      if (this.currentSessionId !== sessionId || this.mediaRecorder == null) {
        return
      }

      if (this.mediaRecorder.state !== 'recording') {
        return
      }

      const elapsed = (Date.now() - this.startTime) / 1000

      if (elapsed >= autoStopSeconds) {
        const result = this.stopRecording(sessionId, 'auto-stop')
        if (!result.success) {
          this.onError({
            sessionId,
            message: '録音の自動停止に失敗しました',
            details: result.error
          })
        }
        return
      }

      setTimeout(updateDuration, 100)
    }
    updateDuration()
  }

  private finishRecording(sessionId: string): void {
    const reason = this.stopReason
    if (reason == null) {
      this.onError({
        sessionId,
        message: '録音停止状態に問題が発生しました',
        details: '録音停止理由が設定されていません'
      })
      this.resetRecording()
      return
    }

    const audioChunks = [...this.audioChunks]
    this.resetRecording()
    this.rememberStoppedSession(sessionId)

    const stoppedPayload: RecordingStoppedPayload = {
      sessionId,
      reason
    }
    window.electron.ipcRenderer.send('recording:stopped', stoppedPayload)
    void this.processRecordedData(sessionId, audioChunks)
  }

  /** 録音データを処理してIPCで送信 */
  private async processRecordedData(sessionId: string, audioChunks: Blob[]): Promise<void> {
    if (audioChunks.length === 0) {
      console.warn('録音データがありません')
      this.onError({
        sessionId,
        message: '録音データがありません',
        details: 'MediaRecorderから音声データを受信できませんでした'
      })
      return
    }

    try {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      const webmData = new Uint8Array(await audioBlob.arrayBuffer())

      const recordingData: RecordingData = {
        sessionId,
        webmData
      }

      window.electron.ipcRenderer.send('recording:data', recordingData)
    } catch (error) {
      console.error('録音データ処理エラー:', error)
      this.onError({
        sessionId,
        message: '録音データを処理できませんでした',
        details: formatError(error)
      })
    }
  }

  /** 録音データをクリア */
  private resetRecording(): void {
    this.audioChunks = []
    this.mediaRecorder = null
    this.currentSessionId = null
    this.stopReason = null
    this.onStateChange('idle')
  }

  private rememberStoppedSession(sessionId: string): void {
    this.stoppedSessionIds = this.stoppedSessionIds.filter(
      (stoppedSessionId) => stoppedSessionId !== sessionId
    )
    this.stoppedSessionIds.push(sessionId)

    while (this.stoppedSessionIds.length > STOPPED_SESSION_ID_LIMIT) {
      const removedSessionId = this.stoppedSessionIds.shift()
      if (removedSessionId == null) {
        throw new Error('停止済み録音セッションIDの削除に失敗しました')
      }
    }
  }
}

function validateAutoStopSeconds(autoStopSeconds: number): void {
  if (!Number.isInteger(autoStopSeconds)) {
    throw new Error(`自動停止秒数は整数である必要があります: ${autoStopSeconds}`)
  }

  if (autoStopSeconds <= 0) {
    throw new Error(`自動停止秒数は1秒以上である必要があります: ${autoStopSeconds}`)
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }

  return String(error)
}
