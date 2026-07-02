import { z } from 'zod'
import type { Config } from './types'

const VALID_HOTKEY_MODIFIERS = new Set([
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta'
])
const HOTKEY_KEY_PATTERN =
  /^[A-Za-z0-9]$|^F(?:[1-9]|1[0-9]|2[0-4])$|^(Space|Tab|Enter|Return|Escape|Esc|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Minus)$/
const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/

function isValidHotkey(value: string): boolean {
  const parts = value.split('+').map((part) => part.trim())
  if (parts.length < 2) {
    return false
  }

  if (parts.some((part) => part.length === 0)) {
    return false
  }

  const key = parts[parts.length - 1]
  if (key == null) {
    return false
  }

  const modifiers = parts.slice(0, parts.length - 1)
  return (
    modifiers.every((modifier) => VALID_HOTKEY_MODIFIERS.has(modifier)) &&
    HOTKEY_KEY_PATTERN.test(key)
  )
}

function nonEmptyString(message: string): z.ZodString {
  return z.string().trim().min(1, message)
}

function formatIssuePath(issue: z.ZodIssue): string {
  if (issue.path.length === 0) {
    return 'config'
  }

  return issue.path.map((path) => String(path)).join('.')
}

function formatIssueMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return '必須項目が不足しているか、値の型が正しくありません'
    case 'unrecognized_keys':
      return `未対応のキーがあります: ${issue.keys.join(', ')}`
    default:
      return issue.message
  }
}

function formatConfigValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${formatIssuePath(issue)}: ${formatIssueMessage(issue)}`)
    .join('\n')
}

const HotkeySchema = z
  .string()
  .trim()
  .min(1, 'ホットキーを指定してください')
  .refine(isValidHotkey, 'Control+Shift+D のように修飾キーとキーを + で指定してください')

/** アプリケーション設定のスキーマ */
export const AppConfigSchema = z
  .object({
    alwaysOnTop: z.boolean()
  })
  .strict()

/** ホットキー設定のスキーマ */
export const HotkeysConfigSchema = z
  .object({
    toggleRecording: z
      .object({
        windows: HotkeySchema,
        macos: HotkeySchema
      })
      .strict()
  })
  .strict()

/** 録音設定のスキーマ */
export const RecordingConfigSchema = z
  .object({
    autoStopSeconds: z
      .number()
      .int('recording.autoStopSeconds は整数で指定してください')
      .min(1, 'recording.autoStopSeconds は1秒以上で指定してください')
      .max(3600, 'recording.autoStopSeconds は3600秒以下で指定してください')
  })
  .strict()

/** Gemini API設定のスキーマ */
export const GeminiConfigSchema = z
  .object({
    apiKey: nonEmptyString('transcription.gemini.apiKey を設定してください'),
    model: nonEmptyString('transcription.gemini.model を設定してください')
  })
  .strict()

const WritableGeminiConfigSchema = GeminiConfigSchema.extend({
  apiKey: z.string().trim()
}).strict()

/** 文字起こし設定のスキーマ */
export const TranscriptionConfigSchema = z
  .object({
    provider: z.literal('gemini', {
      message: 'transcription.provider は gemini を指定してください'
    }),
    gemini: GeminiConfigSchema,
    language: nonEmptyString('transcription.language を設定してください').regex(
      LANGUAGE_PATTERN,
      'transcription.language は ja-JP のような形式で指定してください'
    ),
    preserveSpeechAsMuchAsPossible: z.boolean()
  })
  .strict()

const WritableTranscriptionConfigSchema = TranscriptionConfigSchema.extend({
  gemini: WritableGeminiConfigSchema
}).strict()

/** 履歴設定のスキーマ */
export const HistoryConfigSchema = z
  .object({
    maxItems: z
      .number()
      .int('history.maxItems は整数で指定してください')
      .min(1, 'history.maxItems は1件以上で指定してください')
      .max(1000, 'history.maxItems は1000件以下で指定してください')
  })
  .strict()

/** ウィンドウ設定のスキーマ */
export const WindowsConfigSchema = z
  .object({
    status: z
      .object({
        initialPosition: z.literal('top-right-offset', {
          message: 'windows.status.initialPosition は top-right-offset を指定してください'
        })
      })
      .strict(),
    history: z
      .object({
        narrow: z.boolean()
      })
      .strict()
  })
  .strict()

/** 語彙エントリーのスキーマ */
export const VocabularyEntrySchema = z
  .object({
    reading: nonEmptyString('vocabulary.reading は1文字以上で入力してください'),
    output: nonEmptyString('vocabulary.output は1文字以上で入力してください')
  })
  .strict()

/** アプリケーション設定のスキーマ */
export const ConfigSchema = z
  .object({
    app: AppConfigSchema,
    hotkeys: HotkeysConfigSchema,
    recording: RecordingConfigSchema,
    transcription: TranscriptionConfigSchema,
    history: HistoryConfigSchema,
    windows: WindowsConfigSchema,
    vocabulary: z.array(VocabularyEntrySchema)
  })
  .strict()

const WritableConfigSchema = ConfigSchema.extend({
  transcription: WritableTranscriptionConfigSchema
}).strict()

/** デフォルト設定値 */
export const DefaultConfig = {
  app: {
    alwaysOnTop: true
  },
  hotkeys: {
    toggleRecording: {
      windows: 'Control+Shift+D',
      macos: 'Command+Shift+D'
    }
  },
  recording: {
    autoStopSeconds: 300
  },
  transcription: {
    provider: 'gemini',
    gemini: {
      apiKey: '',
      model: 'gemini-2.5-flash'
    },
    language: 'ja-JP',
    preserveSpeechAsMuchAsPossible: true
  },
  history: {
    maxItems: 10
  },
  windows: {
    status: {
      initialPosition: 'top-right-offset'
    },
    history: {
      narrow: true
    }
  },
  vocabulary: []
} satisfies Config

/** 設定ファイルバリデーション結果 */
export type ConfigValidationResult =
  | { success: true; data: Config }
  | { success: false; error: string }

/** 設定ファイルを検証 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config)
}

/** 保存前の設定ファイルを検証 */
export function validateWritableConfig(config: unknown): Config {
  return WritableConfigSchema.parse(config)
}

/** 設定ファイルを安全に検証 */
export function validateConfigSafe(config: unknown): ConfigValidationResult {
  const result = ConfigSchema.safeParse(config)
  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, error: formatConfigValidationError(result.error) }
}
