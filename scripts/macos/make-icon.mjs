import { writeFileSync } from 'node:fs'
import { encodeIconPng, renderIconRaw } from '../shared/icon-render.mjs'

/**
 * Dock に置くアイコンの元画像（1024x1024 PNG）を作る。
 * 描画そのものは scripts/shared/icon-render.mjs（Windows の .ico 生成と共有）。
 * 出力先はコマンドライン引数で受け取る。sips が iconset 各サイズへ縮小する。
 */

const SIZE = 1024

const output = process.argv[2]
if (!output) {
  process.stderr.write('使い方: node make-icon.mjs <出力先.png>\n')
  process.exit(1)
}

writeFileSync(output, encodeIconPng(renderIconRaw(SIZE), SIZE))
process.stdout.write(`アイコンの元画像を作成しました: ${output}\n`)
