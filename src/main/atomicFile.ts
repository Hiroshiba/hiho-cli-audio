import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

/** ファイルを一時ファイル経由で安全に書き込む */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const fileDir = dirname(filePath)
  const temporaryFilePath = join(fileDir, `.${basename(filePath)}.${randomUUID()}.tmp`)

  await fs.mkdir(fileDir, { recursive: true })

  try {
    await fs.writeFile(temporaryFilePath, data)
    await fs.rename(temporaryFilePath, filePath)
  } catch (error) {
    try {
      await fs.unlink(temporaryFilePath)
    } catch (cleanupError) {
      if (hasErrorCode(cleanupError, 'ENOENT')) {
        throw error
      }

      throw new Error(
        `ファイル書き込みに失敗し、一時ファイルの削除にも失敗しました: ${cleanupError}`,
        { cause: error }
      )
    }

    throw error
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
