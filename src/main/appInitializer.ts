import { ConfigService } from './configService'
import { AudioIpcHandler } from './audioIpcHandler'
import { GeminiService } from './geminiService'
import { HotkeyService } from './hotkeyService'
import { WindowService } from './windowService'
import { ErrorDialogService } from './errorDialogService'
import { LoggerService } from './loggerService'
import { createError } from '../shared/types/error'

/** アプリケーションの初期化処理 */
export class AppInitializer {
  private readonly configService: ConfigService
  private readonly geminiService: GeminiService
  private readonly audioIpcHandler: AudioIpcHandler
  private readonly errorDialogService: ErrorDialogService
  private readonly loggerService: LoggerService

  constructor() {
    this.loggerService = LoggerService.getInstance()
    this.configService = ConfigService.createDefault()
    this.geminiService = GeminiService.getInstance()
    this.audioIpcHandler = new AudioIpcHandler()
    this.errorDialogService = ErrorDialogService.getInstance()
  }

  /** アプリケーションの初期化 */
  async initialize(): Promise<void> {
    try {
      await this.initializeConfigService()
      await this.initializeGeminiService()
      await this.initializeWindowService()
      await this.initializeHotkeyService()
      console.log('アプリケーションの初期化が完了しました')
      this.loggerService.info('アプリケーションの初期化が完了しました')
    } catch (error) {
      this.loggerService.error('アプリケーションの初期化に失敗しました', error)
      const appError = createError(
        'アプリケーションの初期化に失敗しました。アプリケーションを再起動してください。',
        `初期化エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      throw error
    }
  }

  /** 設定サービスの初期化 */
  private async initializeConfigService(): Promise<void> {
    try {
      const configExists = await this.configService.configExists()
      if (!configExists) {
        console.log('設定ファイルが見つかりません。デフォルト設定で作成します...')
        this.loggerService.info('設定ファイルが見つかりません。デフォルト設定で作成します')
        await this.configService.createDefaultConfigFile()
        console.log(
          `設定ファイルを作成しました: ${this.configService.getConfigPath()}\nGemini APIキーを設定してください。`
        )
        this.loggerService.infoWithDetails(
          '設定ファイルを作成しました。Gemini APIキーを設定してください',
          this.configService.getConfigPath()
        )
      }

      await this.configService.loadConfig()
      console.log('設定ファイル管理サービスを初期化しました')
      this.loggerService.info('設定ファイル管理サービスを初期化しました')
    } catch (error) {
      this.loggerService.error('設定ファイル管理サービスの初期化に失敗しました', error)
      const appError = createError(
        '設定ファイルの読み込みに失敗しました。設定ファイルを確認してください。',
        `設定サービス初期化エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      throw new Error(`設定サービス初期化エラー: ${error}`)
    }
  }

  /** Gemini サービスの初期化 */
  private async initializeGeminiService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()
      this.geminiService.initialize(config.transcription.gemini)
      console.log('Gemini サービスを初期化しました')
      this.loggerService.info('Gemini サービスを初期化しました')
    } catch (error) {
      this.loggerService.error('Gemini サービスの初期化に失敗しました', error)
      const appError = createError(
        'Gemini API の初期化に失敗しました。APIキーを確認してください。',
        `Gemini サービス初期化エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      throw new Error(`Gemini サービス初期化エラー: ${error}`)
    }
  }

  /** ウィンドウサービスの初期化 */
  private async initializeWindowService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()
      WindowService.getInstance(config)
      console.log('ウィンドウサービスを初期化しました')
      this.loggerService.info('ウィンドウサービスを初期化しました')
    } catch (error) {
      this.loggerService.error('ウィンドウサービスの初期化に失敗しました', error)
      const appError = createError(
        'ウィンドウの初期化に失敗しました。',
        `ウィンドウサービス初期化エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      throw new Error(`ウィンドウサービス初期化エラー: ${error}`)
    }
  }

  /** ホットキーサービスの初期化 */
  private async initializeHotkeyService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()

      const recordingToggleCallback = (): void => {
        console.log('録音トグルが実行されました')
        this.loggerService.info('録音トグルが実行されました')
        this.audioIpcHandler.toggleRecording()
      }

      const hotkeyService = HotkeyService.getInstance(config.hotkeys, recordingToggleCallback)
      hotkeyService.registerHotkeys()
      console.log('ホットキーサービスを初期化しました')
      this.loggerService.info('ホットキーサービスを初期化しました')
    } catch (error) {
      this.loggerService.error('ホットキーサービスの初期化に失敗しました', error)
      const appError = createError(
        'ホットキーの登録に失敗しました。他のアプリケーションがホットキーを使用している可能性があります。',
        `ホットキーサービス初期化エラー: ${error}`,
        error instanceof Error ? error : undefined
      )
      this.errorDialogService.showErrorDialog(appError)
      throw new Error(`ホットキーサービス初期化エラー: ${error}`)
    }
  }

  /** アプリケーションの終了処理 */
  async cleanup(): Promise<void> {
    console.log('アプリケーションのクリーンアップを開始します')
    this.loggerService.info('アプリケーションのクリーンアップを開始します')

    try {
      const hotkeyService = HotkeyService.getExistingInstance()
      hotkeyService.cleanup()
    } catch (error) {
      console.error('ホットキーサービスのクリーンアップエラー:', error)
      this.loggerService.error('ホットキーサービスのクリーンアップに失敗しました', error)
    }

    try {
      this.audioIpcHandler.cleanup()
    } catch (error) {
      console.error('音声IPCハンドラーのクリーンアップエラー:', error)
      this.loggerService.error('音声IPCハンドラーのクリーンアップに失敗しました', error)
    }

    try {
      this.errorDialogService.cleanup()
    } catch (error) {
      console.error('エラーダイアログサービスのクリーンアップエラー:', error)
      this.loggerService.error('エラーダイアログサービスのクリーンアップに失敗しました', error)
    }

    try {
      const windowService = WindowService.getExistingInstance()
      windowService.cleanup()
    } catch (error) {
      console.error('ウィンドウサービスのクリーンアップエラー:', error)
      this.loggerService.error('ウィンドウサービスのクリーンアップに失敗しました', error)
    }

    try {
      this.geminiService.cleanup()
    } catch (error) {
      console.error('Geminiサービスのクリーンアップエラー:', error)
      this.loggerService.error('Gemini サービスのクリーンアップに失敗しました', error)
    }

    console.log('アプリケーションのクリーンアップを完了しました')
    this.loggerService.info('アプリケーションのクリーンアップを完了しました')
  }
}
