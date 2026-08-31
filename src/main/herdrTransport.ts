import { z } from 'zod'
import type { HerdrMacosConfig, HerdrPane, HerdrTransport, HerdrWindowsConfig } from './types'
import { execFileText } from './execFileText'

const CurrentPaneResponseSchema = z
  .object({
    result: z
      .object({
        pane: z
          .object({
            pane_id: z.string().trim().min(1, 'HerdrのペインIDが空です')
          })
          .passthrough()
      })
      .passthrough()
  })
  .passthrough()

async function parseCurrentPane(stdout: string): Promise<HerdrPane> {
  const response = CurrentPaneResponseSchema.parse(JSON.parse(stdout))
  return { paneId: response.result.pane.pane_id }
}

/** ローカルのHerdr CLIへ接続するtransport */
export class LocalHerdrTransport implements HerdrTransport {
  private readonly config: HerdrMacosConfig

  constructor(config: HerdrMacosConfig) {
    this.config = config
  }

  /** 現在のHerdrペインを取得 */
  async getCurrentPane(signal: AbortSignal): Promise<HerdrPane> {
    const stdout = await execFileText(this.config.binaryPath, ['pane', 'current'], signal)
    return parseCurrentPane(stdout)
  }

  /** 指定したHerdrペインで文字列を実行 */
  async run(pane: HerdrPane, text: string, signal: AbortSignal): Promise<void> {
    await execFileText(this.config.binaryPath, ['pane', 'run', pane.paneId, text], signal)
  }
}

/** WSL経由でHerdr CLIへ接続するtransport */
export class WslHerdrTransport implements HerdrTransport {
  private readonly config: HerdrWindowsConfig

  constructor(config: HerdrWindowsConfig) {
    this.config = config
  }

  /** 現在のHerdrペインを取得 */
  async getCurrentPane(signal: AbortSignal): Promise<HerdrPane> {
    const stdout = await execFileText('wsl.exe', this.createArguments(['pane', 'current']), signal)
    return parseCurrentPane(stdout)
  }

  /** 指定したHerdrペインで文字列を実行 */
  async run(pane: HerdrPane, text: string, signal: AbortSignal): Promise<void> {
    await execFileText('wsl.exe', this.createArguments(['pane', 'run', pane.paneId, text]), signal)
  }

  private createArguments(commandArguments: readonly string[]): string[] {
    return [
      '-d',
      this.config.wslDistribution,
      '-u',
      this.config.wslUser,
      '--',
      this.config.binaryPath,
      ...commandArguments
    ]
  }
}
