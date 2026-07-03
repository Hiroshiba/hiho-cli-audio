<template>
  <div class="recording-controller" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { AudioRecorder, type RecordingState } from '../audioRecorder'
import { createError } from '../../../shared/types/error'
import type { RecordingStartOptions } from '../../../shared/types/recording'

const recorder = ref<AudioRecorder | null>(null)
const state = ref<RecordingState>('idle')

const onStateChange = (newState: RecordingState): void => {
  state.value = newState
}

const handleRecordingStart = async (
  _event: unknown,
  options: RecordingStartOptions
): Promise<void> => {
  console.log('IPC: 録音開始指示を受信しました')
  const currentRecorder = recorder.value
  if (currentRecorder == null) {
    const appError = createError(
      '音声録音機能に問題が発生しました',
      'AudioRecorderが初期化されていません'
    )
    await window.api.error.show(appError)
    return
  }

  if (state.value === 'idle') {
    const result = await currentRecorder.startRecording(options.autoStopSeconds)
    if (!result.success) {
      const appError = createError(
        'マイクへのアクセス権限が拒否されました。ブラウザまたはシステムの設定からマイクのアクセス許可を有効にしてください。',
        `録音開始エラー: ${result.error}`
      )
      await window.api.error.show(appError)
    } else {
      console.log('録音を開始しました')
    }
  } else {
    console.log('録音は既に開始されています。状態:', state.value)
  }
}

const handleRecordingStop = async (): Promise<void> => {
  console.log('IPC: 録音停止指示を受信しました')
  const currentRecorder = recorder.value
  if (currentRecorder == null) {
    const appError = {
      category: 'SYSTEM',
      userMessage: '音声録音機能に問題が発生しました',
      technicalDetails: 'AudioRecorderが初期化されていません',
      timestamp: new Date()
    }
    await window.api.error.show(appError)
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
  recorder.value = new AudioRecorder(onStateChange)

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
