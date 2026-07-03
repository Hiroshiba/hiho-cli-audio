/** 状態ウィンドウ表示状態 */
export type StatusWindowState =
  | { kind: 'idle'; processingJobCount: number }
  | { kind: 'recording'; recordingStartedAt: string; processingJobCount: number }
  | { kind: 'transcribing'; processingJobCount: number }
  | { kind: 'completed'; message: string; processingJobCount: number }
  | { kind: 'failed'; message: string; processingJobCount: number }
