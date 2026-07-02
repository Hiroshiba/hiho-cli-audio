import { promises as fs } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { Config } from './types'
import { validateWritableConfig, validateConfigSafe, DefaultConfig } from './schemas'

/** 設定ファイル管理サービス */
export class ConfigService {
  private static instance: ConfigService | null = null
  private readonly configDir: string
  private readonly configFile: string

  constructor(configDir: string) {
    this.configDir = configDir
    this.configFile = join(this.configDir, 'config.yaml')
  }

  /** デフォルト設定ディレクトリでインスタンス作成 */
  static createDefault(): ConfigService {
    const configService = new ConfigService(app.getPath('userData'))
    ConfigService.instance = configService
    return configService
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): ConfigService {
    if (ConfigService.instance == null) {
      ConfigService.instance = ConfigService.createDefault()
    }
    return ConfigService.instance
  }

  /** 設定ファイルの読み込み */
  async loadConfig(): Promise<Config> {
    const configData = await fs.readFile(this.configFile, 'utf-8')
    const parsedConfig = yaml.load(configData) as unknown

    const validationResult = validateConfigSafe(parsedConfig)
    if (!validationResult.success) {
      throw new Error(`設定ファイルの検証に失敗しました: ${validationResult.error}`)
    }

    return validationResult.data
  }

  /** デフォルト設定ファイルを生成 */
  async createDefaultConfigFile(): Promise<void> {
    await this.writeConfig(DefaultConfig)
  }

  /** 設定ファイルを書き込み */
  private async writeConfig(config: Config): Promise<void> {
    try {
      const validatedConfig = validateWritableConfig(config)

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

  /** 設定ファイルの存在確認 */
  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configFile)
      return true
    } catch {
      return false
    }
  }

  /** 設定ファイルのパスを取得 */
  getConfigPath(): string {
    return this.configFile
  }
}
