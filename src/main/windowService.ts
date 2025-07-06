import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { Config } from './types'

/** ウィンドウ管理サービス 
 * 
 * 参考: https://chatgpt.com/share/686af13e-fde8-8008-a8a4-e4b1e4f3ff18
 */
export class WindowService {
  private static instance: WindowService
  private readonly mainWindow: BrowserWindow
  private readonly config: Config

  private constructor(config: Config) {
    this.config = config
    this.mainWindow = this.createWindow()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(config: Config): WindowService {
    if (!WindowService.instance) {
      WindowService.instance = new WindowService(config)
    }
    return WindowService.instance
  }

  /** 既存のシングルトンインスタンスを取得 */
  static getExistingInstance(): WindowService {
    if (!WindowService.instance) {
      throw new Error('WindowServiceが初期化されていません')
    }
    return WindowService.instance
  }

  /** メインウィンドウを作成 */
  private createWindow(): BrowserWindow {
    // アイコンの設定
    const iconPath = process.platform === 'linux' ? 
      join(__dirname, '../../resources/icon.png') : undefined

    // ウィンドウを作成
    const window = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // ウィンドウが準備できたら表示
    window.on('ready-to-show', () => {
      window.show()
      this.applyAlwaysOnTopSetting()
    })

    // 外部リンクを外部ブラウザで開く
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 開発環境とプロダクション環境でURLを切り替え
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  /** 最前面表示を有効化 */
  private enableAlwaysOnTop(): void {
    this.mainWindow.setAlwaysOnTop(true)
    
    if (process.platform === 'darwin') {
      // macOS: 全スペース＋フルスクリーンにも表示
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      // レベルを上げる ('floating' ≒ NSPopUpMenuWindowLevel)
      this.mainWindow.setAlwaysOnTop(true, 'floating')
    } else if (process.platform === 'win32') {
      this.mainWindow.setAlwaysOnTop(true, 'normal')
    }
  }

  /** 最前面表示を無効化 */
  private disableAlwaysOnTop(): void {
    this.mainWindow.setAlwaysOnTop(false)
    if (process.platform === 'darwin') {
      this.mainWindow.setVisibleOnAllWorkspaces(false)
    }
  }


  /** 設定に基づいて最前面表示を適用 */
  private applyAlwaysOnTopSetting(): void {
    if (this.config.ui.alwaysOnTop) {
      this.enableAlwaysOnTop()
    } else {
      this.disableAlwaysOnTop()
    }
    console.log('最前面表示設定を適用しました:', this.config.ui.alwaysOnTop)
  }

  /** メインウィンドウを取得 */
  getMainWindow(): BrowserWindow {
    return this.mainWindow
  }

  /** サービスのクリーンアップ */
  cleanup(): void {
    this.mainWindow.close()
  }
}