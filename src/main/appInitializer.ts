import { ConfigService } from './configService'
import { ConfigIpcHandler } from './configIpcHandler'
import { AudioIpcHandler } from './audioIpcHandler'
import { GeminiService } from './geminiService'

/** アプリケーションの初期化処理 */
export class AppInitializer {
  private configIpcHandler: ConfigIpcHandler | null = null
  private audioIpcHandler: AudioIpcHandler | null = null
  private configService: ConfigService
  private geminiService: GeminiService

  constructor() {
    this.configService = ConfigService.createDefault()
    this.geminiService = GeminiService.getInstance()
  }

  /** アプリケーションの初期化 */
  async initialize(): Promise<void> {
    await this.initializeConfigService()
    await this.initializeGeminiService()
    this.initializeAudioService()
  }

  /** 設定サービスの初期化 */
  private async initializeConfigService(): Promise<void> {
    this.configIpcHandler = new ConfigIpcHandler(this.configService)
    this.configIpcHandler.register()

    await this.configService.loadConfig()
    console.log('設定ファイル管理サービスを初期化しました')
  }

  /** Gemini サービスの初期化 */
  private async initializeGeminiService(): Promise<void> {
    const config = await this.configService.loadConfig()
    this.geminiService.initialize(config.gemini)
    console.log('Gemini サービスを初期化しました')
  }

  /** 音声サービスの初期化 */
  private initializeAudioService(): void {
    this.audioIpcHandler = new AudioIpcHandler()
    console.log('音声処理サービスを初期化しました')
  }

  /** アプリケーションの終了処理 */
  async cleanup(): Promise<void> {
    if (this.audioIpcHandler) {
      this.audioIpcHandler.cleanup()
      this.audioIpcHandler = null
    }

    if (this.configIpcHandler) {
      this.configIpcHandler.unregister()
      this.configIpcHandler = null
    }

    this.geminiService.cleanup()
    console.log('アプリケーションのクリーンアップを完了しました')
  }
}