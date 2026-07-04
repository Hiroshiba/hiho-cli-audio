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
      <span class="history-header-icon" aria-hidden="true"></span>
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
  color: #2b2620;
  background: #f3ede4;
  font-family:
    'Zen Maru Gothic',
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.history-window {
  display: flex;
  box-sizing: border-box;
  height: 100vh;
  flex-direction: column;
  border: 1px solid #f1ead0;
  background: #fffdfa;
}

.history-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid #f0e9dc;
  background: linear-gradient(180deg, #fffefb, #fffdf9);
  user-select: none;
}

.history-header-icon {
  position: relative;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #eaf1fe;
}

.history-header-icon::after {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 11px;
  height: 8px;
  border-bottom: 2.5px solid #3363a8;
  border-left: 2.5px solid #3363a8;
  content: '';
  transform: rotate(-45deg) translate(1px, -1px);
}

.history-header h1 {
  margin: 0;
  color: #2b2620;
  font-size: 15.5px;
  font-weight: 900;
  line-height: 1.4;
}

.history-message {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #8a8175;
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.history-list {
  flex: 1;
  min-height: 0;
  padding: 10px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.history-list-item {
  margin: 0 0 8px;
}

.history-list-item:last-child {
  margin-bottom: 0;
}

.history-item {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 90px;
  padding: 10px 12px 11px;
  border: 0;
  border-radius: 14px;
  background: #faf7f1;
  color: inherit;
  font: inherit;
  text-align: left;
}

.history-item-copied {
  background: #eaf1fe;
}

.history-item-completed {
  cursor: pointer;
}

.history-item-completed:hover {
  background: #eaf1fe;
}

.history-item-completed.history-item-copied:hover {
  background: #eaf1fe;
}

.history-item-completed:focus-visible {
  outline: 2px solid #3363a8;
  outline-offset: -2px;
}

.history-item-failed {
  background: #fdecea;
  box-shadow: inset 0 0 0 1px rgba(179, 57, 42, 0.14);
  color: #b3392a;
}

.history-time {
  display: block;
  margin-bottom: 6px;
  color: #a39a8c;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.4;
}

.history-item-failed .history-time {
  color: #c07d70;
}

.history-preview {
  display: -webkit-box;
  overflow: hidden;
  color: #413a30;
  font-size: 13.5px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.history-item-failed .history-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #b3392a;
  font-weight: 700;
  white-space: normal;
}

.history-item-failed .history-preview::before {
  display: inline-flex;
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #b3392a;
  color: #ffffff;
  content: '!';
  font-size: 10px;
  font-weight: 900;
  line-height: 15px;
}

.history-copy-feedback {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 17px;
  margin-top: 7px;
  color: #3363a8;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.4;
  visibility: hidden;
}

.history-copy-feedback::before {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #3363a8;
  color: #ffffff;
  content: '✓';
  font-size: 10px;
  line-height: 14px;
}

.history-copy-feedback-visible {
  visibility: visible;
}
</style>
