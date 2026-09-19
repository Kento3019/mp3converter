import { writeFileSync } from 'node:fs'
import { encodeIconPng, renderIconRaw } from '../shared/icon-render.mjs'

/**
 * スタートメニュー/タスクバー用の .ico を作る。
 * 描画そのものは scripts/shared/icon-render.mjs（macOS の .icns 生成と共有）。
 * Windows Vista 以降、ICO の各フレームは PNG のまま埋め込める
 * （sips のような外部ツールが無いので、各サイズを直接その解像度で描く）。
 */

const SIZES = [16, 32, 48, 256]

const output = process.argv[2]
if (!output) {
  process.stderr.write('使い方: node make-icon.mjs <出力先.ico>\n')
  process.exit(1)
}

const frames = SIZES.map((size) => ({ size, png: encodeIconPng(renderIconRaw(size), size) }))
writeFileSync(output, buildIco(frames))
process.stdout.write(`アイコンを作成しました: ${output}\n`)

/** ICONDIR + ICONDIRENTRY[] + 各フレームの PNG バイト列、という素朴な ICO コンテナを組む。 */
function buildIco(iconFrames) {
  const headerSize = 6
  const entrySize = 16
  const dataOffsetStart = headerSize + entrySize * iconFrames.length

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(iconFrames.length, 4)

  const entries = []
  const dataParts = []
  let offset = dataOffsetStart

  for (const frame of iconFrames) {
    const entry = Buffer.alloc(entrySize)
    // 0 はスペック上「256」を意味する。
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1)
    entry.writeUInt8(0, 2) // カラーパレット無し
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // カラープレーン
    entry.writeUInt16LE(32, 6) // ビット深度（RGBA）
    entry.writeUInt32LE(frame.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    dataParts.push(frame.png)
    offset += frame.png.length
  }

  return Buffer.concat([header, ...entries, ...dataParts])
}
