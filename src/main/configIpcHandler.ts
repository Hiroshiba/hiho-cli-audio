import { ipcMain } from 'electron'
import { ConfigService } from './configService'
import { HotkeyService } from './hotkeyService'
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
      const oldConfig = await this.configService.loadConfig()
      const newConfig = await this.configService.updateConfig(updates)

      if (updates.hotkey && oldConfig.hotkey.recordToggle !== newConfig.hotkey.recordToggle) {
        try {
          const hotkeyService = HotkeyService.getExistingInstance()
          hotkeyService.updateHotkey(newConfig.hotkey.recordToggle)
          console.log(
            `ホットキーを更新しました: ${oldConfig.hotkey.recordToggle} → ${newConfig.hotkey.recordToggle}`
          )
        } catch (error) {
          console.error('ホットキー更新エラー:', error)
        }
      }

      return newConfig
    })

    ipcMain.handle('config:reset', async (): Promise<Config> => {
      const oldConfig = await this.configService.loadConfig()
      const newConfig = await this.configService.resetConfig()

      if (oldConfig.hotkey.recordToggle !== newConfig.hotkey.recordToggle) {
        try {
          const hotkeyService = HotkeyService.getExistingInstance()
          hotkeyService.updateHotkey(newConfig.hotkey.recordToggle)
          console.log(
            `ホットキーをリセットしました: ${oldConfig.hotkey.recordToggle} → ${newConfig.hotkey.recordToggle}`
          )
        } catch (error) {
          console.error('ホットキーリセットエラー:', error)
        }
      }

      return newConfig
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
