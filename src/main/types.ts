/** アプリケーション設定 */
export interface AppConfig {
  /** 状態ウィンドウと履歴ウィンドウを最前面に表示するか */
  alwaysOnTop: boolean
}

/** 録音トグルホットキー設定 */
export interface ToggleRecordingHotkeys {
  /** Windows用ホットキー */
  windows: string
  /** macOS用ホットキー */
  macos: string
}

/** ホットキー設定 */
export interface HotkeysConfig {
  /** 録音開始と停止の切り替え */
  toggleRecording: ToggleRecordingHotkeys
}

/** 録音設定 */
export interface RecordingConfig {
  /** 自動停止までの秒数 */
  autoStopSeconds: number
}

/** 文字起こしプロバイダー */
export type TranscriptionProvider = 'gemini'

/** Gemini API設定 */
export interface GeminiConfig {
  /** Gemini APIキー */
  apiKey: string
  /** 使用モデル */
  model: string
}

/** 文字起こし設定 */
export interface TranscriptionConfig {
  /** 文字起こしプロバイダー */
  provider: TranscriptionProvider
  /** Gemini API設定 */
  gemini: GeminiConfig
  /** 認識言語 */
  language: string
  /** 発話をできるだけ保持するか */
  preserveSpeechAsMuchAsPossible: boolean
}

/** 履歴設定 */
export interface HistoryConfig {
  /** 保持する最大件数 */
  maxItems: number
}

/** 状態ウィンドウ設定 */
export interface StatusWindowConfig {
  /** 初期表示位置 */
  initialPosition: 'top-right-offset'
}

/** 履歴ウィンドウ設定 */
export interface HistoryWindowConfig {
  /** 横幅を狭めた表示にするか */
  narrow: boolean
}

/** ウィンドウ設定 */
export interface WindowsConfig {
  /** 状態ウィンドウ設定 */
  status: StatusWindowConfig
  /** 履歴ウィンドウ設定 */
  history: HistoryWindowConfig
}

/** 語彙エントリー */
export interface VocabularyEntry {
  /** 読み方 */
  reading: string
  /** 出力表記 */
  output: string
}

/** アプリケーション設定 */
export interface Config {
  /** アプリケーション設定 */
  app: AppConfig
  /** ホットキー設定 */
  hotkeys: HotkeysConfig
  /** 録音設定 */
  recording: RecordingConfig
  /** 文字起こし設定 */
  transcription: TranscriptionConfig
  /** 履歴設定 */
  history: HistoryConfig
  /** ウィンドウ設定 */
  windows: WindowsConfig
  /** カスタム語彙 */
  vocabulary: readonly VocabularyEntry[]
}

/** コスト情報 */
export interface CostInfo {
  /** プロンプト使用トークン数 */
  promptTokens: number
  /** 出力使用トークン数 */
  outputTokens: number
  /** 推定コスト */
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

/** 変換済み音声ファイル */
export interface ProcessedAudioData {
  /** 履歴と紐づける音声ID */
  id: string
  /** WAVファイルの保存パス */
  wavFilePath: string
}

/** Result型 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

/** 録音結果 */
export type RecordingResult = Result<Float32Array, 'MAX_DURATION_EXCEEDED' | 'RECORDING_FAILED'>

/** 音声認識結果 */
export type TranscriptionApiResult = Result<TranscriptionResult, string>
