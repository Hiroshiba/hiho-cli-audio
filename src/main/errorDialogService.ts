import { dialog, clipboard } from 'electron'
import { ipcMain } from 'electron'
import { AppError, ErrorDialogOptions } from '../shared/types/error'

/** エラーダイアログ表示サービス */
export class ErrorDialogService {
  private static instance: ErrorDialogService

  private constructor() {
    this.setupIpcHandlers()
  }

  static getInstance(): ErrorDialogService {
    if (!ErrorDialogService.instance) {
      ErrorDialogService.instance = new ErrorDialogService()
    }
    return ErrorDialogService.instance
  }

  static getExistingInstance(): ErrorDialogService {
    if (!ErrorDialogService.instance) {
      throw new Error('ErrorDialogService が初期化されていません')
    }
    return ErrorDialogService.instance
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.handle('error:show', this.handleShowErrorFromRenderer.bind(this))
  }

  /** レンダラープロセスからのエラー表示要求を処理 */
  private async handleShowErrorFromRenderer(
    _event: Electron.IpcMainInvokeEvent,
    error: AppError,
    options?: ErrorDialogOptions
  ): Promise<void> {
    await this.showErrorDialog(error, options)
  }

  /** エラーダイアログを表示 */
  async showErrorDialog(error: AppError, options: ErrorDialogOptions = {}): Promise<void> {
    const { title = 'エラー', showDetails = true, showCopyButton = true } = options

    console.error('エラー発生:', error.technicalDetails, error.originalError)

    const buttons = this.createButtons(showCopyButton)
    const detailText = showDetails ? this.formatDetailText(error) : undefined

    try {
      const result = await dialog.showMessageBox({
        type: 'error',
        title,
        message: error.userMessage,
        detail: detailText,
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1
      })

      if (showCopyButton && result.response === buttons.indexOf('エラー詳細をコピー')) {
        await this.copyErrorToClipboard(error)
      }
    } catch (dialogError) {
      console.error('エラーダイアログの表示に失敗しました:', dialogError)
    }
  }

  /** 詳細テキストをフォーマット */
  private formatDetailText(error: AppError): string {
    const parts = [error.technicalDetails]

    if (error.timestamp) {
      parts.push(`発生時刻: ${error.timestamp.toLocaleString('ja-JP')}`)
    }

    if (error.source) {
      parts.push(`発生箇所: ${error.source}`)
    }

    return parts.join('\n')
  }

  /** ボタン配列を作成 */
  private createButtons(showCopyButton: boolean): string[] {
    const buttons = ['OK']

    if (showCopyButton) {
      buttons.unshift('エラー詳細をコピー')
    }

    return buttons
  }

  /** エラー詳細をクリップボードにコピー */
  private async copyErrorToClipboard(error: AppError): Promise<void> {
    try {
      const errorText = this.formatErrorForClipboard(error)
      clipboard.writeText(errorText)
      console.log('エラー詳細をクリップボードにコピーしました')

      await dialog.showMessageBox({
        type: 'info',
        title: '完了',
        message: 'エラー詳細をクリップボードにコピーしました',
        buttons: ['OK']
      })
    } catch (copyError) {
      console.error('クリップボードへのコピーに失敗しました:', copyError)

      await dialog.showMessageBox({
        type: 'warning',
        title: 'コピー失敗',
        message: 'エラー詳細のコピーに失敗しました',
        buttons: ['OK']
      })
    }
  }

  /** クリップボード用にエラー詳細をフォーマット */
  private formatErrorForClipboard(error: AppError): string {
    const lines = [
      '=== エラー詳細 ===',
      `ユーザー向けメッセージ: ${error.userMessage}`,
      `技術的詳細: ${error.technicalDetails}`,
      `発生時刻: ${error.timestamp.toLocaleString('ja-JP')}`
    ]

    if (error.source) {
      lines.push(`発生箇所: ${error.source}`)
    }

    if (error.originalError) {
      lines.push(`元のエラー: ${error.originalError}`)
    }

    return lines.join('\n')
  }

  /** 簡易エラー表示（文字列のみ） */
  async showSimpleError(userMessage: string, technicalDetails?: string): Promise<void> {
    const error: AppError = {
      userMessage,
      technicalDetails: technicalDetails || userMessage,
      timestamp: new Date()
    }

    await this.showErrorDialog(error)
  }

  /** 緊急時のエラー表示（最小限の機能） */
  async showCriticalError(message: string): Promise<void> {
    try {
      await dialog.showErrorBox('重大なエラー', message)
    } catch (error) {
      console.error('緊急エラーダイアログの表示に失敗しました:', error)
    }
  }

  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeHandler('error:show')
  }
}
