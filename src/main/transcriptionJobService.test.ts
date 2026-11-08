import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { mock, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import ffmpegStatic from 'ffmpeg-static'
import * as yaml from 'js-yaml'
import { z } from 'zod'

let profilePath = ''
const clipboardWrites: string[] = []
const revealedAudioPaths: string[] = []
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
mock.module('electron', {
  namedExports: {
    app: { getPath: () => profilePath },
    clipboard: { writeText: (text: string) => clipboardWrites.push(text) },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      },
      removeHandler: (channel: string) => {
        ipcHandlers.delete(channel)
      }
    },
    shell: { showItemInFolder: (audioPath: string) => revealedAudioPaths.push(audioPath) }
  }
})

const require = createRequire(import.meta.url)
const configModule: typeof import('./configService') = require('./configService')
const geminiModule: typeof import('./geminiService') = require('./geminiService')
const historyModule: typeof import('./historyService') = require('./historyService')
const jobModule: typeof import('./transcriptionJobService') = require('./transcriptionJobService')
const schemasModule: typeof import('./schemas') = require('./schemas')

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) {
      return
    }
    await delay(10)
  }
  throw new Error('待機中の状態を確認できませんでした')
}

async function createWebm(path: string): Promise<Uint8Array> {
  if (ffmpegStatic == null) {
    throw new Error('FFmpegが見つかりません')
  }
  execFileSync(ffmpegStatic, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.12',
    '-c:a',
    'libopus',
    '-y',
    path
  ])
  return await fs.readFile(path)
}

