import { RecordingData, StatusWindowState, TranscriptionResult } from './types'
import type { HistoryItem } from '../shared/types/history'

/** IPC通信チャンネル定義 */
export interface IPCChannels {
  /** 録音データ送信 */
  'recording:data': RecordingData
  /** 音声認識結果 */
  'transcription:result': TranscriptionResult
  /** 状態ウィンドウ表示状態 */
  'status:update': StatusWindowState
  /** 履歴一覧取得 */
  'history:list': readonly HistoryItem[]
  /** 履歴項目コピー */
  'history:copy': string
}
