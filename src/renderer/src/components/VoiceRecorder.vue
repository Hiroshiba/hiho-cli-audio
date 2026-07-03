<template>
  <div class="recording-controller" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { AudioRecorder, type RecordingState } from '../audioRecorder'
import type { RecordingErrorPayload, RecordingStartOptions } from '../../../shared/types/recording'

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
      message: '音声録音機能に問題が発生しました',
      details: 'AudioRecorderが初期化されていません'
    })
    return
  }

  if (state.value === 'idle') {
    const result = await currentRecorder.startRecording(options.autoStopSeconds)
    if (!result.success) {
      sendRecordingError({
        message: '録音を開始できませんでした',
        details: result.error
      })
    } else {
      console.log('録音を開始しました')
    }
  } else {
    console.log('録音は既に開始されています。状態:', state.value)
  }
}

const handleRecordingStop = (): void => {
  console.log('IPC: 録音停止指示を受信しました')
  const currentRecorder = recorder.value
  if (currentRecorder == null) {
    sendRecordingError({
      message: '音声録音機能に問題が発生しました',
      details: 'AudioRecorderが初期化されていません'
    })
    return
  }

  if (state.value === 'recording') {
    currentRecorder.stopRecording()
    console.log('録音を停止しました')
  } else {
    console.log('録音は開始されていません。状態:', state.value)
  }
}

onMounted(() => {
  recorder.value = new AudioRecorder(onStateChange, sendRecordingError)

  window.electron.ipcRenderer.on('recording:start', handleRecordingStart)
  window.electron.ipcRenderer.on('recording:stop', handleRecordingStop)

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
