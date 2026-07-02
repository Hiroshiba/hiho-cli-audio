import { RecordingData, TranscriptionResult } from './types'

/** IPC通信チャンネル定義 */
export interface IPCChannels {
  /** 録音データ送信 */
  'recording:data': RecordingData
  /** 音声認識結果 */
  'transcription:result': TranscriptionResult
}
