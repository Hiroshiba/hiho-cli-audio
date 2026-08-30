import { execFile } from 'node:child_process'

const COMMAND_TIMEOUT_MILLISECONDS = 5000

/** 外部コマンドを引数配列で実行して標準出力を取得 */
export function execFileText(filePath: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      filePath,
      [...args],
      {
        encoding: 'utf8',
        shell: false,
        timeout: COMMAND_TIMEOUT_MILLISECONDS
      },
      (error, stdout) => {
        if (error != null) {
          reject(error)
          return
        }

        if (typeof stdout !== 'string') {
          reject(new Error('外部コマンドの標準出力を文字列として取得できません'))
          return
        }

        resolve(stdout)
      }
    )
  })
}
