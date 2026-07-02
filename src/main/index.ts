import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { AppInitializer } from './appInitializer'
import { WindowService } from './windowService'

let appInitializer: AppInitializer | null = null

function getAppInitializer(): AppInitializer {
  if (appInitializer == null) {
    throw new Error('AppInitializer が初期化されていません')
  }

  return appInitializer
}

// Electron の初期化が完了してからアプリケーションサービスを初期化する
app.whenReady().then(async () => {
  // Windows 用のアプリケーションユーザーモデルIDを設定する
  electronApp.setAppUserModelId('com.electron')

  // 開発中はF12によるDevTools操作を有効にし、本番ではリロードショートカットを無効にする
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  appInitializer = new AppInitializer()
  await appInitializer.initialize()

  ipcMain.on('ping', () => console.log('pong'))

  app.on('activate', async function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const { ConfigService } = await import('./configService')
      const config = await ConfigService.getInstance().loadConfig()
      WindowService.getInstance(config)
    }
  })
})

// macOS以外ではすべてのウィンドウが閉じられたら終了する
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await getAppInitializer().cleanup()
    app.quit()
  }
})

// アプリケーション終了時に各サービスをクリーンアップする
app.on('before-quit', async () => {
  await getAppInitializer().cleanup()
})
