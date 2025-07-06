import { z } from 'zod'

/** 音声録音設定のスキーマ（スネークケース → キャメルケース変換） */
export const AudioConfigSchema = z.object({
  sample_rate: z.number().min(8000).max(48000).default(16000),
  channels: z.number().min(1).max(2).default(1),
  max_duration: z.number().min(1).max(3600).default(300)
}).transform(data => ({
  sampleRate: data.sample_rate,
  channels: data.channels,
  maxDuration: data.max_duration
}))

/** ホットキー設定のスキーマ（スネークケース → キャメルケース変換） */
export const HotkeyConfigSchema = z.object({
  record_toggle: z.string().min(1).default('CommandOrControl+Shift+D')
}).transform(data => ({
  recordToggle: data.record_toggle
}))

/** Gemini API設定のスキーマ（スネークケース → キャメルケース変換） */
export const GeminiConfigSchema = z.object({
  api_key: z.string().min(1).transform(val => val.trim()).default(''),
  model: z.string().min(1).default('gemini-1.5-flash-latest')
}).transform(data => ({
  apiKey: data.api_key,
  model: data.model
}))

/** UI設定のスキーマ（スネークケース → キャメルケース変換） */
export const UiConfigSchema = z.object({
  always_on_top: z.boolean().default(true)
}).transform(data => ({
  alwaysOnTop: data.always_on_top
}))

/** アプリケーション設定のスキーマ */
export const ConfigSchema = z.object({
  audio: AudioConfigSchema.default({}),
  hotkey: HotkeyConfigSchema.default({}),
  gemini: GeminiConfigSchema.default({}),
  ui: UiConfigSchema.default({})
})

/** デフォルト設定値（キャメルケース） */
export const DefaultConfig = {
  audio: {
    sampleRate: 16000,
    channels: 1,
    maxDuration: 300
  },
  hotkey: {
    recordToggle: 'CommandOrControl+Shift+D'
  },
  gemini: {
    apiKey: '',
    model: 'gemini-1.5-flash-latest'
  },
  ui: {
    alwaysOnTop: true
  }
} as const

/** 設定をスネークケースに変換（保存用） */
export function configToSnakeCase(config: z.infer<typeof ConfigSchema>) {
  return {
    audio: {
      sample_rate: config.audio.sampleRate,
      channels: config.audio.channels,
      max_duration: config.audio.maxDuration
    },
    hotkey: {
      record_toggle: config.hotkey.recordToggle
    },
    gemini: {
      api_key: config.gemini.apiKey,
      model: config.gemini.model
    },
    ui: {
      always_on_top: config.ui.alwaysOnTop
    }
  }
}

/** 設定ファイルバリデーション用の関数 */
export function validateConfig(config: unknown): z.infer<typeof ConfigSchema> {
  return ConfigSchema.parse(config)
}

/** 設定ファイルの安全な検証（エラーを返す） */
export function validateConfigSafe(config: unknown): {
  success: boolean
  data?: z.infer<typeof ConfigSchema>
  error?: string
} {
  const result = ConfigSchema.safeParse(config)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.message }
}
