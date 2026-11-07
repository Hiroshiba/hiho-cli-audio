import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { AudioProcessingFailure, ProcessedAudioData, RecordingData, Result } from './types'
import { LoggerService } from './loggerService'

/** 音声処理クラス */
export class AudioProcessor {
  private readonly loggerService = LoggerService.getInstance()
  private readonly audioDir: string

  constructor(userDataDir: string) {
    this.audioDir = join(userDataDir, 'audio')
  }

  /** WebM形式音声データをリサンプリングして16kHz、モノラル、16bit WAVファイルに変換 */
  async processAudioData(
    recordingData: RecordingData,
    audioId: string,
    signal: AbortSignal
  ): Promise<Result<ProcessedAudioData, AudioProcessingFailure>> {
    const inputPath = join(this.audioDir, `${audioId}.webm`)
    let savedWebmPath: string | null = null

    try {
      throwIfAborted(signal)
      await fs.mkdir(this.audioDir, { recursive: true })
      throwIfAborted(signal)
      await fs.writeFile(inputPath, recordingData.webmData, { signal })
      savedWebmPath = inputPath
      throwIfAborted(signal)
      return await this.processSavedWebm(inputPath, audioId, signal)
    } catch (error) {
      if (signal.aborted) {
        throw error
      }

      this.loggerService.error('音声処理に失敗しました', error)
      return {
        success: false,
        error: { message: `音声処理エラー: ${error}`, savedWebmPath }
      }
    }
  }

  /** 保存済みWebMをWAVへ変換する */
  async processSavedWebm(
    inputPath: string,
    audioId: string,
    signal: AbortSignal
  ): Promise<Result<ProcessedAudioData, AudioProcessingFailure>> {
    const outputPath = join(this.audioDir, `${audioId}.wav`)

    try {
      throwIfAborted(signal)
      await fs.mkdir(this.audioDir, { recursive: true })
      throwIfAborted(signal)
      const success = await this.resampleWithFFmpeg(inputPath, outputPath, signal)
      throwIfAborted(signal)
      if (!success) {
        this.loggerService.error('FFmpegリサンプリングに失敗しました', {
          inputPath,
          outputPath
        })
        await this.removeTemporaryFile(outputPath, '変換失敗後のWAVファイル削除に失敗しました')
        return {
          success: false,
          error: { message: 'FFmpegリサンプリングに失敗しました', savedWebmPath: inputPath }
        }
      }

      return {
        success: true,
        data: { id: audioId, wavFilePath: outputPath, sourceWebmPath: inputPath }
      }
    } catch (error) {
      await this.removeTemporaryFile(outputPath, '変換途中のWAVファイル削除に失敗しました')
      if (signal.aborted) {
        throw error
      }

      this.loggerService.error('音声処理に失敗しました', error)
      return {
        success: false,
        error: { message: `音声処理エラー: ${error}`, savedWebmPath: inputPath }
      }
    }
  }

  /** FFmpegを使用して音声をリサンプリング */
  private async resampleWithFFmpeg(
    inputPath: string,
    outputPath: string,
    signal: AbortSignal
  ): Promise<boolean> {
    const ffmpegPath = ffmpegStatic
    if (ffmpegPath == null || ffmpegPath === '') {
      throw new Error('FFmpeg静的バイナリが見つかりません')
    }

    return new Promise((resolve) => {
      const ffmpeg = spawn(
        ffmpegPath,
        [
          '-i',
          inputPath,
          '-ar',
          '16000',
          '-ac',
          '1',
          '-acodec',
          'pcm_s16le',
          '-f',
          'wav',
          '-y',
          outputPath
        ],
        { signal }
      )

      ffmpeg.on('close', (code) => {
        resolve(code === 0)
      })

      ffmpeg.on('error', (error) => {
        if (!signal.aborted) {
          console.error('FFmpeg実行エラー:', error)
          this.loggerService.error('FFmpeg実行エラー', error)
        }
        resolve(false)
      })
    })
  }

  private async removeTemporaryFile(filePath: string, failureMessage: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return
      }

      this.loggerService.error(failureMessage, error)
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('音声処理がキャンセルされました')
  }
}
