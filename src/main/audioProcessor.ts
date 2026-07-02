import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'
import { RecordingData, Result } from './types'
import { LoggerService } from './loggerService'

/** 音声処理クラス */
export class AudioProcessor {
  private readonly loggerService = LoggerService.getInstance()

  /** WebM形式音声データをリサンプリングして16kHz、モノラル、16bit WAVファイルに変換 */
  async processAudioData(recordingData: RecordingData): Promise<Result<string, string>> {
    const tempInputPath = join(tmpdir(), `input_${randomUUID()}.webm`)
    const tempOutputPath = join(tmpdir(), `output_${randomUUID()}.wav`)

    try {
      await fs.writeFile(tempInputPath, recordingData.webmData)

      const success = await this.resampleWithFFmpeg(tempInputPath, tempOutputPath)
      if (!success) {
        this.loggerService.error('FFmpegリサンプリングに失敗しました', {
          inputPath: tempInputPath,
          outputPath: tempOutputPath
        })
        return { success: false, error: 'FFmpegリサンプリングに失敗しました' }
      }

      return { success: true, data: tempOutputPath }
    } catch (error) {
      await this.removeTemporaryFile(tempOutputPath, '一時WAVファイルの削除に失敗しました')
      this.loggerService.error('音声処理に失敗しました', error)
      return { success: false, error: `音声処理エラー: ${error}` }
    } finally {
      await this.removeTemporaryFile(tempInputPath, '一時WebMファイルの削除に失敗しました')
    }
  }

  /** FFmpegを使用して音声をリサンプリング */
  private async resampleWithFFmpeg(inputPath: string, outputPath: string): Promise<boolean> {
    const ffmpegPath = ffmpegStatic
    if (!ffmpegPath) {
      throw new Error('FFmpeg静的バイナリが見つかりません')
    }

    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, [
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
      ])

      ffmpeg.on('close', (code) => {
        resolve(code === 0)
      })

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg実行エラー:', error)
        this.loggerService.error('FFmpeg実行エラー', error)
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
