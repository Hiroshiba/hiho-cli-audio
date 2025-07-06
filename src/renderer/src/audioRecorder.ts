/** IPC通信用の録音データ */
export interface RecordingData {
  audioData: Float32Array
  sampleRate: number
  channels: number
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
  private maxDuration: number
  private onStateChange: (state: RecordingState) => void
  private onDurationChange: (duration: number) => void

  constructor(
    maxDuration: number,
    onStateChange: (state: RecordingState) => void,
    onDurationChange: (duration: number) => void
  ) {
    this.maxDuration = maxDuration
    this.onStateChange = onStateChange
    this.onDurationChange = onDurationChange
  }

  /** 録音開始 */
  async startRecording(): Promise<Result<void, string>> {
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
        this.processRecordedData()
      }

      this.mediaRecorder.start(1000)
      this.startTime = Date.now()
      this.onStateChange('recording')

      this.startDurationTimer()
      
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: `録音開始エラー: ${error}` }
    }
  }

  /** 録音停止 */
  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop()
      this.onStateChange('processing')
    }
  }

  /** 録音時間タイマー */
  private startDurationTimer(): void {
    const updateDuration = (): void => {
      if (this.mediaRecorder?.state === 'recording') {
        const elapsed = (Date.now() - this.startTime) / 1000
        this.onDurationChange(elapsed)
        
        if (elapsed >= this.maxDuration) {
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
      this.onStateChange('idle')
      return
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      const audioData = await this.convertBlobToFloat32Array(audioBlob)
      
      const recordingData: RecordingData = {
        audioData,
        sampleRate: 44100,
        channels: 1
      }

      window.electron.ipcRenderer.send('recording:data', recordingData)
      
      this.onStateChange('idle')
    } catch (error) {
      console.error('録音データ処理エラー:', error)
      this.onStateChange('idle')
    }
  }

  /** BlobをFloat32Arrayに変換 */
  private async convertBlobToFloat32Array(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer()
    const audioContext = new AudioContext()
    
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      return audioBuffer.getChannelData(0)
    } finally {
      await audioContext.close()
    }
  }

  /** 録音中かどうか */
  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  /** 録音データをクリア */
  clearRecording(): void {
    this.audioChunks = []
    if (this.mediaRecorder) {
      this.mediaRecorder = null
    }
    this.onStateChange('idle')
  }
}