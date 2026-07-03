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
  /** 紐づくWAV音声ログのパス */
  audioPath: string | null
}
