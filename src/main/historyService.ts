import { promises as fs } from 'node:fs'
import { app, clipboard, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import type { HistoryItem, HistoryListItem } from '../shared/types/history'
import { writeFileAtomic } from './atomicFile'
import { ConfigService } from './configService'
import { LoggerService } from './loggerService'
import { PendingWriteQueue } from './pendingWriteQueue'
import { WindowService } from './windowService'

const FAILED_PREVIEW = '文字起こし失敗'
const EMPTY_TRANSCRIPT_PREVIEW = '文字起こし結果が空です'
const PREVIEW_MAX_LINES = 3
const PREVIEW_MAX_CHARACTERS = 160

const HistoryItemSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    completedAt: z.string().min(1),
    status: z.enum(['completed', 'failed']),
    transcript: z.string(),
    preview: z.string(),
    audioPath: z.string().min(1).nullable()
  })
  .strict()

const HistoryFileSchema = z
  .object({
    items: z.array(HistoryItemSchema)
  })
  .strict()

type HistoryFile = z.infer<typeof HistoryFileSchema>

const DefaultHistoryFile: HistoryFile = {
  items: []
}

interface CompletedHistoryItemInput {
  id: string
  createdAt: string
  completedAt: string
  transcript: string
  audioPath: string
  sourceWebmPath: string | null
}

interface FailedHistoryItemInput {
  id: string
  createdAt: string
  completedAt: string
  audioPath: string | null
  sourceWebmPath: string | null
}

/** 文字起こし履歴サービス */
export class HistoryService {
  private static instance: HistoryService | null = null
  private readonly configService: ConfigService
  private readonly historyFilePath: string
  private readonly loggerService: LoggerService
  private readonly writeQueue = new PendingWriteQueue()
  private readonly retryAudioPaths = new Map<string, string>()

  private constructor(userDataPath: string) {
    this.configService = ConfigService.getInstance()
    this.historyFilePath = join(userDataPath, 'history.json')
    this.loggerService = LoggerService.getInstance()
    this.setupIpcHandlers()
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): HistoryService {
    if (HistoryService.instance == null) {
      HistoryService.instance = new HistoryService(app.getPath('userData'))
    }

    return HistoryService.instance
  }

  /** 成功した文字起こしを履歴に記録 */
  async recordCompletedItem(input: CompletedHistoryItemInput): Promise<HistoryItem> {
    const item: HistoryItem = {
      id: input.id,
      createdAt: input.createdAt,
      completedAt: input.completedAt,
      status: 'completed',
      transcript: input.transcript,
      preview: this.createTranscriptPreview(input.transcript),
      audioPath: input.audioPath
    }

    return await this.writeQueue.enqueue(
      async () => await this.appendItem(item, input.sourceWebmPath)
    )
  }

  /** 失敗した文字起こしを履歴に記録 */
  async recordFailedItem(input: FailedHistoryItemInput): Promise<HistoryItem> {
    const item: HistoryItem = {
      id: input.id,
      createdAt: input.createdAt,
      completedAt: input.completedAt,
      status: 'failed',
      transcript: '',
      preview: FAILED_PREVIEW,
      audioPath: input.audioPath
    }

    return await this.writeQueue.enqueue(
      async () => await this.appendItem(item, input.sourceWebmPath)
    )
  }

  /** 履歴一覧を取得 */
  async listItems(): Promise<readonly HistoryListItem[]> {
    await this.writeQueue.waitForWrites()
    const historyFile = await this.loadHistoryFile()
    return await Promise.all(
      this.sortNewestFirst(historyFile.items).map(async (item) => ({
        ...item,
        audioAvailable: item.audioPath == null ? false : await this.audioExists(item.audioPath),
        retrying: this.retryAudioPaths.has(item.id)
      }))
    )
  }

