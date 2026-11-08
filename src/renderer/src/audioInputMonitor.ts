import type { RecordingInputStatePayload } from '../../shared/types/recording'

const INPUT_LEVEL_THRESHOLD = 0.01
const INPUT_CONFIRMATION_MILLISECONDS = 300
const INPUT_WARNING_DELAY_MILLISECONDS = 3000
const INPUT_OBSERVATION_INTERVAL_MILLISECONDS = 100

type AudioInputDetectionChange = 'no-input' | 'input-detected'

/** 音声入力の有無をRMS音量から判定します。 */
export class AudioInputDetector {
  private inputStartedAtMilliseconds: number | null = null
  private hasDetectedInput = false
  private isWarningActive = false

  constructor(private readonly recordingStartedAtMilliseconds: number) {}

  /** RMS音量から録音入力の状態変化を返します。 */
  observe(nowMilliseconds: number, rootMeanSquareLevel: number): AudioInputDetectionChange | null {
    if (!Number.isFinite(rootMeanSquareLevel)) {
      throw new Error(`録音入力レベルが不正です: ${rootMeanSquareLevel}`)
    }

    if (rootMeanSquareLevel >= INPUT_LEVEL_THRESHOLD) {
      if (this.inputStartedAtMilliseconds == null) {
        this.inputStartedAtMilliseconds = nowMilliseconds
      }

      if (
        !this.hasDetectedInput &&
        nowMilliseconds - this.inputStartedAtMilliseconds >= INPUT_CONFIRMATION_MILLISECONDS
      ) {
        this.hasDetectedInput = true
        if (this.isWarningActive) {
          this.isWarningActive = false
          return 'input-detected'
        }
      }
    } else {
      this.inputStartedAtMilliseconds = null
    }

    if (
      !this.hasDetectedInput &&
      !this.isWarningActive &&
      nowMilliseconds - this.recordingStartedAtMilliseconds >= INPUT_WARNING_DELAY_MILLISECONDS
    ) {
      if (this.inputStartedAtMilliseconds != null) {
        return null
      }

      this.isWarningActive = true
      return 'no-input'
    }

    return null
  }
}

/** 音声入力監視の開始結果 */
type AudioInputMonitorCreation =
  | { kind: 'active'; monitor: AudioInputMonitor }
  | { kind: 'unavailable' }

/** 録音ストリームの入力レベルを監視します。 */
export class AudioInputMonitor {
  private readonly detector: AudioInputDetector
  private readonly samples: Float32Array<ArrayBuffer>
  private timer: ReturnType<typeof setInterval> | null = null
  private isStopped = false

  private constructor(
    private readonly sessionId: string,
    private readonly audioContext: AudioContext,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly analyser: AnalyserNode,
    recordingStartedAtMilliseconds: number,
    private readonly onStateChange: (payload: RecordingInputStatePayload) => void
  ) {
    this.detector = new AudioInputDetector(recordingStartedAtMilliseconds)
    this.samples = new Float32Array(
      new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
    )
  }

  /** 同じ録音ストリームの入力レベル監視を開始します。 */
  static create(
    stream: MediaStream,
    sessionId: string,
    recordingStartedAtMilliseconds: number,
    onStateChange: (payload: RecordingInputStatePayload) => void
  ): AudioInputMonitorCreation {
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null

    try {
      audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      const monitor = new AudioInputMonitor(
        sessionId,
        audioContext,
        source,
        analyser,
        recordingStartedAtMilliseconds,
        onStateChange
      )
      monitor.start()
      return { kind: 'active', monitor }
    } catch (error) {
      const errors: unknown[] = [error]

      if (source != null) {
        try {
          source.disconnect()
        } catch (cleanupError) {
          errors.push(cleanupError)
        }
      }

      if (audioContext == null) {
        onStateChange({ sessionId, state: 'unavailable', details: formatError(errors) })
        return { kind: 'unavailable' }
      }

      void audioContext.close().then(
        () => onStateChange({ sessionId, state: 'unavailable', details: formatError(errors) }),
        (cleanupError: unknown) => {
          errors.push(cleanupError)
          onStateChange({ sessionId, state: 'unavailable', details: formatError(errors) })
        }
      )
      return { kind: 'unavailable' }
    }
  }

  /** 入力レベルの監視とWeb Audio資源を解放します。 */
  async stop(): Promise<void> {
    if (this.isStopped) {
      return
    }

    this.isStopped = true
    if (this.timer != null) {
      clearInterval(this.timer)
      this.timer = null
    }

    const errors: unknown[] = []
    try {
      this.source.disconnect()
    } catch (error) {
      errors.push(error)
    }

    try {
      await this.audioContext.close()
    } catch (error) {
      errors.push(error)
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, '録音入力の監視資源を解放できませんでした')
    }
  }

  private start(): void {
    if (this.audioContext.state === 'running') {
      this.startObserving()
      return
    }

    void this.resume().catch((error: unknown) => {
      this.reportUnavailable(error)
    })
  }

  private async resume(): Promise<void> {
    await this.audioContext.resume()
    if (this.isStopped) {
      return
    }

    if (this.audioContext.state !== 'running') {
      throw new Error(`録音入力の監視を開始できません: ${this.audioContext.state}`)
    }

    this.startObserving()
  }

  private startObserving(): void {
    if (this.isStopped) {
      return
    }

    this.timer = setInterval(() => this.observeInput(), INPUT_OBSERVATION_INTERVAL_MILLISECONDS)
  }

  private observeInput(): void {
    if (this.isStopped) {
      return
    }

    let change: AudioInputDetectionChange | null
    try {
      this.analyser.getFloatTimeDomainData(this.samples)
      const sumOfSquares = this.samples.reduce((sum, sample) => sum + sample * sample, 0)
      const rootMeanSquareLevel = Math.sqrt(sumOfSquares / this.samples.length)
      change = this.detector.observe(performance.now(), rootMeanSquareLevel)
    } catch (error) {
      this.reportUnavailable(error)
      return
    }

    if (change != null) {
      this.onStateChange({ sessionId: this.sessionId, state: change })
    }
  }

  private reportUnavailable(error: unknown): void {
    void this.stop().then(
      () =>
        this.onStateChange({
          sessionId: this.sessionId,
          state: 'unavailable',
          details: formatError([error])
        }),
      (cleanupError: unknown) =>
        this.onStateChange({
          sessionId: this.sessionId,
          state: 'unavailable',
          details: formatError([error, cleanupError])
        })
    )
  }
}

function formatError(errors: unknown[]): string {
  const error = errors.length === 1 ? errors[0] : new AggregateError(errors)
  if (error instanceof Error) {
    return error.stack ?? error.message
  }

  return String(error)
}
