import { GeminiClient } from './geminiClient'
import { GeminiConfig } from './types'

/** Gemini API サービス（シングルトン） */
export class GeminiService {
  private static instance: GeminiService | null = null
  private client: GeminiClient | null = null

  private constructor() {}

  /** シングルトンインスタンスを取得 */
  static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService()
    }
    return GeminiService.instance
  }

  /** Gemini クライアントを初期化 */
  initialize(config: GeminiConfig): void {
    this.client = new GeminiClient(config)
  }

  /** Gemini クライアントを取得 */
  getClient(): GeminiClient {
    if (!this.client) {
      throw new Error('GeminiService が初期化されていません')
    }
    return this.client
  }

  /** サービスが初期化済みかどうか */
  isInitialized(): boolean {
    return this.client !== null
  }

  /** クリーンアップ */
  cleanup(): void {
    this.client = null
  }
}