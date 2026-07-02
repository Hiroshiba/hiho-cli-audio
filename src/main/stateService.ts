import { promises as fs } from 'node:fs'
import { app } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { writeFileAtomic } from './atomicFile'
import { LoggerService } from './loggerService'

const WindowBoundsSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict()

const AppStateSchema = z
  .object({
    windows: z.record(z.string().min(1), WindowBoundsSchema)
  })
  .strict()

const DefaultState: AppState = {
  windows: {}
}

export type WindowBounds = z.infer<typeof WindowBoundsSchema>
export type AppState = z.infer<typeof AppStateSchema>
export type WindowBoundsLoadResult = { found: true; bounds: WindowBounds } | { found: false }

/** state.json 管理サービス */
export class StateService {
  private static instance: StateService | null = null
  private readonly loggerService: LoggerService
  private readonly stateFilePath: string

  private constructor(userDataPath: string) {
    this.loggerService = LoggerService.getInstance()
    this.stateFilePath = join(userDataPath, 'state.json')
  }

  /** デフォルト状態ファイルでインスタンスを作成 */
  static createDefault(): StateService {
    const stateService = new StateService(app.getPath('userData'))
    StateService.instance = stateService
    return stateService
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): StateService {
    if (StateService.instance == null) {
      StateService.instance = StateService.createDefault()
    }

    return StateService.instance
  }

  /** 状態ファイルを読み込む */
  async loadState(): Promise<AppState> {
    try {
      const stateData = await fs.readFile(this.stateFilePath, 'utf-8')
      const parsedState: unknown = JSON.parse(stateData)
      const validationResult = AppStateSchema.safeParse(parsedState)

      if (validationResult.success) {
        return validationResult.data
      }

      this.loggerService.warnWithDetails(
        '状態ファイルの形式が不正なため初期状態を使います',
        validationResult.error
      )
      return DefaultState
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return DefaultState
      }

      this.loggerService.warnWithDetails(
        '状態ファイルの読み込みに失敗したため初期状態を使います',
        error
      )
      return DefaultState
    }
  }

  /** 状態ファイルを書き込む */
  async saveState(state: AppState): Promise<void> {
    const validatedState = AppStateSchema.parse(state)
    await writeFileAtomic(this.stateFilePath, JSON.stringify(validatedState, null, 2))
  }

  /** ウィンドウ位置とサイズを読み込む */
  async loadWindowBounds(windowName: string): Promise<WindowBoundsLoadResult> {
    const state = await this.loadState()
    const bounds = state.windows[windowName]

    if (bounds == null) {
      return { found: false }
    }

    return { found: true, bounds }
  }

  /** ウィンドウ位置とサイズを保存する */
  async saveWindowBounds(windowName: string, bounds: WindowBounds): Promise<void> {
    const state = await this.loadState()
    await this.saveState({
      ...state,
      windows: {
        ...state.windows,
        [windowName]: bounds
      }
    })
  }

  /** 状態ファイルパスを取得 */
  getStateFilePath(): string {
    return this.stateFilePath
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
