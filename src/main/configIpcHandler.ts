import { ipcMain } from 'electron'
import { ConfigService } from './configService'
import { Config } from './types'

/** 設定関連のIPC通信ハンドラー */
export class ConfigIpcHandler {
  constructor(private readonly configService: ConfigService) {}

  /** IPC通信ハンドラーを登録 */
  register(): void {
    ipcMain.handle('config:get', async (): Promise<Config> => {
      return await this.configService.loadConfig()
    })

    ipcMain.handle('config:update', async (_, updates: Partial<Config>): Promise<Config> => {
      return await this.configService.updateConfig(updates)
    })

    ipcMain.handle('config:reset', async (): Promise<Config> => {
      return await this.configService.resetConfig()
    })

    ipcMain.handle('config:exists', async (): Promise<boolean> => {
      return await this.configService.configExists()
    })

    ipcMain.handle('config:path', async (): Promise<string> => {
      return this.configService.getConfigPath()
    })
  }

  /** IPC通信ハンドラーを解除 */
  unregister(): void {
    ipcMain.removeAllListeners('config:get')
    ipcMain.removeAllListeners('config:update')
    ipcMain.removeAllListeners('config:reset')
    ipcMain.removeAllListeners('config:exists')
    ipcMain.removeAllListeners('config:path')
  }
}