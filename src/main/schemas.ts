import { z } from 'zod'

/** 音声録音設定のスキーマ（スネークケース → キャメルケース変換） */
export const AudioConfigSchema = z
  .object({
    sample_rate: z.number().min(8000).max(48000).default(16000),
    channels: z.number().min(1).max(2).default(1),
    max_duration: z.number().min(1).max(3600).default(300)
  })
  .transform((data) => ({
    sampleRate: data.sample_rate,
    channels: data.channels,
    maxDuration: data.max_duration
  }))

/** ホットキー設定のスキーマ（スネークケース → キャメルケース変換） */
export const HotkeyConfigSchema = z
  .object({
    record_toggle: z.string().min(1).default('CommandOrControl+Shift+D')
  })
  .transform((data) => ({
    recordToggle: data.record_toggle
  }))

/** Gemini API設定のスキーマ（スネークケース → キャメルケース変換） */
export const GeminiConfigSchema = z
  .object({
    api_key: z
      .string()
      .min(1)
      .transform((val) => val.trim())
      .default(''),
    model: z.string().min(1).default('gemini-1.5-flash-latest')
  })
  .transform((data) => ({
    apiKey: data.api_key,
    model: data.model
  }))

/** UI設定のスキーマ（スネークケース → キャメルケース変換） */
export const UiConfigSchema = z
  .object({
    always_on_top: z.boolean().default(true)
  })
  .transform((data) => ({
    alwaysOnTop: data.always_on_top
  }))

/** 語彙エントリーのスキーマ */
export const VocabularyEntrySchema = z.object({
  reading: z.string().min(1, '読み方は1文字以上で入力してください'),
  output: z.string().min(1, '認識結果は1文字以上で入力してください'),
  description: z.string().optional()
})

/** 語彙設定のスキーマ */
export const VocabularyConfigSchema = z
  .object({
    entries: z.array(VocabularyEntrySchema).default([])
  })
  .default({ entries: [] })

/** アプリケーション設定のスキーマ */
export const ConfigSchema = z.object({
  audio: AudioConfigSchema.default({}),
  hotkey: HotkeyConfigSchema.default({}),
  gemini: GeminiConfigSchema.default({}),
  ui: UiConfigSchema.default({}),
  vocabulary: VocabularyConfigSchema.default({})
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
  },
  vocabulary: {
    entries: [
      {
        reading: 'めがしんく',
        output: 'megathink',
        description: 'メガシンクと発音してmegathinkと出力'
      },
      {
        reading: 'うるとらしんく',
        output: 'ultrathink',
        description: 'ウルトラシンクと発音してultrathinkと出力'
      }
    ]
  }
} as const

/** 設定をスネークケースに変換（保存用） */
export function configToSnakeCase(config: z.infer<typeof ConfigSchema>): {
  audio: {
    sample_rate: number
    channels: number
    max_duration: number
  }
  hotkey: {
    record_toggle: string
  }
  gemini: {
    api_key: string
    model: string
  }
  ui: {
    always_on_top: boolean
  }
  vocabulary: {
    entries: Array<{
      reading: string
      output: string
      description?: string
    }>
  }
} {
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
    },
    vocabulary: {
      entries: config.vocabulary.entries
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
