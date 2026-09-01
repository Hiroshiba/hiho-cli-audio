import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { Config } from './types'
import { StateService } from './stateService'
import { LoggerService } from './loggerService'
import { APP_ICON_PATH } from './appIcon'

const STATUS_WINDOW_STATE_NAME = 'status'
const HISTORY_WINDOW_STATE_NAME = 'history'
const STATUS_WINDOW_WIDTH = 264
const STATUS_WINDOW_HEIGHT = 40
const STATUS_WINDOW_MARGIN_X = 24
const STATUS_WINDOW_MARGIN_Y = 72
const HISTORY_WINDOW_NARROW_WIDTH = 320
const HISTORY_WINDOW_WIDE_WIDTH = 520
const HISTORY_WINDOW_HEIGHT = 520
const RECORDING_WINDOW_WIDTH = 320
const RECORDING_WINDOW_HEIGHT = 240

/** ウィンドウ管理サービス */
export class WindowService {
  private static instance: WindowService | null = null
  private readonly config: Config
  private readonly historyWindow: BrowserWindow
  private readonly loggerService: LoggerService
  private readonly recordingWindow: BrowserWindow
  private readonly stateService: StateService
  private readonly statusWindow: BrowserWindow
  private isQuitting = false

  private constructor(config: Config) {
    this.config = config
    this.loggerService = LoggerService.getInstance()
    this.stateService = StateService.getInstance()
    this.statusWindow = this.createStatusWindow()
    this.historyWindow = this.createHistoryWindow()
    this.recordingWindow = this.createRecordingWindow()
    this.applyAlwaysOnTopSetting()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(config: Config): WindowService {
    if (WindowService.instance == null) {
      WindowService.instance = new WindowService(config)
    }

    return WindowService.instance
  }

  /** 既存のシングルトンインスタンスを取得 */
  static getExistingInstance(): WindowService {
    if (WindowService.instance == null) {
      throw new Error('WindowServiceが初期化されていません')
    }

    return WindowService.instance
  }

  /** 状態ウィンドウを取得 */
  getStatusWindow(): BrowserWindow {
    if (this.statusWindow.isDestroyed()) {
      throw new Error('状態ウィンドウが破棄されています')
    }

    return this.statusWindow
  }

  /** 履歴ウィンドウを取得 */
  getHistoryWindow(): BrowserWindow {
    if (this.historyWindow.isDestroyed()) {
      throw new Error('履歴ウィンドウが破棄されています')
    }

    return this.historyWindow
  }

  /** 録音ウィンドウを取得 */
  getRecordingWindow(): BrowserWindow {
    if (this.recordingWindow.isDestroyed()) {
      throw new Error('録音ウィンドウが破棄されています')
    }

    return this.recordingWindow
  }

  /** 自動停止までの秒数を取得 */
  getRecordingAutoStopSeconds(): number {
    return this.config.recording.autoStopSeconds
  }

  /** 状態ウィンドウを表示 */
  showStatusWindow(): void {
    const statusWindow = this.getStatusWindow()
    statusWindow.showInactive()
    this.moveAlwaysOnTopWindowToFront(statusWindow)
  }

  /** 状態ウィンドウを非表示 */
  hideStatusWindow(): void {
    this.getStatusWindow().hide()
  }

  /** 履歴ウィンドウを開く */
  openHistoryWindow(): void {
    const historyWindow = this.getHistoryWindow()

    if (historyWindow.isMinimized()) {
      historyWindow.restore()
    }

    historyWindow.show()
    this.moveAlwaysOnTopWindowToFront(historyWindow)
    historyWindow.focus()
  }

  /** サービスのクリーンアップ */
  cleanup(): void {
    this.isQuitting = true

    for (const window of [this.statusWindow, this.historyWindow, this.recordingWindow]) {
      if (!window.isDestroyed()) {
        window.close()
      }
    }
  }

  private createStatusWindow(): BrowserWindow {
    const statusWindow = new BrowserWindow({
      ...this.getStatusWindowBounds(),
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.setupExternalLinkHandler(statusWindow)
    this.setupPersistedWindowState(statusWindow, STATUS_WINDOW_STATE_NAME)
    this.loadRendererPage(statusWindow, 'status.html')

    return statusWindow
  }

  private createHistoryWindow(): BrowserWindow {
    const historyWindow = new BrowserWindow({
      width: this.getHistoryWindowWidth(),
      height: HISTORY_WINDOW_HEIGHT,
      minWidth: HISTORY_WINDOW_NARROW_WIDTH,
      minHeight: 360,
      show: false,
      center: true,
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.setupExternalLinkHandler(historyWindow)
    this.setupPersistedWindowState(historyWindow, HISTORY_WINDOW_STATE_NAME)
    this.loadRendererPage(historyWindow, 'history.html')

    return historyWindow
  }

  private createRecordingWindow(): BrowserWindow {
    const recordingWindow = new BrowserWindow({
      width: RECORDING_WINDOW_WIDTH,
      height: RECORDING_WINDOW_HEIGHT,
      show: false,
      skipTaskbar: true,
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        backgroundThrottling: false
      }
    })

    this.setupExternalLinkHandler(recordingWindow)
    this.setupHiddenWindowLifecycle(recordingWindow)
    this.loadRendererPage(recordingWindow, 'recording.html')

    return recordingWindow
  }

  private getStatusWindowBounds(): Electron.Rectangle {
    if (this.config.windows.status.initialPosition !== 'top-right-offset') {
      throw new Error(
        `未対応の状態ウィンドウ初期位置です: ${this.config.windows.status.initialPosition}`
      )
    }

    const { workArea } = screen.getPrimaryDisplay()
    return {
      x: workArea.x + workArea.width - STATUS_WINDOW_WIDTH - STATUS_WINDOW_MARGIN_X,
      y: workArea.y + STATUS_WINDOW_MARGIN_Y,
      width: STATUS_WINDOW_WIDTH,
      height: STATUS_WINDOW_HEIGHT
    }
  }

  private getHistoryWindowWidth(): number {
    if (this.config.windows.history.narrow) {
      return HISTORY_WINDOW_NARROW_WIDTH
    }

    return HISTORY_WINDOW_WIDE_WIDTH
  }

  private applyAlwaysOnTopSetting(): void {
    for (const window of [this.statusWindow, this.historyWindow]) {
      if (this.config.app.alwaysOnTop) {
        this.enableAlwaysOnTop(window)
      } else {
        this.disableAlwaysOnTop(window)
      }
    }

    this.loggerService.infoWithDetails('最前面表示設定を適用しました', {
      alwaysOnTop: this.config.app.alwaysOnTop,
      windows: [STATUS_WINDOW_STATE_NAME, HISTORY_WINDOW_STATE_NAME]
    })
  }

  private enableAlwaysOnTop(window: BrowserWindow): void {
    window.setAlwaysOnTop(true, 'floating')

    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
  }

  private disableAlwaysOnTop(window: BrowserWindow): void {
    window.setAlwaysOnTop(false)

    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(false)
    }
  }

  private moveAlwaysOnTopWindowToFront(window: BrowserWindow): void {
    if (!this.config.app.alwaysOnTop) {
      return
    }

    this.enableAlwaysOnTop(window)
    window.moveTop()
  }

  private setupExternalLinkHandler(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })
  }

  private setupPersistedWindowState(window: BrowserWindow, windowName: string): void {
    this.restoreWindowBounds(window, windowName)
    window.on('moved', () => {
      this.saveWindowBounds(window, windowName)
    })
    window.on('resized', () => {
      this.saveWindowBounds(window, windowName)
    })
    window.on('close', (event) => {
      this.saveWindowBounds(window, windowName)

      if (this.isQuitting) {
        return
      }

      event.preventDefault()
      window.hide()
    })
  }

  private setupHiddenWindowLifecycle(window: BrowserWindow): void {
    window.on('close', (event) => {
      if (this.isQuitting) {
        return
      }

      event.preventDefault()
      window.hide()
    })
  }

  private restoreWindowBounds(window: BrowserWindow, windowName: string): void {
    void this.stateService
      .loadWindowBounds(windowName)
      .then((result) => {
        if (result.found) {
          const bounds =
            windowName === STATUS_WINDOW_STATE_NAME
              ? {
                  x: result.bounds.x + result.bounds.width - STATUS_WINDOW_WIDTH,
                  y: result.bounds.y,
                  width: STATUS_WINDOW_WIDTH,
                  height: STATUS_WINDOW_HEIGHT
                }
              : result.bounds
          window.setBounds(bounds)
          this.loggerService.infoWithDetails('ウィンドウ位置を復元しました', {
            windowName,
            bounds
          })
        }
      })
      .catch((error) => {
        console.error('ウィンドウ位置の復元に失敗しました:', error)
        this.loggerService.error('ウィンドウ位置の復元に失敗しました', error)
      })
  }

  private saveWindowBounds(window: BrowserWindow, windowName: string): void {
    if (window.isDestroyed()) {
      return
    }

    const bounds = window.getBounds()
    void this.stateService.saveWindowBounds(windowName, bounds).catch((error) => {
      console.error('ウィンドウ位置の保存に失敗しました:', error)
      this.loggerService.error('ウィンドウ位置の保存に失敗しました', error)
    })
  }

  private loadRendererPage(window: BrowserWindow, pageName: string): void {
    const loadPromise = this.createRendererPageLoadPromise(window, pageName)
    void loadPromise.catch((error) => {
      console.error(`${pageName} の読み込みに失敗しました:`, error)
      this.loggerService.error(`${pageName} の読み込みに失敗しました`, error)
    })
  }

  private createRendererPageLoadPromise(window: BrowserWindow, pageName: string): Promise<void> {
    if (is.dev) {
      const rendererUrl = process.env['ELECTRON_RENDERER_URL']
      if (rendererUrl == null || rendererUrl === '') {
        throw new Error('開発用レンダラーURLが設定されていません')
      }

      const rendererBaseUrl = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`
      return window.loadURL(new URL(pageName, rendererBaseUrl).toString())
    }

    return window.loadFile(join(__dirname, '../renderer', pageName))
  }
}
