import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
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
    this.tray.setToolTip('hiho-cli-audio')
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
    const iconPath = join(__dirname, '../../resources/icon.png')
    const icon = nativeImage.createFromPath(iconPath)

    if (icon.isEmpty()) {
      throw new Error(`トレイアイコンを読み込めませんでした: ${iconPath}`)
    }

    const trayIcon = icon.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE })
    if (process.platform === 'darwin') {
      trayIcon.setTemplateImage(true)
    }

    return trayIcon
  }

  private createContextMenu(): Menu {
    return Menu.buildFromTemplate([
      {
        label: '履歴を開く',
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