test('保存済み音声の再認識と履歴上限の整合性', async (t) => {
  profilePath = await fs.mkdtemp(join(tmpdir(), 'hiho-audio-recovery-test-'))
  const config = {
    ...schemasModule.DefaultConfig,
    transcription: {
      ...schemasModule.DefaultConfig.transcription,
      gemini: { apiKey: 'test-api-key', model: 'test-model' }
    },
    history: { maxItems: 1 }
  }
  await fs.writeFile(join(profilePath, 'config.yaml'), yaml.dump(config))
  const configService = configModule.ConfigService.createDefault()
  await configService.initializeConfig()
  const geminiService = geminiModule.GeminiService.getInstance()
  geminiService.initialize(config.transcription.gemini)
  const client = geminiService.getClient()
  let transcribe: (path: string, signal: AbortSignal) => Promise<string> = async () => '成功'
  const transcribeMock = mock.method(client, 'transcribe', async (path, _options, signal) => ({
    text: await transcribe(path, signal)
  }))
  const history = historyModule.HistoryService.getInstance()
  const jobs = jobModule.TranscriptionJobService.getInstance()
  const validWebm = await createWebm(join(profilePath, 'sample.webm'))
  const historyFilePath = join(profilePath, 'history.json')

  try {
    await t.test('録音入力警告は現行セッションの状態遷移だけを反映する', () => {
      const sessionId = 'recording-input-warning'
      jobs.startRecording(sessionId)
      const statusHandler = ipcHandlers.get('status:get')
      assert.ok(statusHandler != null)
      const getInputWarning = (): boolean =>
        z.object({ kind: z.literal('recording'), inputWarning: z.boolean() }).parse(statusHandler())
          .inputWarning

      assert.equal(getInputWarning(), false)
      assert.equal(jobs.updateRecordingInputWarning(sessionId, 'no-input'), true)
      assert.equal(getInputWarning(), true)
      assert.equal(jobs.updateRecordingInputWarning(sessionId, 'no-input'), false)
      assert.equal(jobs.updateRecordingInputWarning(sessionId, 'input-detected'), true)
      assert.equal(getInputWarning(), false)
      assert.equal(jobs.updateRecordingInputWarning(sessionId, 'input-detected'), false)

      jobs.stopRecording(sessionId)
      jobs.startRecording('recording-next-input-session')
      assert.equal(jobs.updateRecordingInputWarning(sessionId, 'no-input'), false)
      assert.equal(getInputWarning(), false)
      assert.equal(
        jobs.updateRecordingInputWarning('recording-next-input-session', 'no-input'),
        true
      )
      jobs.stopRecording('recording-next-input-session')
    })

    await t.test('WAV保存後の失敗を同じ履歴と音声で再認識してコピーする', async () => {
      transcribe = async () => {
        throw new Error('認識失敗')
      }
      jobs.submitRecordingData(
        { sessionId: 'recording-wav', webmData: validWebm },
        Promise.resolve({ kind: 'clipboard' })
      )
      await jobs.waitForJobs()
      const [failed] = await history.listItems()
      assert.equal(failed.status, 'failed')
      assert.equal(failed.audioPath?.endsWith('.wav'), true)
      assert.equal(failed.audioAvailable, true)
      const originalAudioPath = failed.audioPath
      const originalCreatedAt = failed.createdAt

      transcribe = async () => '再認識した本文'
      await jobs.retryHistoryItem(failed.id)
      await jobs.waitForJobs()
      const [completed] = await history.listItems()
      assert.equal(completed.id, failed.id)
      assert.equal(completed.createdAt, originalCreatedAt)
      assert.equal(completed.audioPath, originalAudioPath)
      assert.equal(completed.transcript, '再認識した本文')
      assert.equal(clipboardWrites.at(-1), '再認識した本文')
      assert.equal(await history.revealAudio(completed.id), true)
      assert.equal(revealedAudioPaths.at(-1), originalAudioPath)
    })

    await t.test('WebM変換失敗では元音声を残し、再認識で再変換する', async () => {
      jobs.submitRecordingData(
        { sessionId: 'recording-webm', webmData: new Uint8Array([1, 2, 3]) },
        Promise.resolve({ kind: 'clipboard' })
      )
      await jobs.waitForJobs()
      const [failed] = await history.listItems()
      assert.equal(failed.status, 'failed')
      assert.equal(failed.audioPath?.endsWith('.webm'), true)
      assert.equal(failed.audioAvailable, true)
      const sourcePath = failed.audioPath
      assert.ok(sourcePath != null)
      await fs.writeFile(sourcePath, validWebm)

      transcribe = async () => 'WebMから復旧'
      await jobs.retryHistoryItem(failed.id)
      await jobs.waitForJobs()
      const [completed] = await history.listItems()
      assert.equal(completed.id, failed.id)
      assert.equal(completed.audioPath?.endsWith('.wav'), true)
      assert.equal(completed.transcript, 'WebMから復旧')
      assert.equal(clipboardWrites.at(-1), 'WebMから復旧')
      await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' })
    })

    await t.test('再認識中も元音声を保護し、再失敗時に上限外の履歴を復活させない', async () => {
      const [previous] = await history.listItems()
      assert.ok(previous.audioPath != null)
      const sourcePath = join(profilePath, 'audio', 'retry-failed.wav')
      await fs.copyFile(previous.audioPath, sourcePath)
      await history.recordFailedItem({
        id: 'retry-failed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        audioPath: sourcePath,
        sourceWebmPath: null
      })
      const pending: { reject: ((error: Error) => void) | null } = { reject: null }
      transcribe = async (path) => {
        if (path === sourcePath) {
          return await new Promise<string>((_resolve, reject) => {
            pending.reject = reject
          })
        }
        return '並行した通常録音'
      }
      await jobs.retryHistoryItem('retry-failed')
      await waitFor(async () => pending.reject != null)
      assert.equal((await history.listItems())[0]?.retrying, true)
      await assert.rejects(jobs.retryHistoryItem('retry-failed'))
      await history.flushPendingWrites()
      jobs.submitRecordingData(
        { sessionId: 'recording-concurrent', webmData: validWebm },
        Promise.resolve({ kind: 'clipboard' })
      )
      const statusHandler = ipcHandlers.get('status:get')
      assert.ok(statusHandler != null)
      const status = statusHandler()
      assert.ok(typeof status === 'object' && status != null && 'processingJobCount' in status)
      assert.equal(status.processingJobCount, 2)
      await waitFor(async () => (await history.listItems())[0]?.transcript === '並行した通常録音')
      await fs.access(sourcePath)
      assert.equal((await history.listItems()).length, 1)
      assert.ok(pending.reject != null)
      pending.reject(new Error('再認識失敗'))
      await jobs.waitForJobs()
      assert.equal((await history.listItems())[0]?.transcript, '並行した通常録音')
      await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' })
    })

    await t.test('再認識成功は上限1件でも元の履歴IDを最新で再登録する', async () => {
      const [previous] = await history.listItems()
      assert.ok(previous.audioPath != null)
      const sourcePath = join(profilePath, 'audio', 'retry-completed.wav')
      await fs.copyFile(previous.audioPath, sourcePath)
      await history.recordFailedItem({
        id: 'retry-completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        audioPath: sourcePath,
        sourceWebmPath: null
      })
      const pending: { resolve: ((text: string) => void) | null } = { resolve: null }
      transcribe = async (path) => {
        if (path === sourcePath) {
          return await new Promise<string>((resolve) => {
            pending.resolve = resolve
          })
        }
        return '途中の通常録音'
      }
      await jobs.retryHistoryItem('retry-completed')
      await waitFor(async () => pending.resolve != null)
      jobs.submitRecordingData(
        { sessionId: 'recording-during-retry', webmData: validWebm },
        Promise.resolve({ kind: 'clipboard' })
      )
      await waitFor(async () => (await history.listItems())[0]?.transcript === '途中の通常録音')
      assert.ok(pending.resolve != null)
      pending.resolve('再認識成功')
      await jobs.waitForJobs()
      const [completed] = await history.listItems()
      assert.equal(completed.id, 'retry-completed')
      assert.equal(completed.transcript, '再認識成功')
      assert.equal((await history.listItems()).length, 1)
      assert.equal(clipboardWrites.at(-1), '再認識成功')
    })

    await t.test('元項目が残る再認識のキャンセルでは失敗履歴を変更しない', async () => {
      const [previous] = await history.listItems()
      assert.ok(previous.audioPath != null)
      const sourcePath = join(profilePath, 'audio', 'retry-stays.wav')
      await fs.copyFile(previous.audioPath, sourcePath)
      await history.recordFailedItem({
        id: 'retry-stays',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        audioPath: sourcePath,
        sourceWebmPath: null
      })
      const [failed] = await history.listItems()
      const pending: { reject: ((error: Error) => void) | null } = { reject: null }
      transcribe = async () =>
        await new Promise<string>((_resolve, reject) => {
          pending.reject = reject
        })
      await jobs.retryHistoryItem(failed.id)
      await waitFor(async () => pending.reject != null)
      jobs.cancel()
      assert.ok(pending.reject != null)
      pending.reject(new Error('キャンセル'))
      await jobs.waitForJobs()
      const [retained] = await history.listItems()
      assert.equal(retained.id, failed.id)
      assert.equal(retained.status, 'failed')
      assert.equal(retained.completedAt, failed.completedAt)
      assert.equal(retained.audioPath, sourcePath)
      await fs.access(sourcePath)

      transcribe = async () => {
        throw new Error('再認識失敗')
      }
      await jobs.retryHistoryItem(failed.id)
      await jobs.waitForJobs()
      const [failedAgain] = await history.listItems()
      assert.equal(failedAgain.id, failed.id)
      assert.equal(failedAgain.status, 'failed')
      assert.equal(failedAgain.completedAt, failed.completedAt)
      assert.equal(failedAgain.audioPath, sourcePath)
    })

    await t.test('保存確定直後のキャンセルは成功履歴を巻き戻さない', async () => {
      const originalRecord = history.recordCompletedItem.bind(history)
      const recordMock = mock.method(history, 'recordCompletedItem', async (input) => {
        const item = await originalRecord(input)
        jobs.cancel()
        return item
      })
      transcribe = async () => '確定した本文'
      try {
        jobs.submitRecordingData(
          { sessionId: 'recording-committed', webmData: validWebm },
          Promise.resolve({ kind: 'clipboard' })
        )
        await jobs.waitForJobs()
      } finally {
        recordMock.mock.restore()
      }
      const [completed] = await history.listItems()
      assert.equal(completed.status, 'completed')
      assert.equal(completed.transcript, '確定した本文')
      const statusHandler = ipcHandlers.get('status:get')
      assert.ok(statusHandler != null)
      const status = statusHandler()
      assert.ok(typeof status === 'object' && status != null && 'kind' in status)
      assert.equal(status.kind, 'completed')
    })

    await t.test('履歴保存失敗では成功通知を出さず元WebMを残す', async () => {
      jobs.cancel()
      const originalRename = fs.rename.bind(fs)
      const renameMock = mock.method(fs, 'rename', async (source, destination) => {
        if (destination === historyFilePath) {
          throw new Error('履歴を保存できません')
        }
        return await originalRename(source, destination)
      })
      const beforeFiles = new Set(await fs.readdir(join(profilePath, 'audio')))
      transcribe = async () => '保存できなかった本文'
      try {
        jobs.submitRecordingData(
          { sessionId: 'recording-save-failed', webmData: validWebm },
          Promise.resolve({ kind: 'clipboard' })
        )
        await jobs.waitForJobs()
      } finally {
        renameMock.mock.restore()
      }
      const afterFiles = await fs.readdir(join(profilePath, 'audio'))
      const newWebmFiles = afterFiles.filter(
        (name) => !beforeFiles.has(name) && name.endsWith('.webm')
      )
      assert.equal(newWebmFiles.length, 1)
      const statusHandler = ipcHandlers.get('status:get')
      assert.ok(statusHandler != null)
      const status = statusHandler()
      assert.ok(typeof status === 'object' && status != null && 'kind' in status)
      assert.notEqual(status.kind, 'completed')
      assert.notEqual((await history.listItems())[0]?.transcript, '保存できなかった本文')
    })

    await t.test('外部で削除された音声は再認識と保存場所表示を受け付けない', async () => {
      await history.recordFailedItem({
        id: 'missing-audio',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        audioPath: join(profilePath, 'audio', 'missing.wav'),
        sourceWebmPath: null
      })
      const [failed] = await history.listItems()
      assert.equal(failed.audioAvailable, false)
      assert.equal(await history.revealAudio(failed.id), false)
      await assert.rejects(jobs.retryHistoryItem(failed.id))
      await history.flushPendingWrites()
    })

    await t.test('音声削除失敗は保存済みの成功へ影響しない', async () => {
      const originalUnlink = fs.unlink.bind(fs)
      const unlinkMock = mock.method(fs, 'unlink', async (path) => {
        if (typeof path === 'string' && path.endsWith('.webm')) {
          throw new Error('音声を削除できません')
        }
        return await originalUnlink(path)
      })
      transcribe = async () => '削除失敗後の成功'
      try {
        jobs.submitRecordingData(
          { sessionId: 'recording-cleanup-failed', webmData: validWebm },
          Promise.resolve({ kind: 'clipboard' })
        )
        await jobs.waitForJobs()
      } finally {
        unlinkMock.mock.restore()
      }
      const [completed] = await history.listItems()
      assert.equal(completed.status, 'completed')
      assert.equal(completed.transcript, '削除失敗後の成功')
      assert.equal(clipboardWrites.at(-1), '削除失敗後の成功')
    })

    await t.test('終了時は上限外になった再認識の保護解放まで待ち、元行を復活させない', async () => {
      const [previous] = await history.listItems()
      assert.ok(previous.audioPath != null)
      const sourcePath = join(profilePath, 'audio', 'retry-cancelled.wav')
      await fs.copyFile(previous.audioPath, sourcePath)
      await history.recordFailedItem({
        id: 'retry-cancelled',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        audioPath: sourcePath,
        sourceWebmPath: null
      })
      const pending: { reject: ((error: Error) => void) | null } = { reject: null }
      transcribe = async (path) => {
        if (path === sourcePath) {
          return await new Promise<string>((_resolve, reject) => {
            pending.reject = reject
          })
        }
        return '終了前の通常録音'
      }
      await jobs.retryHistoryItem('retry-cancelled')
      await waitFor(async () => pending.reject != null)
      jobs.submitRecordingData(
        { sessionId: 'recording-before-exit', webmData: validWebm },
        Promise.resolve({ kind: 'clipboard' })
      )
      await waitFor(async () => (await history.listItems())[0]?.transcript === '終了前の通常録音')
      await fs.access(sourcePath)
      jobs.cleanup()
      assert.equal(jobs.hasActiveJobs(), true)
      assert.ok(pending.reject != null)
      pending.reject(new Error('中断'))
      await jobs.waitForJobs()
      assert.equal(jobs.hasActiveJobs(), false)
      assert.equal((await history.listItems())[0]?.transcript, '終了前の通常録音')
      await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' })
    })
  } finally {
    transcribeMock.mock.restore()
    await fs.rm(profilePath, { recursive: true, force: true })
  }
})
