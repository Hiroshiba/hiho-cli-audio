import { ConfigService } from './configService'
import { ConfigIpcHandler } from './configIpcHandler'
import { AudioIpcHandler } from './audioIpcHandler'
import { GeminiService } from './geminiService'
import { HotkeyService } from './hotkeyService'
import { WindowService } from './windowService'
import { UpdaterService } from './updaterService'

/** アプリケーションの初期化処理 */
export class AppInitializer {
  private readonly configService: ConfigService
  private readonly geminiService: GeminiService
  private readonly configIpcHandler: ConfigIpcHandler
  private readonly audioIpcHandler: AudioIpcHandler

  constructor() {
    this.configService = ConfigService.createDefault()
    this.geminiService = GeminiService.getInstance()
    this.configIpcHandler = new ConfigIpcHandler(this.configService)
    this.audioIpcHandler = new AudioIpcHandler()
  }

  /** アプリケーションの初期化 */
  async initialize(): Promise<void> {
    try {
      await this.initializeConfigService()
      await this.initializeGeminiService()
      await this.initializeWindowService()
      await this.initializeHotkeyService()
      await this.initializeUpdaterService()
      console.log('アプリケーションの初期化が完了しました')
    } catch (error) {
      console.error('アプリケーションの初期化に失敗しました:', error)
      throw error
    }
  }

  /** 設定サービスの初期化 */
  private async initializeConfigService(): Promise<void> {
    try {
      this.configIpcHandler.register()
      await this.configService.loadConfig()
      console.log('設定ファイル管理サービスを初期化しました')
    } catch (error) {
      console.error('設定サービスの初期化に失敗しました:', error)
      throw new Error(`設定サービス初期化エラー: ${error}`)
    }
  }

  /** Gemini サービスの初期化 */
  private async initializeGeminiService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()
      this.geminiService.initialize(config.gemini)
      console.log('Gemini サービスを初期化しました')
    } catch (error) {
      console.error('Gemini サービスの初期化に失敗しました:', error)
      throw new Error(`Gemini サービス初期化エラー: ${error}`)
    }
  }

  /** ウィンドウサービスの初期化 */
  private async initializeWindowService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()
      WindowService.getInstance(config)
      console.log('ウィンドウサービスを初期化しました')
    } catch (error) {
      console.error('ウィンドウサービスの初期化に失敗しました:', error)
      throw new Error(`ウィンドウサービス初期化エラー: ${error}`)
    }
  }

  /** ホットキーサービスの初期化 */
  private async initializeHotkeyService(): Promise<void> {
    try {
      const config = await this.configService.loadConfig()

      const recordingToggleCallback = (): void => {
        console.log('録音トグルが実行されました')
        this.audioIpcHandler.toggleRecording()
      }

      const hotkeyService = HotkeyService.getInstance(config.hotkey, recordingToggleCallback)
      hotkeyService.registerHotkeys()
      console.log('ホットキーサービスを初期化しました')
    } catch (error) {
      console.error('ホットキーサービスの初期化に失敗しました:', error)
      throw new Error(`ホットキーサービス初期化エラー: ${error}`)
    }
  }

  /** アップデートサービスの初期化 */
  private async initializeUpdaterService(): Promise<void> {
    try {
      const updaterService = UpdaterService.getInstance()
      await updaterService.initialize()
      console.log('アップデートサービスを初期化しました')
    } catch (error) {
      console.error('アップデートサービスの初期化に失敗しました:', error)
      throw new Error(`アップデートサービス初期化エラー: ${error}`)
    }
  }

  /** アプリケーションの終了処理 */
  async cleanup(): Promise<void> {
    console.log('アプリケーションのクリーンアップを開始します')

    try {
      const hotkeyService = HotkeyService.getExistingInstance()
      hotkeyService.cleanup()
    } catch (error) {
      console.error('ホットキーサービスのクリーンアップエラー:', error)
    }

    try {
      this.audioIpcHandler.cleanup()
    } catch (error) {
      console.error('音声IPCハンドラーのクリーンアップエラー:', error)
    }

    try {
      this.configIpcHandler.unregister()
    } catch (error) {
      console.error('設定IPCハンドラーのクリーンアップエラー:', error)
    }

    try {
      const windowService = WindowService.getExistingInstance()
      windowService.cleanup()
    } catch (error) {
      console.error('ウィンドウサービスのクリーンアップエラー:', error)
    }

    try {
      this.geminiService.cleanup()
    } catch (error) {
      console.error('Geminiサービスのクリーンアップエラー:', error)
    }

    try {
      const updaterService = UpdaterService.getExistingInstance()
      await updaterService.cleanup()
    } catch (error) {
      console.error('アップデートサービスのクリーンアップエラー:', error)
    }

    console.log('アプリケーションのクリーンアップを完了しました')
  }
}
