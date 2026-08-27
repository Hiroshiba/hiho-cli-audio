import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { GeminiConfig, Result, TranscriptionMode, TranscriptionResult } from './types'

interface TranscriptionOptions {
  language: string
  mode: TranscriptionMode
  customVocabulary: readonly string[]
}

interface TranscriptionApiConfig {
  language_codes: string[]
  custom_vocabulary: string[]
  mode: TranscriptionMode
}

const CompletedInteractionSchema = z
  .object({
    status: z.literal('completed'),
    output_text: z.string().trim().min(1, 'Gemini の文字起こし結果が空です')
  })
  .passthrough()

/** Gemini API クライアント */
export class GeminiClient {
  private readonly ai: GoogleGenAI
  private readonly config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    this.ai = new GoogleGenAI({ apiKey: config.apiKey })
  }

  /** WAVファイルをテキストに変換する */
  async transcribe(
    wavFilePath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const uploadedFile = await this.ai.files.upload({
      file: wavFilePath,
      config: {
        mimeType: 'audio/wav'
      }
    })
    const uploadedFileName = uploadedFile.name
    assertNonNullable(uploadedFileName, 'アップロード結果にファイル名がありません')

    const transcriptionResult = await captureResult(async () => {
      const uploadedFileUri = uploadedFile.uri
      assertNonNullable(uploadedFileUri, 'アップロード結果にファイル URI がありません')
      return this.transcribeUploadedFile(uploadedFileUri, options)
    })
    const deletionResult = await captureResult(() =>
      this.ai.files.delete({ name: uploadedFileName })
    )

    if (!transcriptionResult.success && !deletionResult.success) {
      throw new AggregateError(
        [transcriptionResult.error, deletionResult.error],
        '文字起こしとアップロード済みファイルの削除に失敗しました'
      )
    }
    if (!transcriptionResult.success) {
      throw transcriptionResult.error
    }
    if (!deletionResult.success) {
      throw deletionResult.error
    }

    return transcriptionResult.data
  }

  private async transcribeUploadedFile(
    uploadedFileUri: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const transcriptionConfig = {
      language_codes: [options.language],
      custom_vocabulary: [...options.customVocabulary],
      mode: options.mode
    } satisfies TranscriptionApiConfig
    const interaction = await this.ai.interactions.create({
      model: this.config.model,
      input: [
        {
          type: 'audio',
          uri: uploadedFileUri,
          mime_type: 'audio/wav'
        }
      ],
      generation_config: {
        transcription_config: transcriptionConfig
      }
    })
    const completedInteraction = CompletedInteractionSchema.parse(interaction)

    return {
      text: completedInteraction.output_text
    }
  }
}

async function captureResult<T>(operation: () => Promise<T>): Promise<Result<T, unknown>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    return { success: false, error }
  }
}

function assertNonNullable<T>(value: T, message: string): asserts value is NonNullable<T> {
  if (value == null) {
    throw new Error(message)
  }
}
