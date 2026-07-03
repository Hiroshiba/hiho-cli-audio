/** 統一エラー情報 */
export interface AppError {
  /** ユーザー向けメッセージ */
  userMessage: string
  /** 技術的詳細 */
  technicalDetails: string
  /** 元のエラーオブジェクト */
  originalError?: Error | unknown
  /** エラー発生箇所 */
  source?: string
  /** エラー発生時刻 */
  timestamp: Date
}

/** エラーを作成するヘルパー関数 */
export function createError(
  userMessage: string,
  technicalDetails: string,
  originalError?: Error | unknown,
  source?: string
): AppError {
  return {
    userMessage,
    technicalDetails,
    originalError,
    source,
    timestamp: new Date()
  }
}
