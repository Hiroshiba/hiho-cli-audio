import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'
import { RecordingData, Result } from './types'

/** 音声処理クラス */
export class AudioProcessor {
  
  /** 録音データをリサンプリングして16kHz、モノラル、16bit WAVファイルに変換 */
  async processAudioData(recordingData: RecordingData): Promise<Result<Float32Array, string>> {
    const tempInputPath = join(tmpdir(), `input_${randomUUID()}.wav`)
    const tempOutputPath = join(tmpdir(), `output_${randomUUID()}.wav`)

    try {
      await this.saveRawAudioToFile(recordingData, tempInputPath)
      
      const success = await this.resampleWithFFmpeg(tempInputPath, tempOutputPath)
      if (!success) {
        return { success: false, error: 'FFmpegリサンプリングに失敗しました' }
      }

      const processedData = await this.loadWavFile(tempOutputPath)
      return { success: true, data: processedData }
    } catch (error) {
      return { success: false, error: `音声処理エラー: ${error}` }
    } finally {
      await fs.unlink(tempInputPath).catch(() => {})
      await fs.unlink(tempOutputPath).catch(() => {})
    }
  }

  /** 録音データをWAVファイルとして保存 */
  private async saveRawAudioToFile(recordingData: RecordingData, filePath: string): Promise<void> {
    const { audioData, sampleRate, channels } = recordingData
    
    const audioInt16 = new Int16Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      audioInt16[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767))
    }

    const wavBuffer = this.createWavBuffer(audioInt16, sampleRate, channels)
    await fs.writeFile(filePath, wavBuffer)
  }

  /** WAVファイルのバイナリデータを作成 */
  private createWavBuffer(audioData: Int16Array, sampleRate: number, channels: number): Buffer {
    const length = audioData.length
    const buffer = Buffer.alloc(44 + length * 2)

    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + length * 2, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(channels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * channels * 2, 28)
    buffer.writeUInt16LE(channels * 2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(length * 2, 40)

    for (let i = 0; i < length; i++) {
      buffer.writeInt16LE(audioData[i], 44 + i * 2)
    }

    return buffer
  }

  /** FFmpegを使用して音声をリサンプリング */
  private async resampleWithFFmpeg(inputPath: string, outputPath: string): Promise<boolean> {
    const ffmpegPath = ffmpegStatic
    if (!ffmpegPath) {
      throw new Error('FFmpeg静的バイナリが見つかりません')
    }

    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        '-f', 'wav',
        '-y',
        outputPath
      ])

      ffmpeg.on('close', (code) => {
        resolve(code === 0)
      })

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg実行エラー:', error)
        resolve(false)
      })
    })
  }

  /** WAVファイルを読み込みFloat32Arrayに変換 */
  private async loadWavFile(filePath: string): Promise<Float32Array> {
    const buffer = await fs.readFile(filePath)
    
    const dataOffset = 44
    const dataLength = buffer.length - dataOffset
    const sampleCount = dataLength / 2
    
    const audioData = new Float32Array(sampleCount)
    
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer.readInt16LE(dataOffset + i * 2)
      audioData[i] = sample / 32768.0
    }
    
    return audioData
  }
}