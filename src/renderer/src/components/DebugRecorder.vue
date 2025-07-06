<template>
  <div class="debug-recorder">
    <h2>音声録音デバッグ</h2>
    
    <div class="status">
      状態: {{ stateText }}
    </div>
    
    <div v-if="state === 'recording'" class="duration">
      録音時間: {{ Math.floor(duration) }}秒 / {{ maxDuration }}秒
    </div>
    
    <div class="controls">
      <button 
        @click="toggleRecording" 
        :disabled="state === 'processing'"
        :class="buttonClass"
      >
        {{ buttonText }}
      </button>
    </div>
    
    <div v-if="transcriptionResult" class="result">
      <div class="result-header">
        <h3>🎯 認識結果</h3>
        <button @click="copyToClipboard" class="copy-btn" title="クリップボードにコピー">
          📋 コピー
        </button>
      </div>
      <div class="text-container">
        <div class="text">{{ transcriptionResult.text }}</div>
      </div>
      <div class="cost-info">
        <div class="cost-main">
          💰 コスト: <span class="cost-amount">${{ transcriptionResult.costInfo.costUsd.toFixed(4) }}</span>
        </div>
        <div class="token-details">
          <span class="token-item">
            📥 入力: {{ transcriptionResult.costInfo.promptTokens }}トークン
          </span>
          <span class="token-item">
            📤 出力: {{ transcriptionResult.costInfo.outputTokens }}トークン
          </span>
        </div>
      </div>
    </div>
    
    <div v-if="error" class="error">
      エラー: {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { AudioRecorder, type RecordingState } from '../audioRecorder'
/** コスト情報 */
interface CostInfo {
  promptTokens: number
  outputTokens: number
  costUsd: number
}

/** 音声認識結果 */
interface TranscriptionResult {
  text: string
  costInfo: CostInfo
}

const recorder = ref<AudioRecorder | null>(null)
const state = ref<RecordingState>('idle')
const duration = ref(0)
const maxDuration = ref(300)
const transcriptionResult = ref<TranscriptionResult | null>(null)
const error = ref<string | null>(null)

const stateText = computed(() => {
  switch (state.value) {
    case 'idle': return '待機中'
    case 'recording': return '録音中'
    case 'processing': return '処理中'
    default: throw new Error(`未対応の録音状態: ${state.value}`)
  }
})

const buttonText = computed(() => {
  switch (state.value) {
    case 'idle': return '録音開始'
    case 'recording': return '録音停止'
    case 'processing': return '処理中...'
    default: throw new Error(`未対応の録音状態: ${state.value}`)
  }
})

const buttonClass = computed(() => ({
  'record-btn': true,
  'recording': state.value === 'recording',
  'processing': state.value === 'processing'
}))

const onStateChange = (newState: RecordingState): void => {
  state.value = newState
  if (newState === 'idle') {
    duration.value = 0
  }
}

const onDurationChange = (newDuration: number): void => {
  duration.value = newDuration
}

const toggleRecording = async (): Promise<void> => {
  if (!recorder.value) return
  
  error.value = null
  
  if (state.value === 'idle') {
    const result = await recorder.value.startRecording()
    if (!result.success) {
      error.value = result.error
    }
  } else if (state.value === 'recording') {
    recorder.value.stopRecording()
  }
}

const handleTranscriptionResult = (_event: unknown, result: TranscriptionResult): void => {
  transcriptionResult.value = result
  
  if (result.text) {
    navigator.clipboard.writeText(result.text).catch(console.error)
  }
}

const handleRecordingStart = async (): Promise<void> => {
  console.log('IPC: 録音開始指示を受信しました')
  if (!recorder.value) {
    console.error('AudioRecorderが初期化されていません')
    return
  }
  
  error.value = null
  
  if (state.value === 'idle') {
    const result = await recorder.value.startRecording()
    if (!result.success) {
      error.value = result.error
      console.error('録音開始エラー:', result.error)
    } else {
      console.log('録音を開始しました')
    }
  } else {
    console.log('録音は既に開始されています。状態:', state.value)
  }
}

const handleRecordingStop = (): void => {
  console.log('IPC: 録音停止指示を受信しました')
  if (!recorder.value) {
    console.error('AudioRecorderが初期化されていません')
    return
  }
  
  if (state.value === 'recording') {
    recorder.value.stopRecording()
    console.log('録音を停止しました')
  } else {
    console.log('録音は開始されていません。状態:', state.value)
  }
}

const copyToClipboard = async (): Promise<void> => {
  if (transcriptionResult.value?.text) {
    try {
      await navigator.clipboard.writeText(transcriptionResult.value.text)
      console.log('クリップボードにコピーしました')
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました:', error)
    }
  }
}

onMounted(() => {
  recorder.value = new AudioRecorder(maxDuration.value, onStateChange, onDurationChange)
  
  window.electron.ipcRenderer.on('transcription:result', handleTranscriptionResult)
  window.electron.ipcRenderer.on('recording:start', handleRecordingStart)
  window.electron.ipcRenderer.on('recording:stop', handleRecordingStop)
  
  console.log('IPC: イベントリスナーを登録しました')
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('transcription:result')
  window.electron.ipcRenderer.removeAllListeners('recording:start')
  window.electron.ipcRenderer.removeAllListeners('recording:stop')
  
  console.log('IPC: イベントリスナーを解除しました')
})
</script>

<style scoped>
.debug-recorder {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.status {
  font-size: 18px;
  margin: 10px 0;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 5px;
}

.duration {
  font-size: 16px;
  margin: 10px 0;
  color: #ff6b6b;
}

.controls {
  margin: 20px 0;
}

.record-btn {
  padding: 15px 30px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background: #4CAF50;
  color: white;
  transition: background 0.3s;
}

.record-btn:hover:not(:disabled) {
  background: #45a049;
}

.record-btn.recording {
  background: #f44336;
}

.record-btn.recording:hover:not(:disabled) {
  background: #da190b;
}

.record-btn.processing {
  background: #ff9800;
  cursor: not-allowed;
}

.record-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result {
  margin: 20px 0;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 12px;
  border: 2px solid #dee2e6;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  margin: 0;
}

.result-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.copy-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.text-container {
  padding: 20px;
  background: white;
}

.text {
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #28a745;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 60px;
}

.cost-info {
  padding: 16px 20px;
  background: linear-gradient(135deg, #f1f3f4 0%, #e8eaed 100%);
  border-top: 1px solid #dee2e6;
}

.cost-main {
  font-size: 16px;
  font-weight: 600;
  color: #1a73e8;
  margin-bottom: 8px;
}

.cost-amount {
  color: #ea4335;
  font-family: 'Courier New', monospace;
}

.token-details {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.token-item {
  font-size: 14px;
  color: #5f6368;
  background: white;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid #dadce0;
}

.error {
  margin: 20px 0;
  padding: 16px 20px;
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  color: #c62828;
  border-radius: 8px;
  border: 2px solid #e57373;
  box-shadow: 0 2px 4px rgba(244, 67, 54, 0.1);
  font-weight: 500;
}
</style>