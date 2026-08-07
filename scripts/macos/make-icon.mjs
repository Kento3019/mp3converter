import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/**
 * Dock に置くアイコンの元画像（1024x1024 PNG）を作る。
 * 外部の画像素材やライブラリを持ち込まずに済むよう、図形を直接描く。
 * 出力先はコマンドライン引数で受け取る。
 */

const SIZE = 1024
const SAMPLES = 3 // 1 ピクセルあたり 3x3 で標本化して輪郭をなめらかにする

// 画面のアクセント色にそろえる。
const ACCENT = [0x6c, 0x4c, 0xe0]
const ACCENT_DARK = [0x4e, 0x33, 0xb8]
const WHITE = [0xff, 0xff, 0xff]

// macOS のアイコンは余白を持つ角丸正方形が標準。
const INSET = 96
const RADIUS = 190

function insideRoundedRect(x, y) {
  const min = INSET
  const max = SIZE - INSET
  if (x < min || x > max || y < min || y > max) return false

  const left = min + RADIUS
  const right = max - RADIUS
  const top = min + RADIUS
  const bottom = max - RADIUS

  const cx = x < left ? left : x > right ? right : x
  const cy = y < top ? top : y > bottom ? bottom : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

function insideEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1
}

function insideRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

/** 3 点で囲む三角形（八分音符の旗）。 */
function insideTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = sign(x, y, ax, ay, bx, by)
  const d2 = sign(x, y, bx, by, cx, cy)
  const d3 = sign(x, y, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** 音符（符頭 + 符幹 + 旗）。 */
function insideNote(x, y) {
  if (insideEllipse(x, y, 420, 690, 150, 118)) return true
  if (insideRect(x, y, 540, 300, 592, 700)) return true
  if (insideTriangle(x, y, 592, 300, 742, 392, 592, 452)) return true
  return false
}

/** 1 標本点の色を返す。背景の外は透明。 */
function sample(x, y) {
  if (!insideRoundedRect(x, y)) return null
  if (insideNote(x, y)) return WHITE

  // 上から下へわずかに暗くして、平面的に見えないようにする。
  const t = (y - INSET) / (SIZE - INSET * 2)
  return [
    Math.round(ACCENT[0] + (ACCENT_DARK[0] - ACCENT[0]) * t),
    Math.round(ACCENT[1] + (ACCENT_DARK[1] - ACCENT[1]) * t),
    Math.round(ACCENT[2] + (ACCENT_DARK[2] - ACCENT[2]) * t),
  ]
}

function renderRgba() {
  // 各行の先頭にフィルタ種別バイト（0 = None）が要る。
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  const step = 1 / SAMPLES
  const total = SAMPLES * SAMPLES

  for (let py = 0; py < SIZE; py += 1) {
    const rowStart = py * (SIZE * 4 + 1)
    raw[rowStart] = 0

    for (let px = 0; px < SIZE; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const color = sample(px + (sx + 0.5) * step, py + (sy + 0.5) * step)
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          hits += 1
        }
      }

      const offset = rowStart + 1 + px * 4
      if (hits === 0) {
        raw[offset] = 0
        raw[offset + 1] = 0
        raw[offset + 2] = 0
        raw[offset + 3] = 0
        continue
      }

      raw[offset] = Math.round(r / hits)
      raw[offset + 1] = Math.round(g / hits)
      raw[offset + 2] = Math.round(b / hits)
      raw[offset + 3] = Math.round((hits / total) * 255)
    }
  }

  return raw
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng(raw) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8 // ビット深度
  header[9] = 6 // カラータイプ RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const output = process.argv[2]
if (!output) {
  process.stderr.write('使い方: node make-icon.mjs <出力先.png>\n')
  process.exit(1)
}

writeFileSync(output, encodePng(renderRgba()))
process.stdout.write(`アイコンの元画像を作成しました: ${output}\n`)
