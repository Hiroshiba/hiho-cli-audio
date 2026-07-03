import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'
import { ProcessedAudioData, RecordingData, Result } from './types'
import { LoggerService } from './loggerService'

/** 音声処理クラス */
export class AudioProcessor {
  private readonly loggerService = LoggerService.getInstance()
  private readonly audioDir: string
  private readonly tempDir: string

  constructor(userDataDir: string) {
    this.audioDir = join(userDataDir, 'audio')
    this.tempDir = join(userDataDir, 'tmp')
  }

  /** WebM形式音声データをリサンプリングして16kHz、モノラル、16bit WAVファイルに変換 */
  async processAudioData(
    recordingData: RecordingData
  ): Promise<Result<ProcessedAudioData, string>> {
    const audioId = randomUUID()
    const tempInputPath = join(this.tempDir, `${audioId}.webm`)
    const outputPath = join(this.audioDir, `${audioId}.wav`)

    try {
      await fs.mkdir(this.tempDir, { recursive: true })
      await fs.mkdir(this.audioDir, { recursive: true })
      await fs.writeFile(tempInputPath, recordingData.webmData)

      const success = await this.resampleWithFFmpeg(tempInputPath, outputPath)
      if (!success) {
        this.loggerService.error('FFmpegリサンプリングに失敗しました', {
          inputPath: tempInputPath,
          outputPath
        })
        await this.removeTemporaryFile(outputPath, '変換失敗後のWAVファイル削除に失敗しました')
        await this.removeTemporaryFile(tempInputPath, '一時WebMファイルの削除に失敗しました')
        return { success: false, error: 'FFmpegリサンプリングに失敗しました' }
      }

      await this.removeTemporaryFile(tempInputPath, '一時WebMファイルの削除に失敗しました')
      return {
        success: true,
        data: {
          id: audioId,
          wavFilePath: outputPath
        }
      }
    } catch (error) {
      await this.removeTemporaryFile(outputPath, '変換途中のWAVファイル削除に失敗しました')
      await this.removeTemporaryFile(tempInputPath, '一時WebMファイルの削除に失敗しました')
      this.loggerService.error('音声処理に失敗しました', error)
      return { success: false, error: `音声処理エラー: ${error}` }
    }
  }

  /** FFmpegを使用して音声をリサンプリング */
  private async resampleWithFFmpeg(inputPath: string, outputPath: string): Promise<boolean> {
    const ffmpegPath = ffmpegStatic
    if (ffmpegPath == null || ffmpegPath === '') {
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
