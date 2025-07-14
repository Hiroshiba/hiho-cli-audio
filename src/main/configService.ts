import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import * as yaml from 'js-yaml'
import { Config } from './types'
import { validateConfig, validateConfigSafe, DefaultConfig, configToSnakeCase } from './schemas'

/** 設定ファイル管理サービス */
export class ConfigService {
  private static instance: ConfigService
  private readonly configDir: string
  private readonly configFile: string

  constructor(configDir: string) {
    this.configDir = configDir
    this.configFile = join(this.configDir, 'config.yaml')
  }

  /** デフォルト設定ディレクトリでインスタンス作成 */
  static createDefault(): ConfigService {
    const defaultConfigDir = join(homedir(), '.config', 'hiho-cli-audio')
    return new ConfigService(defaultConfigDir)
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = ConfigService.createDefault()
    }
    return ConfigService.instance
  }

  /** 設定ファイルの読み込み */
  async loadConfig(): Promise<Config> {
    const configData = await fs.readFile(this.configFile, 'utf-8')
    const parsedConfig = yaml.load(configData) as unknown

    const validationResult = validateConfigSafe(parsedConfig)
    if (!validationResult.success || !validationResult.data) {
      throw new Error(`設定ファイルの検証に失敗しました: ${validationResult.error}`)
    }

    return validationResult.data
  }

  /** 設定ファイルの保存 */
  async saveConfig(config: Config): Promise<void> {
    try {
      const validatedConfig = validateConfig(config)
      const snakeCaseConfig = configToSnakeCase(validatedConfig)

      await fs.mkdir(this.configDir, { recursive: true })
      const yamlData = yaml.dump(snakeCaseConfig, {
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
    const updatedConfig = { ...currentConfig, ...updates }

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
