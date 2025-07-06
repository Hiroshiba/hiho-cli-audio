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

  /** WAVファイルをテキストに変換し、コスト情報も返す */
  async transcribe(wavFilePath: string): Promise<TranscriptionResult> {
    try {
      const uploadedFile = await this.ai.files.upload({
        file: wavFilePath,
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
    } catch (error) {
      throw error
    }
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