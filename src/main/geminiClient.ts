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
    vocabularyEntries: readonly VocabularyEntry[]
  ): Promise<TranscriptionResult> {
    const uploadedFile = await this.ai.files.upload({
      file: wavFilePath,
      config: {
        mimeType: 'audio/wav'
      }
    })

    const prompt = this.createTranscriptionPrompt(vocabularyEntries)

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
  private createTranscriptionPrompt(vocabularyEntries: readonly VocabularyEntry[]): string {
    let prompt = `
以下の音声を書き起こしてください。フィーラー（「えー」「あの」「その」「まあ」などの間投詞）は除去し、内容の意味を損なわないようにしてください。
複数の話者がいる場合はSpeaker A、Speaker Bのように識別してください。1話者だった場合は何も書かないでください。
音楽や効果音がある場合は無視してください。
最後に「シンク」「メガシンク」と言っていたら、最後に「think」や「megathink」を追加してください。`

    if (vocabularyEntries.length > 0) {
      prompt += `\n\n## 特定の語彙の認識について\n以下の語彙については、読み方が認識された場合は対応する出力形式で記述してください：\n`

      for (const entry of vocabularyEntries) {
        prompt += `- 「${entry.reading}」と聞こえた場合は「${entry.output}」と記述\n`
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
