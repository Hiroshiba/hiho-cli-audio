/** 録音停止理由 */
export type RecordingStopReason = 'requested' | 'auto-stop' | 'cancelled'

/** 録音セッション通知 */
export interface RecordingSessionPayload {
  /** 録音セッションID */
  sessionId: string
}

/** 録音開始オプション */
export interface RecordingStartOptions extends RecordingSessionPayload {
  /** 自動停止までの秒数 */
  autoStopSeconds: number
}

/** 録音停止オプション */
export interface RecordingStopOptions extends RecordingSessionPayload {
  /** 録音停止理由 */
  reason: RecordingStopReason
}

/** 録音停止通知 */
export interface RecordingStoppedPayload extends RecordingSessionPayload {
  /** 録音停止理由 */
  reason: RecordingStopReason
}

/** IPC通信用の録音データ */
export interface RecordingData extends RecordingSessionPayload {
  /** WebM形式音声データ */
  webmData: Uint8Array
}

/** 録音エラー通知 */
export interface RecordingErrorPayload extends RecordingSessionPayload {
  /** 状態ウィンドウに表示するメッセージ */
  message: string
  /** 内部ログに出力する詳細 */
  details: string
}
