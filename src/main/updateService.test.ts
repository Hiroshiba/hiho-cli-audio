import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { UpdateService } from './updateService'

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = true
  allowPrerelease = true
  disableWebInstaller = false
  feedURL: { provider: 'github'; owner: string; repo: string } | null = null
  checkCount = 0
  installCount = 0
  checkError: Error | null = null

  setFeedURL(options: { provider: 'github'; owner: string; repo: string }): void {
    this.feedURL = options
  }

  async checkForUpdates(): Promise<{ downloadPromise: Promise<string[]> } | null> {
    this.checkCount += 1
    if (this.checkError != null) {
      this.emit('error', this.checkError)
      throw this.checkError
    }

    return { downloadPromise: Promise.resolve([]) }
  }

  quitAndInstall(): void {
    this.installCount += 1
  }
}

function createService(
  updater: FakeUpdater,
  isPackaged: boolean,
  canRestart: () => boolean
): {
  service: UpdateService
  tray: { action: (() => void) | null; isWaiting: boolean }
  errors: unknown[]
  preparation: { count: number; cancellationCount: number }
} {
  const tray: { action: (() => void) | null; isWaiting: boolean } = {
    action: null,
    isWaiting: false
  }
  const errors: unknown[] = []
  const preparation = { count: 0, cancellationCount: 0 }
  const service = new UpdateService({
    updater,
    trayService: {
      setUpdateRestartAction: (action, isWaiting) => {
        tray.action = action
        tray.isWaiting = isWaiting
      }
    },
    loggerService: {
      info: () => undefined,
      error: (_message, error) => errors.push(error)
    },
    isPackaged,
    platform: 'win32',
    architecture: 'x64',
    canRestart,
    prepareForRestart: async () => {
      preparation.count += 1
    },
    cancelRestartPreparation: () => {
      preparation.cancellationCount += 1
    }
  })

  return { service, tray, errors, preparation }
}

function clickRestart(tray: { action: (() => void) | null }): void {
  const action = tray.action
  if (action == null) {
    throw new Error('更新の再起動操作がありません')
  }

  action()
}

test('開発実行では更新確認を開始しない', () => {
  const updater = new FakeUpdater()
  const { service, tray } = createService(updater, false, () => true)
  service.start()

  assert.equal(updater.checkCount, 0)
  assert.equal(updater.feedURL, null)
  assert.equal(tray.action, null)
  service.cleanup()
})

test('ダウンロード完了後だけ再起動操作を出し、明示操作で適用する', async () => {
  const updater = new FakeUpdater()
  const { service, tray, preparation } = createService(updater, true, () => true)
  service.start()
  await setImmediate()

  assert.deepEqual(updater.feedURL, {
    provider: 'github',
    owner: 'Hiroshiba',
    repo: 'hiho-cli-audio'
  })
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowPrerelease, false)
  assert.equal(updater.disableWebInstaller, true)
  assert.equal(tray.action, null)

  updater.emit('update-downloaded')
  assert.notEqual(tray.action, null)
  assert.equal(updater.installCount, 0)
  clickRestart(tray)
  await setImmediate()
  assert.equal(preparation.count, 1)
  assert.equal(updater.installCount, 1)
  service.cleanup()
})

test('処理中は再起動を待ち、完了後に適用する', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  let canRestart = false
  const { service, tray } = createService(updater, true, () => canRestart)
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  clickRestart(tray)

  assert.equal(tray.isWaiting, true)
  assert.equal(updater.installCount, 0)
  canRestart = true
  context.mock.timers.tick(1000)
  await setImmediate()
  assert.equal(updater.installCount, 1)
  service.cleanup()
})

test('更新開始後の失敗では再起動準備を取り消す', async () => {
  const updater = new FakeUpdater()
  const { service, tray, preparation, errors } = createService(updater, true, () => true)
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  clickRestart(tray)
  await setImmediate()

  const error = new Error('更新の適用に失敗しました')
  updater.emit('error', error)
  assert.equal(preparation.cancellationCount, 1)
  assert.equal(tray.isWaiting, false)
  assert.equal(updater.installCount, 1)
  assert.deepEqual(errors, [error])
  service.cleanup()
})

test('更新確認の失敗は一度だけ記録して次回確認を残す', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  updater.checkError = new Error('更新 metadata を取得できません')
  const { service, tray, errors } = createService(updater, true, () => true)
  service.start()
  await setImmediate()

  assert.equal(updater.checkCount, 1)
  assert.deepEqual(errors, [updater.checkError])
  assert.equal(tray.action, null)
  context.mock.timers.tick(60 * 60 * 1000)
  await setImmediate()
  assert.equal(updater.checkCount, 2)
  assert.equal(errors.length, 2)
  service.cleanup()
})
