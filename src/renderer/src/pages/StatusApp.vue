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

onMounted(() => {
  removeStatusUpdateListener = window.api.status.onUpdate(handleStatusUpdate)
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
    <span class="status-text">{{ displayText }}</span>
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
  color: #f8fafc;
  background: transparent;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.status-window {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border: 1px solid #394150;
  background: #181c23;
  user-select: none;
  -webkit-app-region: drag;
}

.status-window.recording {
  border-color: #a33f32;
  background: #2b1d1b;
}

.status-window.transcribing {
  border-color: #2f6f8f;
  background: #17242d;
}

.status-window.completed {
  border-color: #2d7d5b;
  background: #17261f;
}

.status-window.failed {
  border-color: #a33f32;
  background: #2b1d1b;
}

.status-text {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