  /** 再認識する失敗履歴の音声を保護する */
  async beginRetry(itemId: string): Promise<HistoryItem> {
    const result = await this.writeQueue.enqueue<
      { success: true; item: HistoryItem } | { success: false; error: unknown }
    >(async () => {
      try {
        if (this.retryAudioPaths.has(itemId)) {
          throw new Error(`履歴項目は既に再認識中です: ${itemId}`)
        }

        const historyFile = await this.loadHistoryFile()
        const item = historyFile.items.find((candidate) => candidate.id === itemId)
        if (item == null || item.status !== 'failed' || item.audioPath == null) {
          throw new Error(`再認識できる履歴項目が見つかりません: ${itemId}`)
        }
        if (!(await this.audioExists(item.audioPath))) {
          throw new Error(`音声ファイルが見つかりません: ${itemId}`)
        }

        this.retryAudioPaths.set(itemId, item.audioPath)
        this.notifyHistoryUpdated()
        return { success: true, item }
      } catch (error) {
        return { success: false, error }
      }
    })
    if (!result.success) {
      throw result.error
    }
    return result.item
  }

  /** 再認識が終わった音声の保護を解除する */
  async finishRetry(itemId: string, generatedWavPath: string | null): Promise<void> {
    await this.writeQueue.enqueue(async () => {
      const audioPath = this.retryAudioPaths.get(itemId)
      if (audioPath == null) {
        throw new Error(`再認識中の履歴項目が見つかりません: ${itemId}`)
      }

      const historyFile = await this.loadHistoryFile()
      this.retryAudioPaths.delete(itemId)
      await this.removeUnreferencedAudioFiles(
        generatedWavPath == null ? [audioPath] : [audioPath, generatedWavPath],
        historyFile.items
      )
      this.notifyHistoryUpdated()
    })
  }

  /** 履歴に紐づく音声ファイルをファイラーで表示する */
  async revealAudio(itemId: string): Promise<boolean> {
    await this.writeQueue.waitForWrites()
    const historyFile = await this.loadHistoryFile()
    const item = historyFile.items.find((candidate) => candidate.id === itemId)
    if (item?.audioPath == null || !(await this.audioExists(item.audioPath))) {
      return false
    }

    shell.showItemInFolder(item.audioPath)
    return true
  }

  /** 成功履歴の本文をクリップボードへコピー */
  async copyTranscript(itemId: string): Promise<boolean> {
    await this.writeQueue.waitForWrites()
    const historyFile = await this.loadHistoryFile()
    const item = historyFile.items.find((historyItem) => historyItem.id === itemId)

    if (item == null || item.status !== 'completed') {
      return false
    }

    clipboard.writeText(item.transcript)
    this.loggerService.infoWithDetails('履歴項目をクリップボードにコピーしました', {
      historyId: item.id
    })
    return true
  }

  /** 履歴サービスをクリーンアップ */
  cleanup(): void {
    ipcMain.removeHandler('history:list')
    ipcMain.removeHandler('history:copy')
    ipcMain.removeHandler('history:reveal')
  }

  /** 保留中の履歴保存を待つ */
  async flushPendingWrites(): Promise<void> {
    await this.writeQueue.flush()
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('history:list', this.handleListHistory.bind(this))
    ipcMain.handle('history:copy', this.handleCopyHistoryItem.bind(this))
    ipcMain.handle('history:reveal', this.handleRevealHistoryItem.bind(this))
  }

  private async handleListHistory(): Promise<readonly HistoryListItem[]> {
    return await this.listItems()
  }

  private async handleCopyHistoryItem(
    _event: Electron.IpcMainInvokeEvent,
    itemId: unknown
  ): Promise<boolean> {
    const validatedItemId = z.string().min(1).parse(itemId)
    return await this.copyTranscript(validatedItemId)
  }

  private async handleRevealHistoryItem(
    _event: Electron.IpcMainInvokeEvent,
    itemId: unknown
  ): Promise<boolean> {
    const validatedItemId = z.string().min(1).parse(itemId)
    return await this.revealAudio(validatedItemId)
  }

