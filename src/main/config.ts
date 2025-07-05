import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import * as yaml from 'js-yaml'
import { Config } from './types'
import { validateConfig, validateConfigSafe, mergeWithDefaults, DefaultConfig } from './schemas'

/** 設定ファイルのパス */
const CONFIG_DIR = join(homedir(), '.config', 'hiho-cli-audio')
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml')

/** 設定ファイルの読み込み */
export async function loadConfig(): Promise<Config> {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf-8')
    const parsedConfig = yaml.load(configData) as unknown

    const validationResult = validateConfigSafe(parsedConfig)
    if (!validationResult.success) {
      console.warn('設定ファイルの検証に失敗しました:', validationResult.error)
      console.warn('デフォルト設定を使用します')
      return DefaultConfig
    }

    return mergeWithDefaults(validationResult.data!)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('設定ファイルが見つかりません。デフォルト設定を作成します')
      await saveConfig(DefaultConfig)
      return DefaultConfig
    }

    console.error('設定ファイルの読み込みに失敗しました:', error)
    return DefaultConfig
  }
}

/** 設定ファイルの保存 */
export async function saveConfig(config: Config): Promise<void> {
  try {
    const validatedConfig = validateConfig(config)

    await fs.mkdir(CONFIG_DIR, { recursive: true })
    const yamlData = yaml.dump(validatedConfig, {
      indent: 2,
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false
    })

    await fs.writeFile(CONFIG_FILE, yamlData, 'utf-8')
    console.log('設定ファイルを保存しました:', CONFIG_FILE)
  } catch (error) {
    console.error('設定ファイルの保存に失敗しました:', error)
    throw error
  }
}

/** 設定の更新 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const currentConfig = await loadConfig()
  const updatedConfig = mergeWithDefaults({ ...currentConfig, ...updates })

  await saveConfig(updatedConfig)
  return updatedConfig
}

/** 設定ファイルの存在確認 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(CONFIG_FILE)
    return true
  } catch {
    return false
  }
}

/** 設定ファイルのリセット */
export async function resetConfig(): Promise<Config> {
  await saveConfig(DefaultConfig)
  return DefaultConfig
}
