import { GoogleGenAI } from '@google/genai'
import { CostInfo, GeminiConfig, TranscriptionResult, VocabularyEntry } from './types'

/** Gemini API クライアント */
export class GeminiClient {
  private ai: GoogleGenAI
  private config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    this.ai = new GoogleGenAI({ apiKey: config.apiKey })
  }

  /** WAVファイルをテキストに変換し、コスト情報も返す */
  async transcribe(
    wavFilePath: string,
    vocabularyEntries: readonly VocabularyEntry[],
    language: string
  ): Promise<TranscriptionResult> {
    const uploadedFile = await this.ai.files.upload({
      file: wavFilePath,
      config: {
        mimeType: 'audio/wav'
      }
    })

    const prompt = this.createTranscriptionPrompt(vocabularyEntries, language)

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
  }

  /** 音声認識プロンプトを作成 */
  private createTranscriptionPrompt(
    vocabularyEntries: readonly VocabularyEntry[],
    language: string
  ): string {
    let prompt = `
以下の音声を ${language} の発話として書き起こしてください。
話された内容をできるだけそのまま出力してください。
要約、言い換え、文章の整形、フィラーの除去、表現の補正はしないでください。
聞き取れない箇所は推測で補わず、聞こえた範囲だけを出力してください。
音楽や効果音など、発話ではない音は出力しないでください。
出力は文字起こし本文のみとし、説明文や前置きは書かないでください。`

    if (vocabularyEntries.length > 0) {
      prompt += `\n\n## カスタム語彙\n以下の読み方に聞こえる語は、対応する出力表記を優先してください。文字起こし後の機械的な置換ではなく、音声認識時の参考情報として扱ってください。\n`

      for (const entry of vocabularyEntries) {
        prompt += `- 「${entry.reading}」は「${entry.output}」と出力\n`
      }
    }

    return prompt.trim()
  }

  /** トークン使用量からコスト計算 */
  private calculateCost(
    usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
  ): CostInfo {
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