  private async appendItem(item: HistoryItem, sourceWebmPath: string | null): Promise<HistoryItem> {
    const config = this.configService.getConfig()
    const historyFile = await this.loadHistoryFile()
    const previousItem = historyFile.items.find((candidate) => candidate.id === item.id)
    const sortedItems = this.sortNewestFirst([
      ...historyFile.items.filter((candidate) => candidate.id !== item.id),
      item
    ])
    const retainedItems = sortedItems.slice(0, config.history.maxItems)
    const removedItems = sortedItems.slice(config.history.maxItems)

    await this.saveHistoryFile({ items: retainedItems })
    this.notifyHistoryUpdated()
    const obsoletePaths = removedItems.flatMap((removedItem) =>
      removedItem.audioPath == null ? [] : [removedItem.audioPath]
    )
    if (previousItem?.audioPath != null && previousItem.audioPath !== item.audioPath) {
      obsoletePaths.push(previousItem.audioPath)
    }
    if (sourceWebmPath != null && sourceWebmPath !== item.audioPath) {
      obsoletePaths.push(sourceWebmPath)
    }
    await this.removeUnreferencedAudioFiles(obsoletePaths, retainedItems)

    this.loggerService.infoWithDetails('履歴項目を保存しました', {
      historyId: item.id,
      status: item.status,
      removedCount: removedItems.length
    })

    return item
  }

  private async loadHistoryFile(): Promise<HistoryFile> {
    try {
      const historyData = await fs.readFile(this.historyFilePath, 'utf-8')
      const parsedHistory: unknown = JSON.parse(historyData)
      return HistoryFileSchema.parse(parsedHistory)
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return DefaultHistoryFile
      }

      this.loggerService.warnWithDetails('履歴ファイルの読み込みに失敗したため初期化します', error)
      await this.saveHistoryFile(DefaultHistoryFile)
      return DefaultHistoryFile
    }
  }

  private async saveHistoryFile(historyFile: HistoryFile): Promise<void> {
    const validatedHistoryFile = HistoryFileSchema.parse(historyFile)
    await writeFileAtomic(this.historyFilePath, JSON.stringify(validatedHistoryFile, null, 2))
  }

  private async removeUnreferencedAudioFiles(
    paths: readonly string[],
    retainedItems: readonly HistoryItem[]
  ): Promise<void> {
    for (const audioPath of new Set(paths)) {
      if (
        retainedItems.some((item) => item.audioPath === audioPath) ||
        [...this.retryAudioPaths.values()].includes(audioPath)
      ) {
        continue
      }

      try {
        await fs.unlink(audioPath)
      } catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
          continue
        }

        this.loggerService.error('参照されなくなった音声ログの削除に失敗しました', {
          audioPath,
          error
        })
      }
    }
  }

  private async audioExists(audioPath: string): Promise<boolean> {
    try {
      await fs.access(audioPath)
      return true
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return false
      }

      throw error
    }
  }

  private notifyHistoryUpdated(): void {
    try {
      WindowService.getExistingInstance().getHistoryWindow().webContents.send('history:updated')
    } catch (error) {
      this.loggerService.error('履歴ウィンドウへの更新通知に失敗しました', error)
    }
  }

  private sortNewestFirst(items: readonly HistoryItem[]): HistoryItem[] {
    return [...items].sort((left, right) => {
      const completedAtComparison = right.completedAt.localeCompare(left.completedAt)
      if (completedAtComparison !== 0) {
        return completedAtComparison
      }

      return right.id.localeCompare(left.id)
    })
  }

  private createTranscriptPreview(transcript: string): string {
    const normalizedTranscript = transcript.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (normalizedTranscript.length === 0) {
      return EMPTY_TRANSCRIPT_PREVIEW
    }

    const preview = normalizedTranscript
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, PREVIEW_MAX_LINES)
      .join('\n')

    if (preview.length <= PREVIEW_MAX_CHARACTERS) {
      return preview
    }

    return `${preview.slice(0, PREVIEW_MAX_CHARACTERS - 3)}...`
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
