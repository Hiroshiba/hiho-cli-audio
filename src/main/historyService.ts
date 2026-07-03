import { promises as fs } from 'node:fs'
import { app, clipboard, ipcMain } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import type { HistoryItem } from '../shared/types/history'
import { writeFileAtomic } from './atomicFile'
import { ConfigService } from './configService'
import { LoggerService } from './loggerService'

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
}

interface FailedHistoryItemInput {
  id: string
  createdAt: string
  completedAt: string
  audioPath: string | null
}

/** 文字起こし履歴サービス */
export class HistoryService {
  private static instance: HistoryService | null = null
  private readonly configService: ConfigService
  private readonly historyFilePath: string
  private readonly loggerService: LoggerService
  private writeQueue: Promise<void> = Promise.resolve()

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

    return await this.enqueueWrite(async () => await this.appendItem(item))
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

    return await this.enqueueWrite(async () => await this.appendItem(item))
  }

  /** 履歴一覧を取得 */
  async listItems(): Promise<readonly HistoryItem[]> {
    await this.writeQueue
    const historyFile = await this.loadHistoryFile()
    return this.sortNewestFirst(historyFile.items)
  }

  /** 成功履歴の本文をクリップボードへコピー */
  async copyTranscript(itemId: string): Promise<boolean> {
    await this.writeQueue
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
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('history:list', this.handleListHistory.bind(this))
    ipcMain.handle('history:copy', this.handleCopyHistoryItem.bind(this))
  }

  private async handleListHistory(): Promise<readonly HistoryItem[]> {
    return await this.listItems()
  }

  private async handleCopyHistoryItem(
    _event: Electron.IpcMainInvokeEvent,
    itemId: unknown
  ): Promise<boolean> {
    const validatedItemId = z.string().min(1).parse(itemId)
    return await this.copyTranscript(validatedItemId)
  }

  private async appendItem(item: HistoryItem): Promise<HistoryItem> {
    const config = this.configService.getConfig()
    const historyFile = await this.loadHistoryFile()
    const sortedItems = this.sortNewestFirst([...historyFile.items, item])
    const retainedItems = sortedItems.slice(0, config.history.maxItems)
    const removedItems = sortedItems.slice(config.history.maxItems)

    await this.saveHistoryFile({ items: retainedItems })
    await this.removeAudioFiles(removedItems)

    this.loggerService.infoWithDetails('履歴項目を保存しました', {
      historyId: item.id,
      status: item.status,
      removedCount: removedItems.length
    })

    return item
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const queuedOperation = this.writeQueue.then(operation, operation)
    this.writeQueue = queuedOperation.then(
      () => undefined,
      () => undefined
    )
    return queuedOperation
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

  private async removeAudioFiles(items: readonly HistoryItem[]): Promise<void> {
    for (const item of items) {
      if (item.audioPath == null) {
        continue
      }

      try {
        await fs.unlink(item.audioPath)
      } catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
          continue
        }

        this.loggerService.error('履歴上限超過に伴う音声ログ削除に失敗しました', {
          historyId: item.id,
          audioPath: item.audioPath,
          error
        })
        throw new Error(`履歴上限超過に伴う音声ログ削除に失敗しました: ${item.audioPath}`, {
          cause: error
        })
      }
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
