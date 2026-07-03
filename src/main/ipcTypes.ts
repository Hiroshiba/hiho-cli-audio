import { RecordingData, StatusWindowState } from './types'
import type { HistoryItem } from '../shared/types/history'
import type { RecordingErrorPayload, RecordingStartOptions } from '../shared/types/recording'

/** IPC通信チャンネル定義 */
export interface IPCChannels {
  /** 録音データ送信 */
  'recording:data': RecordingData
  /** 録音エラー通知 */
  'recording:error': RecordingErrorPayload
  /** 録音開始 */
  'recording:start': RecordingStartOptions
  /** 録音停止 */
  'recording:stop': void
  /** 状態ウィンドウ表示状態 */
  'status:update': StatusWindowState
  /** 履歴一覧取得 */
  'history:list': readonly HistoryItem[]
  /** 履歴項目コピー */
  'history:copy': string
}
