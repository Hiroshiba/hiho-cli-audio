/** IPC通信用の録音データ */
export interface RecordingData {
  /** WebM形式音声データ */
  webmData: Uint8Array
}

/** Result型 - 成功とエラーを表現 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

/** 録音状態 */
export type RecordingState = 'idle' | 'recording' | 'processing'

/** 音声録音クラス */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private startTime: number = 0
  private onStateChange: (state: RecordingState) => void

  constructor(onStateChange: (state: RecordingState) => void) {
    this.onStateChange = onStateChange
  }

  /** 録音開始 */
  async startRecording(autoStopSeconds: number): Promise<Result<void, string>> {
    validateAutoStopSeconds(autoStopSeconds)

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

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        void this.processRecordedData()
      }

      this.mediaRecorder.start(1000)
      this.startTime = Date.now()
      this.onStateChange('recording')

      this.startDurationTimer(autoStopSeconds)

      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: `録音開始エラー: ${error}` }
    }
  }

  /** 録音停止 */
  stopRecording(): void {
    if (this.mediaRecorder != null && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop()
      this.onStateChange('processing')
    }
  }

  /** 録音時間タイマー */
  private startDurationTimer(autoStopSeconds: number): void {
    const updateDuration = (): void => {
      if (this.mediaRecorder?.state === 'recording') {
        const elapsed = (Date.now() - this.startTime) / 1000

        if (elapsed >= autoStopSeconds) {
          this.stopRecording()
          return
        }

        setTimeout(updateDuration, 100)
      }
    }
    updateDuration()
  }

  /** 録音データを処理してIPCで送信 */
  private async processRecordedData(): Promise<void> {
    if (this.audioChunks.length === 0) {
      console.warn('録音データがありません')
      this.clearRecording()
      return
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      const webmData = new Uint8Array(await audioBlob.arrayBuffer())

      const recordingData: RecordingData = {
        webmData
      }

      window.electron.ipcRenderer.send('recording:data', recordingData)
      this.clearRecording()
    } catch (error) {
      console.error('録音データ処理エラー:', error)
      this.clearRecording()
    }
  }

  /** 録音中かどうか */
  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  /** 録音データをクリア */
  clearRecording(): void {
    this.audioChunks = []
    if (this.mediaRecorder != null) {
      this.mediaRecorder = null
    }
    this.onStateChange('idle')
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
