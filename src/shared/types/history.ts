/** 履歴項目の状態 */
export type HistoryItemStatus = 'completed' | 'failed'

/** 文字起こし履歴項目 */
export interface HistoryItem {
  /** 履歴ID */
  id: string
  /** ジョブ作成時刻 */
  createdAt: string
  /** ジョブ完了時刻 */
  completedAt: string
  /** 文字起こし状態 */
  status: HistoryItemStatus
  /** 文字起こし全文 */
  transcript: string
  /** 履歴表示用プレビュー */
  preview: string
  /** 紐づく音声ログのパス */
  audioPath: string | null
}

/** 履歴画面に表示する項目 */
export interface HistoryListItem extends HistoryItem {
  /** 音声ログを利用できるか */
  audioAvailable: boolean
  /** 再認識中か */
  retrying: boolean
}
