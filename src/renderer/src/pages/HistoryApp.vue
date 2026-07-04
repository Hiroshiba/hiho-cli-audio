<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { HistoryItem } from '../../../shared/types/history'

type HistoryLoadState =
  | {
      kind: 'loading'
    }
  | {
      kind: 'loaded'
      items: readonly HistoryItem[]
    }
  | {
      kind: 'failed'
    }

const FAILED_HISTORY_TEXT = '文字起こし失敗'
const COPIED_HISTORY_TEXT = 'コピーしました'
const COPIED_FEEDBACK_MILLISECONDS = 1600

const loadState = ref<HistoryLoadState>({ kind: 'loading' })
const copiedHistoryItemId = ref<string | null>(null)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
let removeHistoryUpdatedListener: (() => void) | null = null

const historyItems = computed((): readonly HistoryItem[] => {
  if (loadState.value.kind !== 'loaded') {
    return []
  }

  return loadState.value.items
})

const isEmpty = computed(
  (): boolean => loadState.value.kind === 'loaded' && historyItems.value.length === 0
)

async function loadHistoryItems(): Promise<void> {
  try {
    const items = await window.api.history.list()
    loadState.value = {
      kind: 'loaded',
      items
    }
  } catch (error) {
    console.error('履歴一覧の読み込みに失敗しました', error)
    loadState.value = {
      kind: 'failed'
    }
  }
}

async function handleCompletedItemClick(item: HistoryItem): Promise<void> {
  if (item.status !== 'completed') {
    throw new Error(`コピー対象ではない履歴項目です: ${item.id}`)
  }

  try {
    const copied = await window.api.history.copy(item.id)
    if (!copied) {
      throw new Error(`履歴項目をコピーできませんでした: ${item.id}`)
    }

    showCopyFeedback(item.id)
  } catch (error) {
    console.error('履歴項目のコピーに失敗しました', error)
  }
}

function showCopyFeedback(itemId: string): void {
  clearCopyFeedbackTimer()
  copiedHistoryItemId.value = itemId
  copyFeedbackTimer = setTimeout(() => {
    copiedHistoryItemId.value = null
    copyFeedbackTimer = null
  }, COPIED_FEEDBACK_MILLISECONDS)
}

function clearCopyFeedbackTimer(): void {
  if (copyFeedbackTimer == null) {
    return
  }

  clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = null
}

function formatCompletedAt(completedAt: string): string {
  const completedDate = new Date(completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    throw new Error(`履歴項目の完了時刻が不正です: ${completedAt}`)
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(completedDate)
}

function handleWindowFocus(): void {
  void loadHistoryItems()
}

function handleHistoryUpdated(): void {
  void loadHistoryItems()
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void loadHistoryItems()
  }
}

onMounted(() => {
  void loadHistoryItems()
  removeHistoryUpdatedListener = window.api.history.onUpdated(handleHistoryUpdated)
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (removeHistoryUpdatedListener != null) {
    removeHistoryUpdatedListener()
    removeHistoryUpdatedListener = null
  }

  clearCopyFeedbackTimer()
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <main class="history-window">
    <header class="history-header">
      <h1>履歴</h1>
    </header>

    <section v-if="loadState.kind === 'loading'" class="history-message">
      履歴を読み込んでいます
    </section>

    <section v-else-if="loadState.kind === 'failed'" class="history-message">
      履歴を読み込めませんでした
    </section>

    <section v-else-if="isEmpty" class="history-message">履歴はありません</section>

    <ul v-else class="history-list" aria-label="文字起こし履歴">
      <li v-for="item in historyItems" :key="item.id" class="history-list-item">
        <button
          v-if="item.status === 'completed'"
          type="button"
          class="history-item history-item-completed"
          :class="{ 'history-item-copied': copiedHistoryItemId === item.id }"
          @click="handleCompletedItemClick(item)"
        >
          <time class="history-time" :datetime="item.completedAt">
            {{ formatCompletedAt(item.completedAt) }}
          </time>
          <span class="history-preview">{{ item.preview }}</span>
          <span
            class="history-copy-feedback"
            :class="{ 'history-copy-feedback-visible': copiedHistoryItemId === item.id }"
            aria-live="polite"
          >
            {{ COPIED_HISTORY_TEXT }}
          </span>
        </button>

        <div v-else class="history-item history-item-failed">
          <time class="history-time" :datetime="item.completedAt">
            {{ formatCompletedAt(item.completedAt) }}
          </time>
          <span class="history-preview">{{ FAILED_HISTORY_TEXT }}</span>
        </div>
      </li>
    </ul>
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
  color: #172033;
  background: #f8fafc;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.history-window {
  display: flex;
  height: 100vh;
  flex-direction: column;
  background: #f8fafc;
}

.history-header {
  padding: 14px 16px;
  border-bottom: 1px solid #d7dde8;
  background: #ffffff;
  user-select: none;
}

.history-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.history-message {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.history-list {
  flex: 1;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.history-list-item {
  margin: 0;
}

.history-item {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 94px;
  padding: 12px 16px 14px;
  border: 0;
  border-bottom: 1px solid #dfe5ef;
  background: #ffffff;
  color: inherit;
  font: inherit;
  text-align: left;
}

.history-item-copied {
  background: #eefbf4;
}

.history-item-completed {
  cursor: pointer;
}

.history-item-completed:hover {
  background: #eef6ff;
}

.history-item-completed.history-item-copied:hover {
  background: #e3f7eb;
}

.history-item-completed:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

.history-item-failed {
  color: #687386;
}

.history-time {
  display: block;
  margin-bottom: 6px;
  color: #526070;
  font-size: 12px;
  line-height: 1.4;
}

.history-preview {
  display: -webkit-box;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.history-copy-feedback {
  display: block;
  min-height: 17px;
  margin-top: 6px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  visibility: hidden;
}

.history-copy-feedback-visible {
  visibility: visible;
}
</style>
