<template>
  <div class="recording-controller" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { AudioRecorder, type RecordingState } from '../audioRecorder'
import type {
  RecordingErrorPayload,
  RecordingSessionPayload,
  RecordingStartOptions,
  RecordingStopOptions
} from '../../../shared/types/recording'

const recorder = ref<AudioRecorder | null>(null)
const state = ref<RecordingState>('idle')

const onStateChange = (newState: RecordingState): void => {
  state.value = newState
}

const sendRecordingError = (payload: RecordingErrorPayload): void => {
  window.electron.ipcRenderer.send('recording:error', payload)
}

const handleRecordingStart = async (
  _event: unknown,
  options: RecordingStartOptions
): Promise<void> => {
  console.log('IPC: 録音開始指示を受信しました')
  const currentRecorder = recorder.value
  if (currentRecorder == null) {
    sendRecordingError({
      sessionId: options.sessionId,
      message: '音声録音機能に問題が発生しました',
      details: 'AudioRecorderが初期化されていません'
    })
    return
  }

  if (state.value === 'idle') {
    const result = await currentRecorder.startRecording(options)
    if (!result.success) {
      sendRecordingError({
        sessionId: options.sessionId,
        message: '録音を開始できませんでした',
        details: result.error
      })
    } else {
      const startedPayload: RecordingSessionPayload = {
        sessionId: options.sessionId
      }
      window.electron.ipcRenderer.send('recording:started', startedPayload)
      console.log('録音を開始しました')
    }
  } else {
    sendRecordingError({
      sessionId: options.sessionId,
      message: '録音を開始できませんでした',
      details: `録音は既に開始されています。状態: ${state.value}`
    })
  }
}

const handleRecordingStop = (_event: unknown, options: RecordingStopOptions): void => {
  console.log('IPC: 録音停止指示を受信しました')
  const currentRecorder = recorder.value
  if (currentRecorder == null) {
    sendRecordingError({
      sessionId: options.sessionId,
      message: '音声録音機能に問題が発生しました',
      details: 'AudioRecorderが初期化されていません'
    })
    return
  }

  const result = currentRecorder.stopRecording(options.sessionId, 'requested')
  if (!result.success) {
    sendRecordingError({
      sessionId: options.sessionId,
      message: '録音を停止できませんでした',
      details: result.error
    })
    return
  }

  console.log('録音を停止しました')
}

onMounted(() => {
  recorder.value = new AudioRecorder(onStateChange, sendRecordingError)

  window.electron.ipcRenderer.on('recording:start', handleRecordingStart)
  window.electron.ipcRenderer.on('recording:stop', handleRecordingStop)
  window.electron.ipcRenderer.send('recording:ready')

  console.log('IPC: イベントリスナーを登録しました')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('recording:start')
  window.electron.ipcRenderer.removeAllListeners('recording:stop')
  recorder.value = null

  console.log('IPC: イベントリスナーを解除しました')
})
</script>

<style scoped>
.recording-controller {
  display: none;
}
</style>
