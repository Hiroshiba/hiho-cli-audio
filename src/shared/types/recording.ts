/** 録音開始オプション */
export interface RecordingStartOptions {
  /** 自動停止までの秒数 */
  autoStopSeconds: number
}

/** 録音エラー通知 */
export interface RecordingErrorPayload {
  /** 状態ウィンドウに表示するメッセージ */
  message: string
  /** 内部ログに出力する詳細 */
  details: string
}
