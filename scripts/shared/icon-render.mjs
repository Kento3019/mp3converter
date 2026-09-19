/**
 * アプリアイコンの元絵を描く純粋関数群。
 * macOS の .icns 生成（scripts/macos/make-icon.mjs）と
 * Windows の .ico 生成（scripts/windows/make-icon.mjs）が共有する。
 * 外部の画像素材やライブラリを持ち込まず、図形を直接ラスタライズする。
 */

import { deflateSync } from 'node:zlib'

const SAMPLES = 3 // 1 ピクセルあたり 3x3 で標本化して輪郭をなめらかにする

// 画面のアクセント色にそろえる。
const ACCENT = [0x6c, 0x4c, 0xe0]
const ACCENT_DARK = [0x4e, 0x33, 0xb8]
const WHITE = [0xff, 0xff, 0xff]

// 以下はすべて 1024 基準の比率。どのサイズで描いても同じ見た目になる。
const INSET_RATIO = 96 / 1024
const RADIUS_RATIO = 190 / 1024
const NOTE_HEAD = { cx: 420 / 1024, cy: 690 / 1024, rx: 150 / 1024, ry: 118 / 1024 }
const NOTE_STEM = { x0: 540 / 1024, y0: 300 / 1024, x1: 592 / 1024, y1: 700 / 1024 }
const NOTE_FLAG = {
  ax: 592 / 1024,
  ay: 300 / 1024,
  bx: 742 / 1024,
  by: 392 / 1024,
  cx: 592 / 1024,
  cy: 452 / 1024,
}

function insideRoundedRect(x, y, size) {
  const inset = INSET_RATIO * size
  const radius = RADIUS_RATIO * size
  const min = inset
  const max = size - inset
  if (x < min || x > max || y < min || y > max) return false

  const left = min + radius
  const right = max - radius
  const top = min + radius
  const bottom = max - radius

  const cx = x < left ? left : x > right ? right : x
  const cy = y < top ? top : y > bottom ? bottom : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
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
function insideNote(x, y, size) {
  const h = NOTE_HEAD
  if (insideEllipse(x, y, h.cx * size, h.cy * size, h.rx * size, h.ry * size)) return true
  const s = NOTE_STEM
  if (insideRect(x, y, s.x0 * size, s.y0 * size, s.x1 * size, s.y1 * size)) return true
  const f = NOTE_FLAG
  if (
    insideTriangle(
      x,
      y,
      f.ax * size,
      f.ay * size,
      f.bx * size,
      f.by * size,
      f.cx * size,
      f.cy * size,
    )
  )
    return true
  return false
}

/** 1 標本点の色を返す。背景の外は透明。 */
function sample(x, y, size) {
  if (!insideRoundedRect(x, y, size)) return null
  if (insideNote(x, y, size)) return WHITE

  // 上から下へわずかに暗くして、平面的に見えないようにする。
  const inset = INSET_RATIO * size
  const t = (y - inset) / (size - inset * 2)
  return [
    Math.round(ACCENT[0] + (ACCENT_DARK[0] - ACCENT[0]) * t),
    Math.round(ACCENT[1] + (ACCENT_DARK[1] - ACCENT[1]) * t),
    Math.round(ACCENT[2] + (ACCENT_DARK[2] - ACCENT[2]) * t),
  ]
}

/** size x size の RGBA を描く。戻り値は PNG の IDAT に渡せる生バイト列（行頭フィルタバイト込み）。 */
export function renderIconRaw(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const step = 1 / SAMPLES
  const total = SAMPLES * SAMPLES

  for (let py = 0; py < size; py += 1) {
    const rowStart = py * (size * 4 + 1)
    raw[rowStart] = 0 // フィルタ種別 0 = None

    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const color = sample(px + (sx + 0.5) * step, py + (sy + 0.5) * step, size)
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

/** raw（renderIconRaw の戻り値）を size x size の PNG にエンコードする。 */
export function encodeIconPng(raw, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
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
