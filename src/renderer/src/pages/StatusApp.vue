<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { StatusWindowState } from '../../../shared/types/status'

const currentState = ref<StatusWindowState>({ kind: 'idle', processingJobCount: 0 })
const currentTimeMilliseconds = ref<number>(Date.now())
let removeStatusUpdateListener: (() => void) | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

const displayText = computed((): string =>
  createDisplayText(currentState.value, currentTimeMilliseconds.value)
)

const stateClass = computed((): string => currentState.value.kind)

const canCancel = computed(
  (): boolean =>
    currentState.value.kind === 'recording' || currentState.value.kind === 'transcribing'
)

function createDisplayText(state: StatusWindowState, nowMilliseconds: number): string {
  switch (state.kind) {
    case 'recording': {
      const elapsedTime = formatElapsedTime(state.recordingStartedAt, nowMilliseconds)
      if (state.target.kind === 'pending') {
        return `録音中 ${elapsedTime} · 出力先確認中`
      }

      if (state.target.kind === 'clipboard') {
        return `録音中 ${elapsedTime}`
      }

      if (state.target.kind === 'herdr') {
        return `録音中 ${elapsedTime} · Herdr`
      }

      const unreachableTarget: never = state.target
      throw new Error(`未対応の録音出力先表示状態です: ${JSON.stringify(unreachableTarget)}`)
    }
    case 'transcribing':
      return `認識中: ${state.processingJobCount}件`
    case 'completed':
      return state.message
    case 'failed':
      return state.message
    case 'idle':
      return ''
  }

  const unreachableState: never = state
  throw new Error(`未対応の状態ウィンドウ表示状態です: ${JSON.stringify(unreachableState)}`)
}

function formatElapsedTime(recordingStartedAt: string, nowMilliseconds: number): string {
  const startedAtMilliseconds = Date.parse(recordingStartedAt)
  if (Number.isNaN(startedAtMilliseconds)) {
    throw new Error(`録音開始時刻が不正です: ${recordingStartedAt}`)
  }

  const elapsedMilliseconds = nowMilliseconds - startedAtMilliseconds
  if (elapsedMilliseconds < 0) {
    throw new Error(`録音開始時刻が現在時刻より後です: ${recordingStartedAt}`)
  }

  return formatDurationSeconds(Math.floor(elapsedMilliseconds / 1000))
}

function formatDurationSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${formatTwoDigits(minutes)}:${formatTwoDigits(seconds)}`
}

function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, '0')
}

function updateCurrentTime(): void {
  currentTimeMilliseconds.value = Date.now()
}

function handleStatusUpdate(state: StatusWindowState): void {
  currentState.value = state
  updateCurrentTime()
}

function handleCancel(): void {
  window.api.status.cancel()
}

async function loadCurrentStatus(): Promise<void> {
  handleStatusUpdate(await window.api.status.getCurrent())
}

onMounted(() => {
  removeStatusUpdateListener = window.api.status.onUpdate(handleStatusUpdate)
  void loadCurrentStatus()
  clockTimer = setInterval(updateCurrentTime, 1000)
})

onUnmounted(() => {
  if (removeStatusUpdateListener != null) {
    removeStatusUpdateListener()
    removeStatusUpdateListener = null
  }

  if (clockTimer != null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <main class="status-window" :class="stateClass" aria-live="polite">
    <div class="status-pill">
      <span class="status-icon" aria-hidden="true"></span>
      <span class="status-text" :title="displayText" :aria-label="displayText">{{
        displayText
      }}</span>
      <button
        v-if="canCancel"
        type="button"
        class="status-cancel-button"
        aria-label="音声認識をキャンセル"
        @click="handleCancel"
      >
        <svg class="status-cancel-icon" viewBox="0 0 16 16" aria-hidden="true">
          <line x1="3" y1="3" x2="13" y2="13" />
          <line x1="13" y1="3" x2="3" y2="13" />
        </svg>
      </button>
    </div>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
}

:global(body) {
  overflow: hidden;
  color: #2b2620;
  background: transparent;
  font-family:
    'Zen Maru Gothic',
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.status-window {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  background: transparent;
  user-select: none;
  -webkit-app-region: no-drag;
}

.status-pill {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  -webkit-app-region: drag;
}

.status-window.recording .status-pill {
  background: #fdedea;
  color: #b3392a;
}

.status-window.transcribing .status-pill {
  background: #eaf1fe;
  color: #3363a8;
}

.status-window.completed .status-pill {
  background: #e9f7ef;
  color: #1f7a4d;
}

.status-window.failed .status-pill {
  background: #fdecea;
  color: #b3392a;
}

.status-icon {
  position: relative;
  flex: 0 0 auto;
}

.status-window.idle .status-icon {
  width: 9px;
  height: 9px;
  border: 1.5px dashed #a39a8c;
  border-radius: 999px;
}

.status-window.recording .status-icon {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #e2604a;
}

.status-window.transcribing .status-icon {
  width: 14px;
  height: 14px;
  border: 2.5px solid rgba(51, 99, 168, 0.2);
  border-top-color: #3363a8;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.status-window.completed .status-icon,
.status-window.failed .status-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: currentColor;
}

.status-window.completed .status-icon::after {
  position: absolute;
  top: 4.5px;
  left: 4px;
  width: 7px;
  height: 4px;
  border-bottom: 2px solid #ffffff;
  border-left: 2px solid #ffffff;
  content: '';
  transform: rotate(-45deg);
}

.status-window.failed .status-icon::after {
  position: absolute;
  inset: 0;
  color: #ffffff;
  content: '!';
  font-size: 11px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
}

.status-text {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.status-cancel-button {
  display: flex;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: inherit;
  font: inherit;
  font-size: 21px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.status-cancel-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.status-cancel-icon {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.status-cancel-icon line {
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
