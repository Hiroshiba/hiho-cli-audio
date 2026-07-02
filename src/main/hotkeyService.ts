import { globalShortcut } from 'electron'
import { HotkeysConfig } from './types'
import { LoggerService } from './loggerService'

/** ホットキーサービス（シングルトン） */
export class HotkeyService {
  private static instance: HotkeyService | null = null
  private readonly loggerService: LoggerService
  private readonly config: HotkeysConfig
  private readonly recordingToggleCallback: () => void
  private currentShortcut: string | null = null

  private constructor(config: HotkeysConfig, recordingToggleCallback: () => void) {
    this.loggerService = LoggerService.getInstance()
    this.config = config
    this.recordingToggleCallback = recordingToggleCallback
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(config: HotkeysConfig, recordingToggleCallback: () => void): HotkeyService {
    if (HotkeyService.instance == null) {
      HotkeyService.instance = new HotkeyService(config, recordingToggleCallback)
    }
    return HotkeyService.instance
  }

  /** 既存のシングルトンインスタンスを取得 */
  static getExistingInstance(): HotkeyService {
    if (HotkeyService.instance == null) {
      throw new Error('HotkeyService が初期化されていません')
    }
    return HotkeyService.instance
  }

  /** グローバルホットキーを登録 */
  registerHotkeys(): void {
    try {
      const shortcut = this.getToggleRecordingHotkey()
      const isRegistered = globalShortcut.register(shortcut, () => {
        this.recordingToggleCallback()
      })

      if (!isRegistered) {
        const errorMessage =
          `ホットキー '${shortcut}' の登録に失敗しました。` +
          '他のアプリケーションが同じホットキーを使用している可能性があります。' +
          (process.platform === 'darwin'
            ? ' macOSの場合、システム環境設定でアクセシビリティ権限が必要な場合があります。'
            : '')
        throw new Error(errorMessage)
      }

      this.currentShortcut = shortcut
      console.log(`グローバルホットキーを登録しました: ${shortcut}`)
      this.loggerService.infoWithDetails('グローバルホットキーを登録しました', shortcut)
    } catch (error) {
      console.error('ホットキー登録エラー:', error)
      this.loggerService.error('ホットキー登録に失敗しました', error)
      throw error
    }
  }

  private getToggleRecordingHotkey(): string {
    if (process.platform === 'win32') {
      return this.config.toggleRecording.windows
    }

    if (process.platform === 'darwin') {
      return this.config.toggleRecording.macos
    }

    throw new Error(`未対応OSのためホットキーを登録できません: ${process.platform}`)
  }

  /** 現在のホットキーを解除 */
  unregisterCurrentHotkey(): void {
    if (this.currentShortcut != null) {
      globalShortcut.unregister(this.currentShortcut)
      console.log(`グローバルホットキーを解除しました: ${this.currentShortcut}`)
      this.loggerService.infoWithDetails('グローバルホットキーを解除しました', this.currentShortcut)
      this.currentShortcut = null
    }
  }

  /** すべてのホットキーを解除してクリーンアップ */
  cleanup(): void {
    this.unregisterCurrentHotkey()
    globalShortcut.unregisterAll()
    console.log('HotkeyService をクリーンアップしました')
    this.loggerService.info('HotkeyService をクリーンアップしました')
  }
}
