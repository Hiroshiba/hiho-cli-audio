import { autoUpdater } from 'electron-updater'
import { app, dialog } from 'electron'

/**
 * 自動アップデート機能を管理するサービス
 */
export class UpdaterService {
  private static instance: UpdaterService
  private isUpdateCheckInProgress: boolean

  private constructor() {
    this.isUpdateCheckInProgress = false
    this.setupAutoUpdater()
  }

  static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService()
    }
    return UpdaterService.instance
  }

  static getExistingInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      throw new Error('UpdaterServiceが初期化されていません')
    }
    return UpdaterService.instance
  }

  /**
   * 自動アップデート機能の初期化
   */
  private setupAutoUpdater(): void {
    // 開発環境では無効化（公式推奨方法）
    if (!app.isPackaged) {
      return
    }

    // 更新確認の設定（checkForUpdatesAndNotify用）
    autoUpdater.autoDownload = true // checkForUpdatesAndNotifyに合わせて自動ダウンロード有効
    autoUpdater.autoInstallOnAppQuit = true

    // エラー処理のみイベントハンドラーを設定
    autoUpdater.on('error', (error) => {
      console.error('アップデートエラー:', error)
      this.isUpdateCheckInProgress = false
    })

    // 更新完了時の追加ログ出力
    autoUpdater.on('update-downloaded', () => {
      console.log('アップデートのダウンロードが完了しました')
    })
  }

  /**
   * 更新確認を実行（自動通知付き）
   */
  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged || this.isUpdateCheckInProgress) {
      return
    }

    try {
      this.isUpdateCheckInProgress = true
      console.log('更新確認を開始します')
      await autoUpdater.checkForUpdatesAndNotify()
    } catch (error) {
      console.error('更新確認に失敗しました:', error)
    } finally {
      this.isUpdateCheckInProgress = false
    }
  }

  /**
   * 手動更新確認（メニューなどから呼び出し）
   */
  async checkForUpdatesManually(): Promise<void> {
    if (!app.isPackaged) {
      await dialog.showMessageBox({
        type: 'info',
        title: '開発環境',
        message: '開発環境では自動更新は利用できません。'
      })
      return
    }

    // checkForUpdatesAndNotify()は更新がない場合も自動通知する
    await this.checkForUpdates()
  }

  /**
   * サービスの初期化
   */
  async initialize(): Promise<void> {
    console.log('UpdaterServiceを初期化しました')

    // アプリ起動時に自動的に更新確認（起動から5秒後）
    setTimeout(() => {
      this.checkForUpdates()
    }, 5000)
  }

  /**
   * サービスのクリーンアップ
   */
  async cleanup(): Promise<void> {
    console.log('UpdaterServiceをクリーンアップしました')
    // 必要に応じてクリーンアップ処理を追加
  }
}
