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

function createDisplayText(state: StatusWindowState, nowMilliseconds: number): string {
  switch (state.kind) {
    case 'recording':
      return `録音中 ${formatElapsedTime(state.recordingStartedAt, nowMilliseconds)}`
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
      <span class="status-text">{{ displayText }}</span>
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
  padding: 8px 12px;
  background: transparent;
  user-select: none;
  -webkit-app-region: drag;
}

.status-pill {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow:
    0 10px 30px -8px rgba(60, 50, 30, 0.28),
    0 1px 2px rgba(60, 50, 30, 0.08),
    inset 0 0 0 1.5px rgba(163, 154, 140, 0.28);
  backdrop-filter: blur(6px);
}

.status-window.recording .status-pill {
  background: #fdedea;
  color: #b3392a;
  box-shadow:
    0 10px 30px -8px rgba(60, 50, 30, 0.28),
    0 1px 2px rgba(60, 50, 30, 0.08);
}

.status-window.transcribing .status-pill {
  background: #eaf1fe;
  color: #3363a8;
  box-shadow:
    0 10px 30px -8px rgba(60, 50, 30, 0.28),
    0 1px 2px rgba(60, 50, 30, 0.08);
}

.status-window.completed .status-pill {
  background: #e9f7ef;
  color: #1f7a4d;
  box-shadow:
    0 10px 30px -8px rgba(60, 50, 30, 0.28),
    0 1px 2px rgba(60, 50, 30, 0.08);
}

.status-window.failed .status-pill {
  background: #fdecea;
  color: #b3392a;
  box-shadow:
    0 10px 30px -8px rgba(60, 50, 30, 0.28),
    0 1px 2px rgba(60, 50, 30, 0.08);
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
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
