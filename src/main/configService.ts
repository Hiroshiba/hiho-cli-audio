import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { Config } from './types'
import { validateConfig, validateConfigSafe, mergeWithDefaults, DefaultConfig } from './schemas'

/** 設定ファイル管理サービス */
export class ConfigService {
  private readonly configDir: string
  private readonly configFile: string

  constructor(configDir: string) {
    this.configDir = configDir
    this.configFile = join(this.configDir, 'config.yaml')
  }

  /** デフォルト設定ディレクトリでインスタンス作成 */
  static createDefault(): ConfigService {
    const { homedir } = require('node:os')
    const defaultConfigDir = join(homedir(), '.config', 'hiho-cli-audio')
    return new ConfigService(defaultConfigDir)
  }

  /** 設定ファイルの読み込み */
  async loadConfig(): Promise<Config> {
    try {
      const configData = await fs.readFile(this.configFile, 'utf-8')
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
        await this.saveConfig(DefaultConfig)
        return DefaultConfig
      }

      console.error('設定ファイルの読み込みに失敗しました:', error)
      return DefaultConfig
    }
  }

  /** 設定ファイルの保存 */
  async saveConfig(config: Config): Promise<void> {
    try {
      const validatedConfig = validateConfig(config)

      await fs.mkdir(this.configDir, { recursive: true })
      const yamlData = yaml.dump(validatedConfig, {
        indent: 2,
        lineWidth: 120,
        quotingType: '"',
        forceQuotes: false
      })

      await fs.writeFile(this.configFile, yamlData, 'utf-8')
      console.log('設定ファイルを保存しました:', this.configFile)
    } catch (error) {
      console.error('設定ファイルの保存に失敗しました:', error)
      throw error
    }
  }

  /** 設定の更新 */
  async updateConfig(updates: Partial<Config>): Promise<Config> {
    const currentConfig = await this.loadConfig()
    const updatedConfig = mergeWithDefaults({ ...currentConfig, ...updates })

    await this.saveConfig(updatedConfig)
    return updatedConfig
  }

  /** 設定ファイルの存在確認 */
  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configFile)
      return true
    } catch {
      return false
    }
  }

  /** 設定ファイルのリセット */
  async resetConfig(): Promise<Config> {
    await this.saveConfig(DefaultConfig)
    return DefaultConfig
  }

  /** 設定ファイルのパスを取得 */
  getConfigPath(): string {
    return this.configFile
  }
}