import { z } from 'zod'

/** 音声録音設定のスキーマ */
export const AudioConfigSchema = z.object({
  sampleRate: z.number().min(8000).max(48000),
  channels: z.number().min(1).max(2),
  maxDuration: z.number().min(1).max(3600)
})

/** ホットキー設定のスキーマ */
export const HotkeyConfigSchema = z.object({
  recordToggle: z.string().min(1)
})

/** Gemini API設定のスキーマ */
export const GeminiConfigSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1)
})

/** アプリケーション設定のスキーマ */
export const ConfigSchema = z.object({
  audio: AudioConfigSchema,
  hotkey: HotkeyConfigSchema,
  gemini: GeminiConfigSchema
})

/** デフォルト設定値 */
export const DefaultConfig: z.infer<typeof ConfigSchema> = {
  audio: {
    sampleRate: 16000,
    channels: 1,
    maxDuration: 300
  },
  hotkey: {
    recordToggle: 'Ctrl+Shift+D'
  },
  gemini: {
    apiKey: '',
    model: 'gemini-1.5-flash-latest'
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

/** デフォルト設定とのマージ */
export function mergeWithDefaults(
  config: Partial<z.infer<typeof ConfigSchema>>
): z.infer<typeof ConfigSchema> {
  return {
    ...DefaultConfig,
    ...config,
    audio: { ...DefaultConfig.audio, ...config.audio },
    hotkey: { ...DefaultConfig.hotkey, ...config.hotkey },
    gemini: { ...DefaultConfig.gemini, ...config.gemini }
  }
}
