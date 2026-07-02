import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { Config } from './types'
import { StateService } from './stateService'
import { LoggerService } from './loggerService'

const MAIN_WINDOW_STATE_NAME = 'main'

/** ウィンドウ管理サービス
 *
 * 最前面表示について: https://chatgpt.com/share/686af13e-fde8-8008-a8a4-e4b1e4f3ff18
 */
export class WindowService {
  private static instance: WindowService
  private readonly mainWindow: BrowserWindow
  private readonly config: Config
  private readonly loggerService: LoggerService
  private readonly stateService: StateService
  private isQuitting = false

  private constructor(config: Config) {
    this.config = config
    this.loggerService = LoggerService.getInstance()
    this.stateService = StateService.getInstance()
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
    const iconPath =
      process.platform === 'linux' ? join(__dirname, '../../resources/icon.png') : undefined

    // ウィンドウを作成
    const window = new BrowserWindow({
      width: 350,
      height: 600,
      show: false,
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.restoreWindowBounds(window)
    this.setupWindowStatePersistence(window)

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
    if (this.config.app.alwaysOnTop) {
      this.enableAlwaysOnTop()
    } else {
      this.disableAlwaysOnTop()
    }
    console.log('最前面表示設定を適用しました:', this.config.app.alwaysOnTop)
    this.loggerService.infoWithDetails('最前面表示設定を適用しました', this.config.app.alwaysOnTop)
  }

  /** メインウィンドウを取得 */
  getMainWindow(): BrowserWindow {
    return this.mainWindow
  }

  /** 履歴ウィンドウを開く */
  openHistoryWindow(): void {
    if (this.mainWindow.isDestroyed()) {
      throw new Error('メインウィンドウが破棄されているため履歴ウィンドウを開けません')
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore()
    }

    this.mainWindow.show()
    this.mainWindow.focus()
  }

  /** サービスのクリーンアップ */
  cleanup(): void {
    this.isQuitting = true

    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
  }

  private restoreWindowBounds(window: BrowserWindow): void {
    void this.stateService
      .loadWindowBounds(MAIN_WINDOW_STATE_NAME)
      .then((result) => {
        if (result.found) {
          window.setBounds(result.bounds)
          this.loggerService.infoWithDetails('ウィンドウ位置を復元しました', result.bounds)
        }
      })
      .catch((error) => {
        console.error('ウィンドウ位置の復元に失敗しました:', error)
        this.loggerService.error('ウィンドウ位置の復元に失敗しました', error)
      })
  }

  private setupWindowStatePersistence(window: BrowserWindow): void {
    window.on('moved', () => {
      this.saveWindowBounds(window)
    })
    window.on('resized', () => {
      this.saveWindowBounds(window)
    })
    window.on('close', (event) => {
      this.saveWindowBounds(window)

      if (this.isQuitting) {
        return
      }

      event.preventDefault()
      window.hide()
    })
  }

  private saveWindowBounds(window: BrowserWindow): void {
    if (window.isDestroyed()) {
      return
    }

    const bounds = window.getBounds()
    void this.stateService.saveWindowBounds(MAIN_WINDOW_STATE_NAME, bounds).catch((error) => {
      console.error('ウィンドウ位置の保存に失敗しました:', error)
      this.loggerService.error('ウィンドウ位置の保存に失敗しました', error)
    })
  }
}
