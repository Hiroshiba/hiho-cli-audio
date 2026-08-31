import { readFileSync } from 'node:fs'
import { app, Menu, nativeImage, Tray } from 'electron'
import { APP_ICON_PATH, MACOS_TRAY_ICON_1X_PATH, MACOS_TRAY_ICON_2X_PATH } from './appIcon'
import { LoggerService } from './loggerService'
import { WindowService } from './windowService'

const TRAY_ICON_SIZE = 16

/** トレイ常駐サービス */
export class TrayService {
  private static instance: TrayService | null = null
  private readonly loggerService: LoggerService
  private tray: Tray | null = null

  private constructor() {
    this.loggerService = LoggerService.getInstance()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): TrayService {
    if (TrayService.instance == null) {
      TrayService.instance = new TrayService()
    }

    return TrayService.instance
  }

  /** 既存のシングルトンインスタンスを取得 */
  static getExistingInstance(): TrayService {
    if (TrayService.instance == null) {
      throw new Error('TrayService が初期化されていません')
    }

    return TrayService.instance
  }

  /** トレイを初期化 */
  initialize(): void {
    if (this.tray != null) {
      throw new Error('TrayService はすでに初期化されています')
    }

    this.tray = new Tray(this.createTrayIcon())
    this.tray.setToolTip('hiho-cli-audio 音声録音と文字起こし')
    this.tray.setContextMenu(this.createContextMenu())
    this.loggerService.info('トレイ常駐サービスを初期化しました')
  }

  /** トレイを破棄 */
  cleanup(): void {
    if (this.tray == null) {
      return
    }

    this.tray.destroy()
    this.tray = null
    this.loggerService.info('トレイ常駐サービスをクリーンアップしました')
  }

  private createTrayIcon(): Electron.NativeImage {
    if (process.platform === 'darwin') {
      return this.createMacOSTrayIcon()
    }

    const icon = nativeImage.createFromPath(APP_ICON_PATH)

    if (icon.isEmpty()) {
      throw new Error(`トレイアイコンを読み込めませんでした: ${APP_ICON_PATH}`)
    }

    return icon.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE })
  }

  private createMacOSTrayIcon(): Electron.NativeImage {
    const trayIcon = nativeImage.createEmpty()
    trayIcon.addRepresentation({
      scaleFactor: 1,
      dataURL: this.createPngDataUrl(MACOS_TRAY_ICON_1X_PATH)
    })
    trayIcon.addRepresentation({
      scaleFactor: 2,
      dataURL: this.createPngDataUrl(MACOS_TRAY_ICON_2X_PATH)
    })

    if (trayIcon.isEmpty()) {
      throw new Error('macOS 用トレイアイコンを読み込めませんでした')
    }

    const scaleFactors = trayIcon.getScaleFactors()
    if (!scaleFactors.includes(1) || !scaleFactors.includes(2)) {
      throw new Error('macOS 用トレイアイコンの解像度が不足しています')
    }

    trayIcon.setTemplateImage(true)
    if (!trayIcon.isTemplateImage()) {
      throw new Error('macOS 用トレイアイコンをテンプレート画像に設定できませんでした')
    }

    return trayIcon
  }

  private createPngDataUrl(path: string): string {
    return `data:image/png;base64,${readFileSync(path).toString('base64')}`
  }

  private createContextMenu(): Menu {
    return Menu.buildFromTemplate([
      {
        label: '文字起こし履歴を開く',
        click: () => {
          this.openHistoryWindow()
        }
      },
      {
        label: '終了',
        click: () => {
          this.quitApplication()
        }
      }
    ])
  }

  private openHistoryWindow(): void {
    WindowService.getExistingInstance().openHistoryWindow()
    this.loggerService.info('履歴ウィンドウを開きました')
  }

  private quitApplication(): void {
    this.loggerService.info('トレイメニューからアプリケーションを終了します')
    app.quit()
  }
}
