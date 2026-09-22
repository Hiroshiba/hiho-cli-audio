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
  installFailure: { kind: 'event' | 'promise' | 'both'; error: Error } | null = null

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

  quitAndInstall(): void | Promise<void> {
    this.installCount += 1
    const failure = this.installFailure
    if (failure == null) {
      return
    }

    if (failure.kind === 'event' || failure.kind === 'both') {
      this.emit('error', failure.error)
    }
    if (failure.kind === 'promise' || failure.kind === 'both') {
      return Promise.reject(failure.error)
    }
  }
}

function createService(
  updater: FakeUpdater,
  isPackaged: boolean,
  canRestart: () => boolean,
  platform: NodeJS.Platform
): {
  service: UpdateService
  tray: { action: (() => void) | null; isWaiting: boolean }
  errors: unknown[]
  preparation: { count: number; cancellationCount: number; error: Error | null }
} {
  const tray: { action: (() => void) | null; isWaiting: boolean } = {
    action: null,
    isWaiting: false
  }
  const errors: unknown[] = []
  const preparation: { count: number; cancellationCount: number; error: Error | null } = {
    count: 0,
    cancellationCount: 0,
    error: null
  }
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
    platform,
    architecture: 'x64',
    canRestart,
    prepareForRestart: async () => {
      preparation.count += 1
      if (preparation.error != null) {
        throw preparation.error
      }
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
  const { service, tray } = createService(updater, false, () => true, 'win32')
  service.start()

  assert.equal(updater.checkCount, 0)
  assert.equal(updater.feedURL, null)
  assert.equal(tray.action, null)
  service.cleanup()
})

test('ダウンロード完了後だけ再起動操作を出し、明示操作で適用する', async () => {
  const updater = new FakeUpdater()
  const { service, tray, preparation } = createService(updater, true, () => true, 'win32')
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
  const { service, tray } = createService(updater, true, () => canRestart, 'win32')
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

test('macOS の適用エラーイベント後は導線を消し、次回確認後に再操作できる', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  const error = new Error('更新の適用に失敗しました')
  const { service, tray, preparation, errors } = createService(updater, true, () => true, 'darwin')
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  const oldAction = tray.action
  clickRestart(tray)
  await setImmediate()
  updater.emit('error', error)

  assert.equal(preparation.cancellationCount, 1)
  assert.equal(tray.isWaiting, false)
  assert.equal(updater.installCount, 1)
  assert.equal(tray.action, null)
  assert.deepEqual(errors, [error])

  if (oldAction == null) {
    throw new Error('古い再起動操作がありません')
  }
  oldAction()
  assert.equal(updater.installCount, 1)
  assert.throws(() => clickRestart(tray))

  context.mock.timers.tick(60 * 60 * 1000)
  await setImmediate()
  assert.equal(updater.checkCount, 2)
  assert.equal(tray.action, null)

  updater.installFailure = null
  updater.emit('update-downloaded')
  assert.notEqual(tray.action, null)
  clickRestart(tray)
  await setImmediate()
  assert.equal(preparation.count, 2)
  assert.equal(updater.installCount, 2)
  service.cleanup()
})

test('適用が Promise だけで失敗しても導線を消し、拒否を処理する', async () => {
  const updater = new FakeUpdater()
  const error = new Error('適用時の非同期エラー')
  updater.installFailure = { kind: 'promise', error }
  const { service, tray, preparation, errors } = createService(updater, true, () => true, 'darwin')
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  clickRestart(tray)
  await setImmediate()

  assert.equal(preparation.cancellationCount, 1)
  assert.equal(tray.action, null)
  assert.deepEqual(errors, [error])
  service.cleanup()
})

test('同じ適用失敗がイベントと Promise で届いても一度だけ記録する', async () => {
  const updater = new FakeUpdater()
  const error = new Error('適用時の二重通知')
  updater.installFailure = { kind: 'both', error }
  const { service, tray, preparation, errors } = createService(updater, true, () => true, 'darwin')
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  clickRestart(tray)
  await setImmediate()

  assert.equal(preparation.cancellationCount, 1)
  assert.equal(tray.action, null)
  assert.deepEqual(errors, [error])
  service.cleanup()
})

test('保存準備の失敗では適用せず、保存回復後に再操作できる', async () => {
  const updater = new FakeUpdater()
  const { service, tray, preparation, errors } = createService(updater, true, () => true, 'win32')
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')

  const error = new Error('履歴の保存に失敗しました')
  preparation.error = error
  clickRestart(tray)
  await setImmediate()
  assert.equal(preparation.cancellationCount, 1)
  assert.equal(updater.installCount, 0)
  assert.equal(tray.isWaiting, false)
  assert.notEqual(tray.action, null)
  assert.deepEqual(errors, [error])

  preparation.error = null
  clickRestart(tray)
  await setImmediate()
  assert.equal(preparation.count, 2)
  assert.equal(updater.installCount, 1)
  service.cleanup()
})

test('更新確認の失敗は一度だけ記録して次回確認を残す', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  updater.checkError = new Error('更新 metadata を取得できません')
  const { service, tray, errors } = createService(updater, true, () => true, 'win32')
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

test('ハッシュ不一致では適用導線を出さず再確認を止める', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  updater.checkError = Object.assign(new Error('ハッシュ不一致'), {
    code: 'ERR_CHECKSUM_MISMATCH'
  })
  const { service, tray, errors } = createService(updater, true, () => true, 'darwin')
  service.start()
  await setImmediate()

  assert.equal(updater.checkCount, 1)
  assert.deepEqual(errors, [updater.checkError])
  updater.emit('update-downloaded')
  assert.equal(tray.action, null)
  context.mock.timers.tick(60 * 60 * 1000)
  await setImmediate()
  assert.equal(updater.checkCount, 1)
  service.cleanup()
})

test('署名不一致の適用エラーでは導線を消し再確認を止める', async (context) => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  const updater = new FakeUpdater()
  const error = Object.assign(new Error('署名不一致'), {
    code: 'ERR_UPDATER_INVALID_SIGNATURE'
  })
  const { service, tray, preparation, errors } = createService(updater, true, () => true, 'darwin')
  service.start()
  await setImmediate()
  updater.emit('update-downloaded')
  clickRestart(tray)
  await setImmediate()
  updater.emit('error', error)

  assert.equal(preparation.cancellationCount, 1)
  assert.equal(tray.action, null)
  assert.deepEqual(errors, [error])
  context.mock.timers.tick(60 * 60 * 1000)
  await setImmediate()
  assert.equal(updater.checkCount, 1)
  service.cleanup()
})
