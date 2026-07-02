import { appendFileSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { dirname, join } from 'node:path'

type LogLevel = 'info' | 'warn' | 'error'

/** 内部ログ出力サービス */
export class LoggerService {
  private static instance: LoggerService | null = null
  private readonly logFilePath: string

  private constructor(userDataPath: string) {
    this.logFilePath = join(userDataPath, 'logs', 'app.log')
  }

  /** デフォルトログ出力先でインスタンスを作成 */
  static createDefault(): LoggerService {
    const loggerService = new LoggerService(app.getPath('userData'))
    LoggerService.instance = loggerService
    return loggerService
  }

  /** シングルトンインスタンスを取得 */
  static getInstance(): LoggerService {
    if (LoggerService.instance == null) {
      LoggerService.instance = LoggerService.createDefault()
    }

    return LoggerService.instance
  }

  /** 情報ログを出力 */
  info(message: string): void {
    this.writeLog('info', message)
  }

  /** 詳細付き情報ログを出力 */
  infoWithDetails(message: string, details: unknown): void {
    this.writeLogWithDetails('info', message, details)
  }

  /** 警告ログを出力 */
  warn(message: string): void {
    this.writeLog('warn', message)
  }

  /** 詳細付き警告ログを出力 */
  warnWithDetails(message: string, details: unknown): void {
    this.writeLogWithDetails('warn', message, details)
  }

  /** エラーログを出力 */
  error(message: string, details: unknown): void {
    this.writeLogWithDetails('error', message, details)
  }

  /** ログファイルパスを取得 */
  getLogFilePath(): string {
    return this.logFilePath
  }

  private writeLog(level: LogLevel, message: string): void {
    this.appendLine(`${new Date().toISOString()} [${level.toUpperCase()}] ${message}`)
  }

  private writeLogWithDetails(level: LogLevel, message: string, details: unknown): void {
    this.appendLine(
      `${new Date().toISOString()} [${level.toUpperCase()}] ${message} ${this.formatDetails(details)}`
    )
  }

  private appendLine(line: string): void {
    try {
      mkdirSync(dirname(this.logFilePath), { recursive: true })
      appendFileSync(this.logFilePath, `${line}\n`, 'utf-8')
    } catch (error) {
      console.error('内部ログの書き込みに失敗しました:', error)
    }
  }

  private formatDetails(details: unknown): string {
    if (details instanceof Error) {
      return details.stack ?? details.message
    }

    if (typeof details === 'string') {
      return details
    }

    try {
      const serializedDetails = JSON.stringify(details)
      if (serializedDetails != null) {
        return serializedDetails
      }

      return String(details)
    } catch (error) {
      return `詳細情報を文字列化できませんでした: ${error}`
    }
  }
}
