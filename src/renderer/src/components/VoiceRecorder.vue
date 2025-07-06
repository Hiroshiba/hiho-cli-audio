<template>
  <div class="audio-recorder">
    <div class="status-container">
      <div class="status" :class="statusClass">
        {{ stateText }}
      </div>
      
      <div v-if="state === 'recording'" class="duration">
        録音時間: {{ Math.floor(duration) }}秒 / {{ maxDuration }}秒
      </div>
    </div>
    
    <div v-if="transcriptionResult" class="result">
      <div class="result-header">
        <h3>認識結果</h3>
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
    case 'processing': return '音声認識中'
    default: throw new Error(`未対応の録音状態: ${state.value}`)
  }
})

const statusClass = computed(() => {
  switch (state.value) {
    case 'idle': return 'idle'
    case 'recording': return 'recording'
    case 'processing': return 'recognizing'
    default: throw new Error(`未対応の録音状態: ${state.value}`)
  }
})

const onStateChange = (newState: RecordingState): void => {
  state.value = newState
  if (newState === 'idle') {
    duration.value = 0
  }
}

const onDurationChange = (newDuration: number): void => {
  duration.value = newDuration
}

const handleTranscriptionResult = (_event: unknown, result: TranscriptionResult): void => {
  transcriptionResult.value = result
  state.value = 'idle'
  
  if (result.text) {
    writeClipboard(result.text)
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

const writeClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
    console.log('クリップボードにコピーしました')
  } catch (error) {
    console.log('Web API でのクリップボードコピーに失敗、IPC経由で再試行します')
    try {
      const success = await window.electron.ipcRenderer.invoke('clipboard:writeText', text)
      if (success) {
        console.log('IPC経由でクリップボードにコピーしました')
      } else {
        console.error('IPC経由でのクリップボードコピーに失敗しました')
      }
    } catch (ipcError) {
      console.error('IPC経由でのクリップボードコピーでエラーが発生しました:', ipcError)
    }
  }
}

const copyToClipboard = async (): Promise<void> => {
  if (transcriptionResult.value?.text) {
    await writeClipboard(transcriptionResult.value.text)
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
.audio-recorder {
  padding: 16px;
  max-width: 500px;
  margin: 0 auto;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  box-sizing: border-box;
}

.status-container {
  margin-bottom: 20px;
}

.status {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  text-align: center;
  transition: all 0.3s ease;
}

.status.idle {
  background: #f8f9fa;
  color: #495057;
  border: 2px solid #e9ecef;
}

.status.recording {
  background: #fff5f5;
  color: #c53030;
  border: 2px solid #fed7d7;
  animation: pulse 1.5s infinite;
}

.status.processing {
  background: #fffbf0;
  color: #d69e2e;
  border: 2px solid #feebc8;
}

.status.recognizing {
  background: #f0fff4;
  color: #38a169;
  border: 2px solid #c6f6d5;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

.duration {
  font-size: 16px;
  margin: 10px 0;
  color: #ff6b6b;
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