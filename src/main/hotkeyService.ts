import { globalShortcut } from 'electron'
import { HotkeyConfig } from './types'

/** ホットキーサービス（シングルトン） */
export class HotkeyService {
  private static instance: HotkeyService | null = null
  private readonly config: HotkeyConfig
  private readonly recordingToggleCallback: () => void
  private currentShortcut: string | null = null

  private constructor(config: HotkeyConfig, recordingToggleCallback: () => void) {
    this.config = config
    this.recordingToggleCallback = recordingToggleCallback
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(config: HotkeyConfig, recordingToggleCallback: () => void): HotkeyService {
    if (!HotkeyService.instance) {
      HotkeyService.instance = new HotkeyService(config, recordingToggleCallback)
    }
    return HotkeyService.instance
  }

  /** 既存のシングルトンインスタンスを取得 */
  static getExistingInstance(): HotkeyService {
    if (!HotkeyService.instance) {
      throw new Error('HotkeyService が初期化されていません')
    }
    return HotkeyService.instance
  }

  /** グローバルホットキーを登録 */
  registerHotkeys(): void {
    try {
      const isRegistered = globalShortcut.register(this.config.recordToggle, () => {
        this.recordingToggleCallback()
      })

      if (!isRegistered) {
        const errorMessage =
          `ホットキー '${this.config.recordToggle}' の登録に失敗しました。` +
          '他のアプリケーションが同じホットキーを使用している可能性があります。' +
          (process.platform === 'darwin'
            ? ' macOSの場合、システム環境設定でアクセシビリティ権限が必要な場合があります。'
            : '')
        throw new Error(errorMessage)
      }

      this.currentShortcut = this.config.recordToggle
      console.log(`グローバルホットキーを登録しました: ${this.config.recordToggle}`)
    } catch (error) {
      console.error('ホットキー登録エラー:', error)
      throw error
    }
  }

  /** 現在のホットキーを更新 */
  updateHotkey(newShortcut: string): void {
    this.unregisterCurrentHotkey()

    try {
      const isRegistered = globalShortcut.register(newShortcut, () => {
        this.recordingToggleCallback()
      })

      if (!isRegistered) {
        throw new Error(`ホットキー '${newShortcut}' の登録に失敗しました`)
      }

      this.currentShortcut = newShortcut
      console.log(`グローバルホットキーを更新しました: ${newShortcut}`)
    } catch (error) {
      console.error('ホットキー更新エラー:', error)
      throw error
    }
  }

  /** 現在のホットキーを解除 */
  unregisterCurrentHotkey(): void {
    if (this.currentShortcut) {
      globalShortcut.unregister(this.currentShortcut)
      console.log(`グローバルホットキーを解除しました: ${this.currentShortcut}`)
      this.currentShortcut = null
    }
  }

  /** 現在のホットキー設定を取得 */
  getCurrentHotkey(): string | null {
    return this.currentShortcut
  }

  /** すべてのホットキーを解除してクリーンアップ */
  cleanup(): void {
    this.unregisterCurrentHotkey()
    globalShortcut.unregisterAll()
    console.log('HotkeyService をクリーンアップしました')
  }
}
