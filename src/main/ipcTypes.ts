import { RecordingData, TranscriptionResult, Config } from './types'

/** IPC通信チャンネル定義 */
export interface IPCChannels {
  /** 録音データ送信 */
  'recording:data': RecordingData
  /** 音声認識結果 */
  'transcription:result': TranscriptionResult
  /** 設定取得 */
  'config:get': Config
  /** 設定更新 */
  'config:update': Partial<Config>
  /** 設定リセット */
  'config:reset': Config
  /** 設定ファイル存在確認 */
  'config:exists': boolean
  /** 設定ファイルパス取得 */
  'config:path': string
}
