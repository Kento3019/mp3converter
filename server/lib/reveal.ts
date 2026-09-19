import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { notFound } from './errors.js'
import { run } from './exec.js'
import { logger } from './logger.js'
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
    // フルパスで起動する（PATH 検索に頼らない）。
    // '/select,' と対象パスは別々の引数で渡す。1 トークンに結合すると、
    // パスに空白を含む場合 Windows の自動クォートが「"/select,C:\...\My File.mp3"」の
    // ように /select, ごと括ってしまい、explorer 側の独自パーサが解釈できないことがある。
    const explorer = join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
    try {
      // windowsHide は本来 GUI サブシステムのプロセスには無視される仕様だが、
      // explorer.exe だけは例外にして切り分けられるようにする。
      const result = await run(explorer, ['/select,', targetPath], {
        timeoutMs: 10_000,
        windowsHide: false,
      })
      // explorer は成功時も非 0 を返すことがあるため終了コードでは判定しないが、
      // 「spawn は成功したのに窓が開かない」原因調査のためログには残す。
      logger.info('explorer を起動', { code: result.code, stderr: result.stderr })
    } catch (error) {
      // spawn 自体の失敗（ENOENT 等）。以前はここを握りつぶしており、
      // 失敗してもクライアントには revealed: true が返っていた。
      logger.warn('explorer の起動に失敗', error)
    }
    return
  }

  await run('xdg-open', [config.outputDir], { timeoutMs: 10_000 })
}
