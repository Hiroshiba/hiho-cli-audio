/** 録音結果の表示用出力先 */
export type RecordingTargetSummary = { kind: 'clipboard' } | { kind: 'herdr'; paneId: string }

/** 状態ウィンドウ表示状態 */
export type StatusWindowState =
  | { kind: 'idle'; processingJobCount: number }
  | {
      kind: 'recording'
      recordingStartedAt: string
      processingJobCount: number
      target: RecordingTargetSummary
    }
  | { kind: 'transcribing'; processingJobCount: number }
  | { kind: 'completed'; message: string; processingJobCount: number }
  | { kind: 'failed'; message: string; processingJobCount: number }
