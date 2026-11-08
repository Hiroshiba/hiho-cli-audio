import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AudioRecorder } from './audioRecorder'
import type {
  RecordingErrorPayload,
  RecordingInputStatePayload,
  RecordingStartOptions
} from '../../shared/types/recording'

class FakeMediaTrack extends EventTarget implements MediaStreamTrack {
  contentHint = ''
  enabled = true
  readonly id = 'fixture-track'
  readonly kind = 'audio'
  readonly label = 'Fixture microphone'
  muted = false
  onended: MediaStreamTrack['onended'] = null
  onmute: MediaStreamTrack['onmute'] = null
  onunmute: MediaStreamTrack['onunmute'] = null
  readyState: MediaStreamTrackState = 'live'
  stopCount = 0

  applyConstraints(): Promise<void> {
    return Promise.resolve()
  }

  clone(): MediaStreamTrack {
    return new FakeMediaTrack()
  }

  getCapabilities(): MediaTrackCapabilities {
    return {}
  }

  getConstraints(): MediaTrackConstraints {
    return {}
  }

  getSettings(): MediaTrackSettings {
    return {}
  }

  stop(): void {
    this.stopCount += 1
    this.readyState = 'ended'
  }
}

class FakeMediaStream extends EventTarget implements MediaStream {
  readonly active = true
  readonly id = 'fixture-stream'
  private tracks: MediaStreamTrack[] = []
  onaddtrack: MediaStream['onaddtrack'] = null
  onremovetrack: MediaStream['onremovetrack'] = null

  constructor(readonly track: FakeMediaTrack) {
    super()
    this.tracks.push(track)
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track)
  }

  clone(): MediaStream {
    return new FakeMediaStream(this.track)
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio')
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.tracks.find((track) => track.id === trackId) ?? null
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks]
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video')
  }

  removeTrack(track: MediaStreamTrack): void {
    this.tracks = this.tracks.filter((currentTrack) => currentTrack.id !== track.id)
  }
}

class FakeBlobEvent extends Event implements BlobEvent {
  readonly timecode = 0

  constructor(readonly data: Blob) {
    super('dataavailable')
  }
}

class FakeRecorderErrorEvent extends Event {
  constructor(readonly error: DOMException) {
    super('error')
  }
}

class FakeMediaRecorder {
  static readonly instances: FakeMediaRecorder[] = []
  static failNextStart = false
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: ((event: FakeRecorderErrorEvent) => void) | null = null
  onstop: ((event: Event) => void) | null = null

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.instances.push(this)
  }

  start(): void {
    if (FakeMediaRecorder.failNextStart) {
      FakeMediaRecorder.failNextStart = false
      throw new Error('MediaRecorderの開始失敗')
    }

    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.(new FakeBlobEvent(new Blob(['fixture audio'])))
    this.onstop?.(new Event('stop'))
  }

  fail(): void {
    this.state = 'inactive'
    this.onerror?.(new FakeRecorderErrorEvent(new DOMException('fixture error', 'UnknownError')))
  }
}

class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = []
  static failNextCreateAnalyser = false
  state: AudioContextState = 'running'
  closeCount = 0
  disconnectCount = 0
  sourceStream: MediaStream | null = null
  sampleValue = 0
  readonly connectedNodes: unknown[] = []
  readonly analyser = {
    fftSize: 4,
    getFloatTimeDomainData: (samples: Float32Array): void => {
      samples.fill(this.sampleValue)
    }
  }

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createAnalyser(): typeof this.analyser {
    if (FakeAudioContext.failNextCreateAnalyser) {
      FakeAudioContext.failNextCreateAnalyser = false
      throw new Error('Analyserの生成失敗')
    }

    return this.analyser
  }

  createMediaStreamSource(stream: MediaStream): {
    connect: (node: unknown) => void
    disconnect: () => void
  } {
    this.sourceStream = stream
    return {
      connect: (node: unknown): void => {
        this.connectedNodes.push(node)
      },
      disconnect: (): void => {
        this.disconnectCount += 1
      }
    }
  }

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.closeCount += 1
    this.state = 'closed'
    return Promise.resolve()
  }
}

