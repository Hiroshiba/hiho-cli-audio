import { promises as fs } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { Config } from './types'
import { validateWritableConfig, validateConfigSafe, DefaultConfig } from './schemas'
import { writeFileAtomic } from './atomicFile'
import { LoggerService } from './loggerService'

/** 設定ファイル管理サービス */
export class ConfigService {
  private static instance: ConfigService | null = null
  private config: Config | null = null
  private readonly loggerService: LoggerService
  private readonly configDir: string
  private readonly configFile: string

  constructor(configDir: string) {
    this.loggerService = LoggerService.getInstance()
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

  /** 設定ファイルを読み込んで保持 */
  async initializeConfig(): Promise<Config> {
    if (this.config != null) {
      throw new Error('設定ファイルは既に読み込み済みです')
    }

    const config = await this.readConfigFile()
    this.config = config
    return config
  }

  /** 起動時に読み込んだ設定を取得 */
  getConfig(): Config {
    if (this.config == null) {
      throw new Error('設定ファイルが読み込まれていません')
    }

    return this.config
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

      await writeFileAtomic(this.configFile, yamlData)
      console.log('設定ファイルを保存しました:', this.configFile)
      this.loggerService.infoWithDetails('設定ファイルを保存しました', this.configFile)
    } catch (error) {
      console.error('設定ファイルの保存に失敗しました:', error)
      this.loggerService.error('設定ファイルの保存に失敗しました', error)
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

  private async readConfigFile(): Promise<Config> {
    const configData = await fs.readFile(this.configFile, 'utf-8')
    const parsedConfig = yaml.load(configData) as unknown

    const validationResult = validateConfigSafe(parsedConfig)
    if (!validationResult.success) {
      throw new Error(`設定ファイルの検証に失敗しました: ${validationResult.error}`)
    }

    return validationResult.data
  }
}
