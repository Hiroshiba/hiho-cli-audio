import { GoogleGenAI } from '@google/genai'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CostInfo, GeminiConfig, TranscriptionResult } from './types'

/** Gemini API クライアント */
export class GeminiClient {
  private ai: GoogleGenAI
  private config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    this.ai = new GoogleGenAI({ apiKey: config.apiKey })
  }

  /** 音声データをテキストに変換し、コスト情報も返す */
  async transcribe(audioData: Float32Array, sampleRate: number): Promise<TranscriptionResult> {
    const tempFilePath = await this.saveAudioToTempFile(audioData, sampleRate)

    try {
      const uploadedFile = await this.ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType: 'audio/wav'
        }
      })

      const prompt = `
以下の音声を書き起こしてください。フィーラー（「えー」「あの」「その」「まあ」などの間投詞）は除去し、内容の意味を損なわないようにしてください。
複数の話者がいる場合はSpeaker A、Speaker Bのように識別してください。1話者だった場合は何も書かないでください。
音楽や効果音がある場合は無視してください。
最後に「シンク」「メガシンク」と言っていたら、最後に「think」や「megathink」を追加してください。
      `.trim()

      const response = await this.ai.models.generateContent({
        model: this.config.model,
        contents: [
          {
            parts: [
              { text: prompt },
              { fileData: { mimeType: 'audio/wav', fileUri: uploadedFile.uri } }
            ]
          }
        ]
      })

      const usage = response.usageMetadata
      const costInfo = this.calculateCost(usage)

      return {
        text: response.text || '',
        costInfo
      }
    } finally {
      await fs.unlink(tempFilePath).catch(() => {})
    }
  }

  /** Float32ArrayをWAVファイルとして一時保存 */
  private async saveAudioToTempFile(audioData: Float32Array, sampleRate: number): Promise<string> {
    const audioInt16 = new Int16Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      audioInt16[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767))
    }

    const tempFileName = `audio_${randomUUID()}.wav`
    const tempFilePath = join(tmpdir(), tempFileName)

    const wavBuffer = this.createWavBuffer(audioInt16, sampleRate)
    await fs.writeFile(tempFilePath, wavBuffer)

    return tempFilePath
  }

  /** WAVファイルのバイナリデータを作成 */
  private createWavBuffer(audioData: Int16Array, sampleRate: number): Buffer {
    const length = audioData.length
    const buffer = Buffer.alloc(44 + length * 2)

    // WAVヘッダー
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + length * 2, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(length * 2, 40)

    // 音声データ
    for (let i = 0; i < length; i++) {
      buffer.writeInt16LE(audioData[i], 44 + i * 2)
    }

    return buffer
  }

  /** トークン使用量からコスト計算 */
  private calculateCost(usage: any): CostInfo {
    const promptTokens = usage?.promptTokenCount || 0
    const outputTokens = usage?.candidatesTokenCount || 0

    const inputPricePerMillion = 1.25
    const outputPricePerMillion = 10.0

    const costUsd = 
      (promptTokens / 1_000_000) * inputPricePerMillion +
      (outputTokens / 1_000_000) * outputPricePerMillion

    return {
      promptTokens,
      outputTokens,
      costUsd
    }
  }
}