import { clipboard, dialog } from 'electron'
import { AppError } from '../shared/types/error'
import { LoggerService } from './loggerService'

/** 起動時エラーダイアログ表示サービス */
export class ErrorDialogService {
  private static instance: ErrorDialogService | null = null
  private readonly loggerService: LoggerService

  private constructor() {
    this.loggerService = LoggerService.getInstance()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): ErrorDialogService {
    if (ErrorDialogService.instance == null) {
      ErrorDialogService.instance = new ErrorDialogService()
    }
    return ErrorDialogService.instance
  }

  /** 起動時エラーダイアログを表示 */
  async showStartupErrorDialog(error: AppError): Promise<void> {
    console.error('エラー発生:', error.technicalDetails, error.originalError)
    this.loggerService.error('エラー発生', {
      technicalDetails: error.technicalDetails,
      originalError: error.originalError
    })

    const buttons = this.createButtons()
    const detailText = this.formatDetailText(error)

    try {
      const result = await dialog.showMessageBox({
        type: 'error',
        title: '起動エラー',
        message: error.userMessage,
        detail: detailText,
        buttons,
        defaultId: buttons.indexOf('OK'),
        cancelId: buttons.indexOf('OK')
      })

      if (result.response === buttons.indexOf('エラー詳細をコピー')) {
        await this.copyErrorToClipboard(error)
      }
    } catch (dialogError) {
      console.error('エラーダイアログの表示に失敗しました:', dialogError)
      this.loggerService.error('エラーダイアログの表示に失敗しました', dialogError)
    }
  }

  /** 詳細テキストをフォーマット */
  private formatDetailText(error: AppError): string {
    const parts = [error.technicalDetails, `発生時刻: ${error.timestamp.toLocaleString('ja-JP')}`]

    if (error.source != null && error.source !== '') {
      parts.push(`発生箇所: ${error.source}`)
    }

    return parts.join('\n')
  }

  /** ボタン配列を作成 */
  private createButtons(): string[] {
    return ['エラー詳細をコピー', 'OK']
  }

  /** エラー詳細をクリップボードにコピー */
  private async copyErrorToClipboard(error: AppError): Promise<void> {
    try {
      const errorText = this.formatErrorForClipboard(error)
      clipboard.writeText(errorText)
      console.log('エラー詳細をクリップボードにコピーしました')
      this.loggerService.info('エラー詳細をクリップボードにコピーしました')

      await dialog.showMessageBox({
        type: 'info',
        title: '完了',
        message: 'エラー詳細をクリップボードにコピーしました',
        buttons: ['OK']
      })
    } catch (copyError) {
      console.error('クリップボードへのコピーに失敗しました:', copyError)
      this.loggerService.error('エラー詳細のクリップボードコピーに失敗しました', copyError)

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

    if (error.source != null && error.source !== '') {
      lines.push(`発生箇所: ${error.source}`)
    }

    if (error.originalError != null) {
      lines.push(`元のエラー: ${error.originalError}`)
    }

    return lines.join('\n')
  }
}
