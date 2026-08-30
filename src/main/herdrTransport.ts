import { execFile } from 'node:child_process'
import { z } from 'zod'
import type {
  HerdrMacosConfig,
  HerdrPane,
  HerdrTransport,
  HerdrWindowsConfig
} from './types'

const HERDR_COMMAND_TIMEOUT_MILLISECONDS = 5000

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

function execFileAsync(filePath: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      filePath,
      [...args],
      {
        encoding: 'utf8',
        shell: false,
        timeout: HERDR_COMMAND_TIMEOUT_MILLISECONDS
      },
      (error, stdout) => {
        if (error != null) {
          reject(error)
          return
        }

        if (typeof stdout !== 'string') {
          reject(new Error('Herdr CLIの標準出力を文字列として取得できません'))
          return
        }

        resolve(stdout)
      }
    )
  })
}

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
  async getCurrentPane(): Promise<HerdrPane> {
    const stdout = await execFileAsync(this.config.binaryPath, ['pane', 'current'])
    return parseCurrentPane(stdout)
  }

  /** 指定したHerdrペインへ文字列を送信 */
  async sendText(pane: HerdrPane, text: string): Promise<void> {
    await execFileAsync(this.config.binaryPath, ['pane', 'send-text', pane.paneId, text])
  }
}

/** WSL経由でHerdr CLIへ接続するtransport */
export class WslHerdrTransport implements HerdrTransport {
  private readonly config: HerdrWindowsConfig

  constructor(config: HerdrWindowsConfig) {
    this.config = config
  }

  /** 現在のHerdrペインを取得 */
  async getCurrentPane(): Promise<HerdrPane> {
    const stdout = await execFileAsync('wsl.exe', this.createArguments(['pane', 'current']))
    return parseCurrentPane(stdout)
  }

  /** 指定したHerdrペインへ文字列を送信 */
  async sendText(pane: HerdrPane, text: string): Promise<void> {
    await execFileAsync(
      'wsl.exe',
      this.createArguments(['pane', 'send-text', pane.paneId, text])
    )
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
