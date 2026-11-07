import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { AudioInputDetector, AudioInputMonitor } from '../renderer/src/audioInputMonitor'
import type { RecordingInputStatePayload } from '../shared/types/recording'

class FakeMediaStream extends EventTarget implements MediaStream {
  readonly active = true
  readonly id = 'fixture-stream'
  private tracks: MediaStreamTrack[] = []
  onaddtrack: MediaStream['onaddtrack'] = null
  onremovetrack: MediaStream['onremovetrack'] = null

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track)
  }

  clone(): MediaStream {
    const stream = new FakeMediaStream()
    this.tracks.forEach((track) => stream.addTrack(track.clone()))
    return stream
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

test('RMS判定は猶予、継続入力、後発入力、録音単位の確認状態を保つ', () => {
  const silentInput = new AudioInputDetector(0)
  assert.equal(silentInput.observe(2990, 0), null)
  assert.equal(silentInput.observe(3000, 0), 'no-input')
  assert.equal(silentInput.observe(3100, 0.02), null)
  assert.equal(silentInput.observe(3200, 0), null)
  assert.equal(silentInput.observe(3300, 0.02), null)
  assert.equal(silentInput.observe(3400, 0.02), null)
  assert.equal(silentInput.observe(3500, 0.02), null)
  assert.equal(silentInput.observe(3600, 0.02), 'input-detected')
  assert.equal(silentInput.observe(5000, 0), null)
  assert.equal(silentInput.observe(9000, 0), null)

  const earlyInput = new AudioInputDetector(0)
  assert.equal(earlyInput.observe(2500, 0.01), null)
  assert.equal(earlyInput.observe(2600, 0.01), null)
  assert.equal(earlyInput.observe(2800, 0.01), null)
  assert.equal(earlyInput.observe(3000, 0), null)

  const nextRecording = new AudioInputDetector(6000)
  assert.equal(nextRecording.observe(9000, 0), 'no-input')
})

test('監視は録音ストリームだけを解析し停止後にタイマーと資源を解放する', async () => {
  const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  const connectedNodes: unknown[] = []
  const contexts: FakeAudioContext[] = []

  class FakeAudioContext {
    state: AudioContextState = 'running'
    sampleValue = 0
    closeCount = 0
    disconnectCount = 0
    sourceStream: MediaStream | null = null
    readonly analyser = {
      fftSize: 4,
      getFloatTimeDomainData: (samples: Float32Array): void => {
        samples.fill(this.sampleValue)
      }
    }

    constructor() {
      contexts.push(this)
    }

    createAnalyser(): typeof this.analyser {
      return this.analyser
    }

    createMediaStreamSource(stream: MediaStream): {
      connect: (node: unknown) => void
      disconnect: () => void
    } {
      this.sourceStream = stream
      return {
        connect: (node: unknown): void => {
          connectedNodes.push(node)
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

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext
  })

  try {
    const stream = new FakeMediaStream()
    const notifications: RecordingInputStatePayload[] = []
    const result = AudioInputMonitor.create(
      stream,
      'recording-fixture',
      performance.now() - 2900,
      (payload) => notifications.push(payload)
    )
    assert.equal(result.kind, 'active')
    if (result.kind !== 'active') {
      throw new Error('音声入力監視を開始できませんでした')
    }

    const monitor = result.monitor
    const context = contexts[0]
    assert.ok(context != null)
    assert.equal(context.sourceStream, stream)
    assert.equal(connectedNodes.length, 1)
    assert.equal(connectedNodes[0], context.analyser)

    try {
      await delay(150)
      assert.deepEqual(
        notifications.map((notification) => notification.state),
        ['no-input']
      )

      context.sampleValue = 0.02
      await delay(450)
      assert.deepEqual(
        notifications.map((notification) => notification.state),
        ['no-input', 'input-detected']
      )

      context.sampleValue = 0
      await delay(250)
      assert.deepEqual(
        notifications.map((notification) => notification.state),
        ['no-input', 'input-detected']
      )

      await monitor.stop()
      await delay(250)
      assert.equal(context.disconnectCount, 1)
      assert.equal(context.closeCount, 1)
      assert.deepEqual(
        notifications.map((notification) => notification.state),
        ['no-input', 'input-detected']
      )
    } finally {
      await monitor.stop()
    }
  } finally {
    if (originalAudioContext == null) {
      Reflect.deleteProperty(globalThis, 'AudioContext')
    } else {
      Object.defineProperty(globalThis, 'AudioContext', originalAudioContext)
    }
  }
})
