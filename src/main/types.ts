export type { StatusWindowState } from '../shared/types/status'
export type { RecordingData } from '../shared/types/recording'

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

/** 文字起こしモード */
export type TranscriptionMode = 'verbatim' | 'smart'

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
  /** 文字起こしモード */
  mode: TranscriptionMode
  /** 認識時に優先するカスタム語彙 */
  customVocabulary: readonly string[]
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

/** macOS版Herdr設定 */
export interface HerdrMacosConfig {
  /** Herdr実行ファイルのパス */
  binaryPath: string
}

/** Windows版Herdr設定 */
export interface HerdrWindowsConfig {
  /** WSLディストリビューション名 */
  wslDistribution: string
  /** WSLユーザー名 */
  wslUser: string
  /** WSL内のHerdr実行ファイルのパス */
  binaryPath: string
}

/** Herdr設定 */
export interface HerdrConfig {
  /** macOS版Herdr設定 */
  macos?: HerdrMacosConfig
  /** Windows版Herdr設定 */
  windows?: HerdrWindowsConfig
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
  /** Herdr設定 */
  herdr?: HerdrConfig
}

/** Herdrのペイン */
export interface HerdrPane {
  /** Herdrが管理するペインID */
  paneId: string
}

/** Herdr CLIの通信処理 */
export interface HerdrTransport {
  /** 現在のHerdrペインを取得 */
  getCurrentPane(signal: AbortSignal): Promise<HerdrPane>
  /** 指定したHerdrペインで文字列を実行 */
  run(pane: HerdrPane, text: string, signal: AbortSignal): Promise<void>
}

/** 録音結果の出力先 */
export type RecordingTarget =
  | { kind: 'clipboard' }
  | { kind: 'herdr'; pane: HerdrPane; transport: HerdrTransport }

/** 音声認識結果 */
export interface TranscriptionResult {
  /** 認識されたテキスト */
  text: string
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
