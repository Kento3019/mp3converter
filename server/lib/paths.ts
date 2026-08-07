import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * リポジトリのルート。
 * dev（tsx で server/lib/paths.ts を実行）でも本番（dist/server/lib/paths.js）でも
 * 同じ場所を指すよう、package.json を上方向に探して決める。
 */
export const APP_ROOT = findAppRoot()

function findAppRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** 利用者から見える MP3 の保存先。探させないよう Music 配下に固定する。 */
export function defaultOutputDir(): string {
  return join(homedir(), 'Music', 'MP3コンバーター')
}

/** アップロード原本や yt-dlp の落としたファイルを置く作業領域。 */
export function defaultWorkDir(): string {
  return join(APP_ROOT, 'storage', 'work')
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/**
 * ファイル名に使えない文字。
 * パス区切り（/ \）、Windows 予約記号（< > : " | ? *）、C0/C1 制御文字。
 * リテラルに制御文字を書き込まないよう、エスケープ文字列から組み立てる。
 */
const ILLEGAL_CHARS = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f\\u007f]', 'g')
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
const MAX_FILENAME_BYTES = 180

/**
 * 利用者由来の文字列をファイル名として安全な形に正規化する。
 * パス区切り・制御文字・Windows 予約名を潰し、日本語はそのまま残す。
 * 拡張子は含めない前提（呼び出し側で付ける）。
 */
export function safeFilename(raw: string, fallback = 'audio'): string {
  const collapsed = raw
    .normalize('NFC')
    .replace(ILLEGAL_CHARS, '_')
    // 連続するドットを潰す。単独の . は「第1話.完」のような名前で使うので残す。
    .replace(/\.{2,}/g, '_')
    .replace(/\s+/g, ' ')
  // 先頭のドットは隠しファイル化を招く。区切り文字だけになった名前は空と見なす。
  const trimmed = collapsed.replace(/^[._\s]+/, '').replace(/[._\s]+$/, '')
  if (!trimmed) return fallback
  const guarded = WINDOWS_RESERVED.test(trimmed) ? `_${trimmed}` : trimmed
  return truncateBytes(guarded, MAX_FILENAME_BYTES) || fallback
}

/** UTF-8 バイト数で切る。マルチバイト文字を途中で割らない。 */
function truncateBytes(value: string, limit: number): string {
  if (Buffer.byteLength(value, 'utf8') <= limit) return value
  let out = ''
  let bytes = 0
  for (const char of value) {
    const size = Buffer.byteLength(char, 'utf8')
    if (bytes + size > limit) break
    out += char
    bytes += size
  }
  return out.trimEnd()
}

/**
 * child が parent の配下にあるか。
 * 出力ディレクトリ外のファイルを配信・オープンさせないための境界チェック。
 */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** 同名ファイルがあるとき「名前 (2).mp3」のように連番を付ける。 */
export function uniquePath(dir: string, base: string, ext: string): string {
  const first = join(dir, `${base}${ext}`)
  if (!existsSync(first)) return first
  for (let n = 2; n < 1000; n += 1) {
    const candidate = join(dir, `${base} (${n})${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${base} (${Date.now()})${ext}`)
}
