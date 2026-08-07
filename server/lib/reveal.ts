import { existsSync } from 'node:fs'
import { config } from '../config.js'
import { notFound } from './errors.js'
import { run } from './exec.js'
import { isInside } from './paths.js'

/**
 * 完成した MP3 の場所をファイルマネージャで開く。
 * 保存先ディレクトリの外は絶対に開かない（任意パスを開かせない）。
 * OS 分岐はこのファイルと paths.ts の 2 箇所だけに閉じ込める。
 */
export async function revealInFileManager(targetPath: string): Promise<void> {
  if (!isInside(config.outputDir, targetPath) || !existsSync(targetPath)) {
    throw notFound(
      'ファイルが見つかりませんでした。',
      '削除されたか移動された可能性があります。もう一度変換してください。',
    )
  }

  if (process.platform === 'darwin') {
    await run('open', ['-R', targetPath], { timeoutMs: 10_000 })
    return
  }

  if (process.platform === 'win32') {
    // explorer は成功時も 1 を返すため、終了コードは見ない。
    await run('explorer', [`/select,${targetPath}`], { timeoutMs: 10_000 }).catch(() => undefined)
    return
  }

  await run('xdg-open', [config.outputDir], { timeoutMs: 10_000 })
}
