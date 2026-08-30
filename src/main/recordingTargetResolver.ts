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
  resolveAtRecordingStart(): Promise<RecordingTarget>
}

class ClipboardRecordingTargetResolver implements RecordingTargetResolver {
  async resolveAtRecordingStart(): Promise<RecordingTarget> {
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

  async resolveAtRecordingStart(): Promise<RecordingTarget> {
    let isHerdrForeground: boolean

    try {
      isHerdrForeground = await this.detector.isHerdrForeground()
    } catch (error) {
      this.loggerService.warnWithDetails('前面ウィンドウのHerdr判定に失敗しました', error)
      return { kind: 'clipboard' }
    }

    if (!isHerdrForeground) {
      return { kind: 'clipboard' }
    }

    try {
      const pane = await this.transport.getCurrentPane()
      return { kind: 'herdr', pane, transport: this.transport }
    } catch (error) {
      this.loggerService.warnWithDetails('Herdrの現在ペイン取得に失敗しました', error)
      return { kind: 'clipboard' }
    }
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
