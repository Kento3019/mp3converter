import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { config } from '../config.js'
import { requireBinary, resolveBinary } from '../deps/detect.js'
import { ytdlpUpdateHint } from '../deps/messages.js'
import { AppError, internal } from '../lib/errors.js'
import { run } from '../lib/exec.js'
import { logger } from '../lib/logger.js'
import { APP_ROOT, isInside } from '../lib/paths.js'
import { parseYtdlpPercent } from './progress.js'

const META_TIMEOUT_MS = 60_000
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000

export interface YoutubeMeta {
  id: string
  title: string
  durationSec: number
}

const MetaSchema = z.object({
  id: z.string().default(''),
  title: z.string().default(''),
  duration: z.number().nullable().optional(),
})

/** 動画のタイトルと尺だけ先に取る。ダウンロード前に画面へ名前を出すため。 */
export async function fetchMeta(url: string): Promise<YoutubeMeta> {
  const ytdlp = requireBinary('ytdlp')

  const result = await run(
    ytdlp,
    ['--dump-single-json', '--no-playlist', '--no-warnings', '--skip-download', url],
    { timeoutMs: META_TIMEOUT_MS },
  )

  if (result.code !== 0) throw mapYtdlpError(result.stderr)

  let raw: unknown
  try {
    raw = JSON.parse(result.stdout)
  } catch (error) {
    throw internal('動画の情報を読み取れませんでした。', 'もう一度お試しください。', error, 'retry')
  }

  const parsed = MetaSchema.safeParse(raw)
  if (!parsed.success) {
    throw internal(
      '動画の情報を読み取れませんでした。',
      'もう一度お試しください。',
      parsed.error,
      'retry',
    )
  }

  return {
    id: parsed.data.id,
    title: parsed.data.title || '無題の動画',
    durationSec: parsed.data.duration ?? 0,
  }
}

export interface DownloadAudioParams {
  url: string
  destDir: string
  /** 出力ファイルの接頭辞。ジョブ ID を渡して衝突を避ける。 */
  baseName: string
  onPercent?: (percent: number) => void
}

/**
 * 音声だけをダウンロードする。MP3 化はここではやらず ffmpeg.ts に任せる
 * （ファイル経路と変換処理を共有するため）。
 */
export async function downloadAudio(params: DownloadAudioParams): Promise<string> {
  const { url, destDir, baseName, onPercent } = params
  const ytdlp = requireBinary('ytdlp')
  const ffmpeg = resolveBinary('ffmpeg')

  const args = [
    '-f',
    'bestaudio/best',
    '--no-playlist',
    '--no-part',
    '--newline',
    '--no-warnings',
    '-o',
    join(destDir, `${baseName}.%(ext)s`),
    ...(ffmpeg ? ['--ffmpeg-location', dirname(ffmpeg)] : []),
    url,
  ]

  let last = -1
  const stderrTail: string[] = []

  const result = await run(ytdlp, args, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    onStdoutLine: (line) => {
      const percent = parseYtdlpPercent(line)
      if (percent === null || percent === last) return
      last = percent
      onPercent?.(percent)
    },
    onStderrLine: (line) => {
      stderrTail.push(line)
      if (stderrTail.length > 20) stderrTail.shift()
    },
  })

  if (result.timedOut) {
    throw internal(
      'ダウンロードに時間がかかりすぎたため中止しました。',
      '通信環境を確認するか、短い動画で試してください。',
    )
  }

  if (result.code !== 0) throw mapYtdlpError(stderrTail.join('\n'))

  const downloaded = await findDownloaded(destDir, baseName)
  if (!downloaded) {
    throw internal(
      'ダウンロードしたファイルが見つかりませんでした。',
      'もう一度お試しください。',
      undefined,
      'retry',
    )
  }
  return downloaded
}

