import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { AppInitializer } from './appInitializer'

let appInitializer: AppInitializer | null = null
let cleanupPromise: Promise<void> | null = null

function cleanupApplication(): Promise<void> {
  if (appInitializer == null) {
    return Promise.resolve()
  }

  if (cleanupPromise == null) {
    cleanupPromise = appInitializer.cleanup()
  }

  return cleanupPromise
}

// Electron の初期化が完了してからアプリケーションサービスを初期化する
app
  .whenReady()
  .then(async () => {
    // Windows 用のアプリケーションユーザーモデルIDを設定する
    electronApp.setAppUserModelId('com.hiho.audio')

    if (process.platform === 'darwin' && app.dock != null) {
      app.dock.hide()
    }

    // 開発中はF12によるDevTools操作を有効にし、本番ではリロードショートカットを無効にする
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    appInitializer = new AppInitializer()
    await appInitializer.initialize()
  })
  .catch((error) => {
    console.error('アプリケーションの起動に失敗しました:', error)
    app.quit()
  })

// ウィンドウを閉じてもトレイ常駐を継続する
app.on('window-all-closed', () => {
  console.log('すべてのウィンドウが閉じられました。トレイ常駐を継続します')
})

// アプリケーション終了時に各サービスをクリーンアップする
app.on('before-quit', async () => {
  await cleanupApplication()
})
