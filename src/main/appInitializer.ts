import { ConfigService } from './configService'
import { ConfigIpcHandler } from './configIpcHandler'

/** アプリケーションの初期化処理 */
export class AppInitializer {
  private configIpcHandler: ConfigIpcHandler | null = null

  /** アプリケーションの初期化 */
  async initialize(): Promise<void> {
    await this.initializeConfigService()
  }

  /** 設定サービスの初期化 */
  private async initializeConfigService(): Promise<void> {
    const configService = ConfigService.createDefault()
    this.configIpcHandler = new ConfigIpcHandler(configService)
    this.configIpcHandler.register()

    await configService.loadConfig()
    console.log('設定ファイル管理サービスを初期化しました')
  }

  /** アプリケーションの終了処理 */
  async cleanup(): Promise<void> {
    if (this.configIpcHandler) {
      this.configIpcHandler.unregister()
      this.configIpcHandler = null
    }
    console.log('アプリケーションのクリーンアップを完了しました')
  }
}