import { config } from '../server/config.js'
import { detectDeps } from '../server/deps/detect.js'

/**
 * 必要なソフトが揃っているかを日本語で表示する。
 * setup.sh からも呼ばれ、不足があれば終了コード 1 を返す。
 */
async function main(): Promise<void> {
  const report = await detectDeps({ refresh: true })
  const out = process.stdout

  out.write('\n必要なソフトの確認\n')
  out.write(`${'─'.repeat(56)}\n`)

  for (const item of report.items) {
    const usable = item.found && item.canEncodeMp3 !== false
    const mark = usable ? 'OK  ' : 'なし'
    out.write(`[${mark}] ${item.label}\n`)
    out.write(`       用途: ${item.purpose}\n`)
    if (item.version) out.write(`       バージョン: ${item.version}\n`)
    if (item.path) out.write(`       場所: ${item.path}\n`)
    if (item.hint) out.write(`       → ${item.hint}\n`)
    out.write('\n')
  }

  out.write(`${'─'.repeat(56)}\n`)
  out.write(`MP3 の保存先: ${config.outputDir}\n`)
  out.write(`画面の URL:   http://${config.host}:${config.port}\n\n`)

  if (report.allReady) {
    out.write('すべて揃っています。そのまま使えます。\n\n')
    return
  }

  out.write('足りないソフトがあります。上の「→」の手順を実行してください。\n\n')
  process.exitCode = 1
}

await main()
