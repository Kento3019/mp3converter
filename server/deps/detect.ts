import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { config } from '../config.js'
import { AppError } from '../lib/errors.js'
import { run } from '../lib/exec.js'
import { APP_ROOT } from '../lib/paths.js'
import { type DepName, depFixHint, depLabel, depPurpose, MP3_ENCODER_MISSING } from './messages.js'

export interface DepStatus {
  name: DepName
  label: string
  purpose: string
  found: boolean
  path: string | null
  version: string | null
  /** ffmpeg のみ。MP3 エンコーダ（libmp3lame）が使えるか。 */
  canEncodeMp3?: boolean
  /** 見つからない、または使えないときの直し方。 */
  hint: string | null
}

export interface DepsReport {
  allReady: boolean
  items: DepStatus[]
  checkedAt: number
}

/**
 * launchd / タスクスケジューラから起動された直後は、インストーラが更新した
 * PATH がまだセッションに反映されていないことがある。
 * 各パッケージ管理の既定インストール先を明示的に探索し、
 * 「ターミナルでは動くのに常駐だと動かない」事故を防ぐ。
 */
const EXTRA_SEARCH_DIRS =
  process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/opt/local/bin']
    : process.platform === 'win32'
      ? [join(homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links')]
      : []

const EXECUTABLE_SUFFIXES = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

const CACHE_TTL_MS = 30_000
let cache: DepsReport | null = null

/** 実行ファイルの絶対パスを解決する。見つからなければ null。 */
export function resolveBinary(name: DepName): string | null {
  const override = config.overrides[name]
  if (override && isExecutable(override)) return override

  if (name === 'ytdlp') {
    const bundled = bundledYtdlpPath()
    if (bundled) return bundled
  }

  const command = name === 'ytdlp' ? 'yt-dlp' : name
  for (const dir of searchDirs()) {
    for (const suffix of EXECUTABLE_SUFFIXES) {
      const candidate = join(dir, `${command}${suffix}`)
      if (isExecutable(candidate)) return candidate
    }
  }
  return null
}

/** youtube-dl-exec が npm install 時に取ってくるバイナリ。 */
function bundledYtdlpPath(): string | null {
  const base = join(APP_ROOT, 'node_modules', 'youtube-dl-exec', 'bin')
  for (const file of ['yt-dlp.exe', 'yt-dlp']) {
    const candidate = join(base, file)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

function searchDirs(): string[] {
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  // 明示ディレクトリを先に見る（launchd の細い PATH を補うため）。
  return [...EXTRA_SEARCH_DIRS, ...fromPath]
}

function isExecutable(path: string): boolean {
  if (!existsSync(path)) return false
  if (process.platform === 'win32') return true
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 全依存の状態を調べる。30 秒キャッシュ（画面がポーリングするため）。 */
export async function detectDeps(options: { refresh?: boolean } = {}): Promise<DepsReport> {
  if (!options.refresh && cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) return cache

  const items = await Promise.all([
    inspectFfmpeg(),
    inspectSimple('ffprobe', ['-version']),
    inspectSimple('ytdlp', ['--version']),
  ])

  const report: DepsReport = {
    allReady: items.every((item) => item.found && item.canEncodeMp3 !== false),
    items,
    checkedAt: Date.now(),
  }
  cache = report
  return report
}

async function inspectFfmpeg(): Promise<DepStatus> {
  const base = await inspectSimple('ffmpeg', ['-version'])
  if (!base.found || !base.path) return { ...base, canEncodeMp3: false }

  const encoders = await run(base.path, ['-hide_banner', '-encoders'], { timeoutMs: 15_000 })
  const canEncodeMp3 = encoders.stdout.includes('libmp3lame')
  return {
    ...base,
    canEncodeMp3,
    hint: canEncodeMp3 ? null : `${MP3_ENCODER_MISSING.hint}MP3 を作る機能が欠けています。`,
  }
}

async function inspectSimple(name: DepName, args: string[]): Promise<DepStatus> {
  const path = resolveBinary(name)
  const common = { name, label: depLabel(name), purpose: depPurpose(name) }

  if (!path) {
    return { ...common, found: false, path: null, version: null, hint: depFixHint(name) }
  }

  try {
    const result = await run(path, args, { timeoutMs: 15_000 })
    if (result.code !== 0) {
      return { ...common, found: false, path, version: null, hint: depFixHint(name) }
    }
    return { ...common, found: true, path, version: parseVersion(result.stdout), hint: null }
  } catch {
    return { ...common, found: false, path, version: null, hint: depFixHint(name) }
  }
}

/** "ffmpeg version 7.1.1-full_build ..." / "2026.07.04" のどちらからも取れるようにする。 */
function parseVersion(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (!firstLine) return null
  const match = /version\s+(\S+)/i.exec(firstLine)
  return match?.[1] ?? firstLine
}

/**
 * 実行直前に依存を要求する。
 * 無ければ画面にそのまま出せる日本語の AppError を投げる。
 */
export function requireBinary(name: DepName): string {
  const path = resolveBinary(name)
  if (!path) {
    throw new AppError({
      status: 503,
      message: `${depLabel(name)}が見つかりません。`,
      hint: depFixHint(name),
      action: 'check-deps',
    })
  }
  return path
}
