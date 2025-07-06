/** 音声録音設定 */
export interface AudioConfig {
  /** サンプリングレート */
  sampleRate: number
  /** チャンネル数 */
  channels: number
  /** 最大録音時間（秒） */
  maxDuration: number
}

/** ホットキー設定 */
export interface HotkeyConfig {
  /** 録音開始/停止切り替え */
  recordToggle: string
}

/** Gemini API設定 */
export interface GeminiConfig {
  /** Gemini APIキー */
  apiKey: string
  /** 使用モデル */
  model: string
}

/** UI設定 */
export interface UiConfig {
  /** 最前面表示を有効にするか */
  alwaysOnTop: boolean
}

/** アプリケーション設定 */
export interface Config {
  /** 音声録音設定 */
  audio: AudioConfig
  /** ホットキー設定 */
  hotkey: HotkeyConfig
  /** Gemini API設定 */
  gemini: GeminiConfig
  /** UI設定 */
  ui: UiConfig
}

/** コスト情報 */
export interface CostInfo {
  /** プロンプト使用トークン数 */
  promptTokens: number
  /** 出力使用トークン数 */
  outputTokens: number
  /** 推定コスト（USD） */
  costUsd: number
}

/** 音声認識結果 */
export interface TranscriptionResult {
  /** 認識されたテキスト */
  text: string
  /** コスト情報 */
  costInfo: CostInfo
}

/** IPC通信用の録音データ */
export interface RecordingData {
  /** WebM形式音声データ */
  webmData: Uint8Array
}

/** Result型 - 成功とエラーを表現 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

/** 録音結果 */
export type RecordingResult = Result<Float32Array, 'MAX_DURATION_EXCEEDED' | 'RECORDING_FAILED'>

/** 音声認識結果 */
export type TranscriptionApiResult = Result<TranscriptionResult, string>
