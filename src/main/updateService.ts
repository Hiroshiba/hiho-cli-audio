import type { LoggerService } from './loggerService'
import type { TrayService } from './trayService'

const UPDATE_CHECK_INTERVAL_MILLISECONDS = 60 * 60 * 1000
const RESTART_WAIT_INTERVAL_MILLISECONDS = 1000

interface UpdateClient {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  disableWebInstaller: boolean
  setFeedURL(options: { provider: 'github'; owner: string; repo: string }): void
  checkForUpdates(): Promise<{ readonly downloadPromise?: Promise<string[]> | null } | null>
  quitAndInstall(): void | Promise<void>
  on(event: 'update-downloaded', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  removeListener(event: 'update-downloaded', listener: () => void): unknown
  removeListener(event: 'error', listener: (error: Error) => void): unknown
}

interface UpdateServiceDependencies {
  updater: UpdateClient
  trayService: Pick<TrayService, 'setUpdateRestartAction'>
  loggerService: Pick<LoggerService, 'info' | 'error'>
  isPackaged: boolean
  platform: NodeJS.Platform
  architecture: string
  canRestart: () => boolean
  prepareForRestart: () => Promise<void>
  cancelRestartPreparation: () => void
}

/** 署名済みアプリの自動更新を管理するサービス */
export class UpdateService {
  private readonly dependencies: UpdateServiceDependencies
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private restartTimer: ReturnType<typeof setInterval> | null = null
  private isChecking = false
  private checkErrorReported = false
  private isDownloaded = false
  private isRetryBlocked = false
  private isRestartPending = false
  private isRestartPreparationActive = false
  private isStarted = false
  private isStopped = false
  private reportedInstallErrors = new WeakSet<Error>()

  constructor(dependencies: UpdateServiceDependencies) {
    this.dependencies = dependencies
  }

  /** パッケージ版で更新確認を開始する */
  start(): void {
    if (this.isStarted || this.isStopped) {
      throw new Error('自動更新サービスはすでに開始されています')
    }

    this.isStarted = true
    const { isPackaged, platform, architecture, updater, loggerService } = this.dependencies
    if (!isPackaged || architecture !== 'x64' || (platform !== 'win32' && platform !== 'darwin')) {
      loggerService.info('自動更新の対象外のため確認を開始しません')
      return
    }

    updater.autoDownload = true
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.disableWebInstaller = true
    updater.setFeedURL({ provider: 'github', owner: 'Hiroshiba', repo: 'hiho-cli-audio' })
    updater.on('update-downloaded', this.handleUpdateDownloaded)
    updater.on('error', this.handleError)

    this.checkTimer = setInterval(() => {
      void this.checkForUpdates()
    }, UPDATE_CHECK_INTERVAL_MILLISECONDS)
    void this.checkForUpdates()
  }

  /** 更新確認と再起動待機を停止する */
  cleanup(): void {
    this.isStopped = true
    if (this.checkTimer != null) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    this.clearRestartTimer()

    if (this.isStarted && this.dependencies.isPackaged) {
      this.dependencies.updater.removeListener('update-downloaded', this.handleUpdateDownloaded)
      this.dependencies.updater.removeListener('error', this.handleError)
    }
  }

  private readonly handleUpdateDownloaded = (): void => {
    if (this.isStopped || this.isRetryBlocked) {
      return
    }

    this.isDownloaded = true
    this.dependencies.loggerService.info('更新のダウンロードが完了しました')
    this.showRestartAction()
  }

  private readonly handleError = (error: Error): void => {
    if (this.isStopped || this.reportedInstallErrors.has(error)) {
      return
    }

    if (this.isRestartPreparationActive) {
      this.failInstall(error)
      return
    }

    this.dependencies.loggerService.error('自動更新に失敗しました', error)
    if (this.isChecking) {
      this.checkErrorReported = true
    }

    if (isNonRetryableUpdateError(error)) {
      this.isRetryBlocked = true
    }
    if (this.isRetryBlocked || (this.isChecking && this.isDownloaded)) {
      this.clearDownloadedUpdate()
    }
  }

  private async checkForUpdates(): Promise<void> {
    if (this.isChecking || this.isDownloaded || this.isRetryBlocked || this.isStopped) {
      return
    }

    this.isChecking = true
    try {
      const result = await this.dependencies.updater.checkForUpdates()
      if (result == null) {
        throw new Error('パッケージ版の更新確認が無効です')
      }

      if (result.downloadPromise != null) {
        await result.downloadPromise
      }
    } catch (error) {
      if (isNonRetryableUpdateError(error)) {
        this.isRetryBlocked = true
        this.clearDownloadedUpdate()
      }
      if (!this.checkErrorReported) {
        this.dependencies.loggerService.error(
          '自動更新の確認またはダウンロードに失敗しました',
          error
        )
      }
    } finally {
      this.isChecking = false
      this.checkErrorReported = false
    }
  }

  private showRestartAction(): void {
    this.dependencies.trayService.setUpdateRestartAction(
      () => this.requestRestart(),
      this.isRestartPending
    )
  }

  private clearDownloadedUpdate(): void {
    this.isDownloaded = false
    this.isRestartPending = false
    this.dependencies.trayService.setUpdateRestartAction(null, false)
  }

  private requestRestart(): void {
    if (!this.isDownloaded || this.isRestartPending || this.isStopped) {
      return
    }

    this.isRestartPending = true
    this.showRestartAction()
    this.restartTimer = setInterval(() => this.tryRestart(), RESTART_WAIT_INTERVAL_MILLISECONDS)
    this.tryRestart()
  }

  private tryRestart(): void {
    if (this.isChecking || !this.dependencies.canRestart()) {
      return
    }

    this.clearRestartTimer()
    void this.installUpdate()
  }

  private async installUpdate(): Promise<void> {
    this.reportedInstallErrors = new WeakSet<Error>()
    this.isRestartPreparationActive = true
    try {
      await this.dependencies.prepareForRestart()
      if (!this.isRestartPending || this.isStopped) {
        return
      }
    } catch (error) {
      if (this.isRestartPreparationActive) {
        this.dependencies.cancelRestartPreparation()
        this.isRestartPreparationActive = false
        this.isRestartPending = false
        this.showRestartAction()
        this.dependencies.loggerService.error('更新の適用を開始できませんでした', error)
      }
      return
    }

    try {
      await this.dependencies.updater.quitAndInstall()
    } catch (error) {
      if (this.isRestartPreparationActive) {
        this.failInstall(error)
      }
    }
  }

  private failInstall(error: unknown): void {
    if (error instanceof Error) {
      this.reportedInstallErrors.add(error)
    }
    if (this.isChecking) {
      this.checkErrorReported = true
    }
    if (isNonRetryableUpdateError(error)) {
      this.isRetryBlocked = true
    }
    this.dependencies.cancelRestartPreparation()
    this.isRestartPreparationActive = false
    this.clearDownloadedUpdate()
    this.dependencies.loggerService.error('更新の適用に失敗しました', error)
  }

  private clearRestartTimer(): void {
    if (this.restartTimer != null) {
      clearInterval(this.restartTimer)
      this.restartTimer = null
    }
  }
}

function isNonRetryableUpdateError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ERR_CHECKSUM_MISMATCH' ||
      error.code === 'ERR_UPDATER_INVALID_SIGNATURE' ||
      error.code === 'ERR_UPDATER_ZIP_FILE_NOT_FOUND')
  )
}
