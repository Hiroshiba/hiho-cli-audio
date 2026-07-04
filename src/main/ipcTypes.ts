import type { RecordingData, StatusWindowState } from './types'
import type { HistoryItem } from '../shared/types/history'
import type {
  RecordingErrorPayload,
  RecordingSessionPayload,
  RecordingStartOptions,
  RecordingStopOptions,
  RecordingStoppedPayload
} from '../shared/types/recording'

/** IPC通信チャンネル定義 */
export interface IPCChannels {
  /** 録音データ送信 */
  'recording:data': RecordingData
  /** 録音エラー通知 */
  'recording:error': RecordingErrorPayload
  /** 録音ウィンドウ準備完了 */
  'recording:ready': void
  /** 録音開始完了 */
  'recording:started': RecordingSessionPayload
  /** 録音開始 */
  'recording:start': RecordingStartOptions
  /** 録音停止 */
  'recording:stop': RecordingStopOptions
  /** 録音停止完了 */
  'recording:stopped': RecordingStoppedPayload
  /** 状態ウィンドウ表示状態 */
  'status:update': StatusWindowState
  /** 履歴一覧取得 */
  'history:list': readonly HistoryItem[]
  /** 履歴項目コピー */
  'history:copy': string
}
