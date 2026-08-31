import { LocalHerdrTransport, WslHerdrTransport } from './herdrTransport'
import {
  MacosHerdrForegroundDetector,
  WindowsHerdrForegroundDetector
} from './foregroundWindowService'
import { LoggerService } from './loggerService'
import type { Config, RecordingTarget } from './types'
import type { HerdrForegroundDetector } from './foregroundWindowService'
import type { HerdrTransport } from './types'

/** 録音開始時の出力先解決処理 */
export interface RecordingTargetResolver {
  /** 録音開始時の出力先を解決 */
  resolveAtRecordingStart(signal: AbortSignal): Promise<RecordingTarget>
}

class ClipboardRecordingTargetResolver implements RecordingTargetResolver {
  async resolveAtRecordingStart(signal: AbortSignal): Promise<RecordingTarget> {
    throwIfAborted(signal)
    return { kind: 'clipboard' }
  }
}

class HerdrRecordingTargetResolver implements RecordingTargetResolver {
  private readonly detector: HerdrForegroundDetector
  private readonly transport: HerdrTransport
  private readonly loggerService: LoggerService

  constructor(
    detector: HerdrForegroundDetector,
    transport: HerdrTransport,
    loggerService: LoggerService
  ) {
    this.detector = detector
    this.transport = transport
    this.loggerService = loggerService
  }

  async resolveAtRecordingStart(signal: AbortSignal): Promise<RecordingTarget> {
    let isHerdrForeground: boolean

    try {
      isHerdrForeground = await this.detector.isHerdrForeground(signal)
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      this.loggerService.warnWithDetails('前面ウィンドウのHerdr判定に失敗しました', error)
      return { kind: 'clipboard' }
    }

    throwIfAborted(signal)

    if (!isHerdrForeground) {
      return { kind: 'clipboard' }
    }

    try {
      const pane = await this.transport.getCurrentPane(signal)
      throwIfAborted(signal)
      return { kind: 'herdr', pane, transport: this.transport }
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      this.loggerService.warnWithDetails('Herdrの現在ペイン取得に失敗しました', error)
      return { kind: 'clipboard' }
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('録音出力先の解決がキャンセルされました')
  }
}

/** 設定とOSに対応する録音出力先の解決処理を生成 */
export function createRecordingTargetResolver(
  config: Config,
  platform: NodeJS.Platform
): RecordingTargetResolver {
  const herdrConfig = config.herdr

  if (platform === 'darwin') {
    if (herdrConfig == null || herdrConfig.macos == null) {
      return new ClipboardRecordingTargetResolver()
    }

    return new HerdrRecordingTargetResolver(
      new MacosHerdrForegroundDetector(),
      new LocalHerdrTransport(herdrConfig.macos),
      LoggerService.getInstance()
    )
  }

  if (platform === 'win32') {
    if (herdrConfig == null || herdrConfig.windows == null) {
      return new ClipboardRecordingTargetResolver()
    }

    return new HerdrRecordingTargetResolver(
      new WindowsHerdrForegroundDetector(),
      new WslHerdrTransport(herdrConfig.windows),
      LoggerService.getInstance()
    )
  }

  return new ClipboardRecordingTargetResolver()
}