async function findDownloaded(destDir: string, baseName: string): Promise<string | null> {
  const entries = await readdir(destDir).catch(() => [] as string[])
  const match = entries.find((entry) => entry.startsWith(`${baseName}.`))
  return match ? join(destDir, match) : null
}

/**
 * yt-dlp の自己更新。
 * YouTube 側の変更で壊れたときに、利用者がボタン 1 つで直せるようにするための入口。
 */
export async function selfUpdate(): Promise<{ updated: boolean; message: string }> {
  const ytdlp = resolveBinary('ytdlp')
  if (!ytdlp) {
    return { updated: false, message: 'YouTube 取得ソフトが見つかりませんでした。' }
  }

  // Homebrew / winget などパッケージ管理下のバイナリは -U を拒否する。
  // 無駄に失敗ログを出さず、正しい更新方法を伝える。
  if (!isBundled(ytdlp)) {
    return {
      updated: false,
      message: `このパソコンでは自動更新できません。${ytdlpUpdateHint()}`,
    }
  }

  const result = await run(ytdlp, ['-U'], { timeoutMs: 120_000 }).catch(() => null)
  if (!result || result.code !== 0) {
    logger.warn('yt-dlp の更新に失敗', result?.stderr ?? 'spawn error')
    return { updated: false, message: '更新できませんでした。通信環境を確認してください。' }
  }

  const output = `${result.stdout}${result.stderr}`
  const alreadyLatest = /up[- ]to[- ]date/i.test(output)
  logger.info('yt-dlp の更新を実行', output.split(/\r?\n/).slice(0, 3).join(' / '))

  return {
    updated: !alreadyLatest,
    message: alreadyLatest ? 'すでに最新でした。' : '最新版に更新しました。',
  }
}

/** npm install が取ってきた同梱バイナリか。これ以外は -U できない。 */
function isBundled(path: string): boolean {
  return isInside(join(APP_ROOT, 'node_modules'), path)
}

/** サーバ起動時と一定間隔で自己更新する。失敗しても起動は止めない。 */
export function startAutoUpdate(): void {
  const hours = config.ytdlpUpdateIntervalHours
  if (hours <= 0) return

  const tick = (): void => {
    void selfUpdate().catch((error: unknown) => logger.warn('yt-dlp 自動更新で例外', error))
  }

  tick()
  setInterval(tick, hours * 60 * 60 * 1000).unref()
}

/**
 * yt-dlp の stderr を「利用者が次に何をすればよいか」に翻訳する。
 * 原因が分からないものは仕様変更とみなし、［更新して再試行］を提示する。
 */
export function mapYtdlpError(stderr: string): AppError {
  const text = stderr.toLowerCase()

  if (text.includes('private video') || text.includes('members-only')) {
    return new AppError({
      status: 400,
      message: 'この動画は非公開のため取得できません。',
      hint: '公開されている動画を選んでください。',
    })
  }

  if (text.includes('video unavailable') || text.includes('removed')) {
    return new AppError({
      status: 400,
      message: 'この動画は見つかりませんでした。',
      hint: '削除されたか、地域制限がかかっている可能性があります。',
    })
  }

  if (text.includes('confirm your age') || text.includes('age-restricted')) {
    return new AppError({
      status: 400,
      message: 'この動画は年齢制限があり取得できません。',
      hint: '別の動画を選んでください。',
    })
  }

  if (text.includes('sign in') || text.includes('bot')) {
    return new AppError({
      status: 503,
      message: 'YouTube 側から一時的に拒否されました。',
      hint: 'しばらく待ってから、［更新して再試行］を押してください。',
      action: 'update-ytdlp',
    })
  }

  logger.error('yt-dlp が想定外の失敗', stderr.split(/\r?\n/).slice(-5).join(' / '))
  return new AppError({
    status: 502,
    message: 'YouTube から取得できませんでした。',
    hint: 'YouTube 側の仕様が変わった可能性があります。［更新して再試行］を押してください。',
    action: 'update-ytdlp',
  })
}