test('録音の終了、キャンセル、開始失敗、録音エラーで監視資源を解放する', async () => {
  const globalNames = ['AudioContext', 'MediaRecorder', 'navigator', 'window']
  const originalGlobals = new Map(
    globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  )
  const streams: FakeMediaStream[] = []
  const messages: { channel: string; payload: unknown }[] = []
  const recordingErrors: RecordingErrorPayload[] = []
  const inputStates: RecordingInputStatePayload[] = []
  let failNextGetUserMedia = false

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (): Promise<MediaStream> => {
          if (failNextGetUserMedia) {
            failNextGetUserMedia = false
            throw new Error('getUserMediaの開始失敗')
          }

          const stream = new FakeMediaStream(new FakeMediaTrack())
          streams.push(stream)
          return stream
        }
      }
    }
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electron: {
        ipcRenderer: {
          send: (channel: string, payload: unknown): void => {
            messages.push({ channel, payload })
          }
        }
      }
    }
  })

  try {
    const recorder = new AudioRecorder(
      () => {},
      (payload) => recordingErrors.push(payload),
      (payload) => inputStates.push(payload)
    )
    const start = async (sessionId: string): Promise<void> => {
      const options: RecordingStartOptions = { sessionId, autoStopSeconds: 3600 }
      const result = await recorder.startRecording(options)
      assert.equal(result.success, true)
    }

    await start('recording-stop')
    const stoppedRecorder = FakeMediaRecorder.instances[0]
    const stoppedContext = FakeAudioContext.instances[0]
    assert.ok(stoppedRecorder != null)
    assert.ok(stoppedContext != null)
    assert.equal(stoppedRecorder.stream, streams[0])
    assert.equal(stoppedContext.sourceStream, streams[0])
    assert.equal(stoppedContext.connectedNodes[0], stoppedContext.analyser)
    assert.equal(recorder.stopRecording('recording-stop', 'requested').success, true)
    await delay(30)
    assert.equal(streams[0]?.track.stopCount, 1)
    assert.equal(stoppedContext.disconnectCount, 1)
    assert.equal(stoppedContext.closeCount, 1)
    assert.equal(
      messages.some((message) => message.channel === 'recording:data'),
      true
    )

    const previousDataCount = messages.filter(
      (message) => message.channel === 'recording:data'
    ).length
    await start('recording-cancel')
    const cancelledRecorder = FakeMediaRecorder.instances[1]
    const cancelledContext = FakeAudioContext.instances[1]
    assert.ok(cancelledRecorder != null)
    assert.ok(cancelledContext != null)
    assert.equal(recorder.stopRecording('recording-cancel', 'cancelled').success, true)
    await delay(30)
    assert.equal(streams[1]?.track.stopCount, 1)
    assert.equal(cancelledContext.disconnectCount, 1)
    assert.equal(cancelledContext.closeCount, 1)
    assert.equal(
      messages.filter((message) => message.channel === 'recording:data').length,
      previousDataCount
    )

    failNextGetUserMedia = true
    const startFailure = await recorder.startRecording({
      sessionId: 'recording-get-user-media-failure',
      autoStopSeconds: 3600
    })
    assert.equal(startFailure.success, false)
    assert.equal(FakeAudioContext.instances.length, 2)

    FakeMediaRecorder.failNextStart = true
    const mediaRecorderStartFailure = await recorder.startRecording({
      sessionId: 'recording-media-recorder-failure',
      autoStopSeconds: 3600
    })
    assert.equal(mediaRecorderStartFailure.success, false)
    assert.equal(streams[2]?.track.stopCount, 1)
    assert.equal(FakeAudioContext.instances.length, 2)

    FakeAudioContext.failNextCreateAnalyser = true
    await start('recording-input-monitor-unavailable')
    const unavailableContext = FakeAudioContext.instances[2]
    assert.ok(unavailableContext != null)
    await delay(0)
    assert.equal(inputStates.at(-1)?.state, 'unavailable')
    assert.equal(recordingErrors.length, 0)
    assert.equal(
      recorder.stopRecording('recording-input-monitor-unavailable', 'cancelled').success,
      true
    )
    await delay(30)
    assert.equal(streams[3]?.track.stopCount, 1)
    assert.equal(unavailableContext.closeCount, 1)

    await start('recording-error')
    const failedRecorder = FakeMediaRecorder.instances[4]
    const failedContext = FakeAudioContext.instances[3]
    assert.ok(failedRecorder != null)
    assert.ok(failedContext != null)
    failedRecorder.fail()
    await delay(30)
    assert.equal(recordingErrors.length, 1)
    assert.equal(streams[4]?.track.stopCount, 1)
    assert.equal(failedContext.disconnectCount, 1)
    assert.equal(failedContext.closeCount, 1)
    assert.equal(recorder.hasStoppedSession('recording-error'), true)
  } finally {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor == null) {
        Reflect.deleteProperty(globalThis, name)
      } else {
        Object.defineProperty(globalThis, name, descriptor)
      }
    }
  }
})
