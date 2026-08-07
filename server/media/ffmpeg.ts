import { requireBinary } from '../deps/detect.js'
import { internal } from '../lib/errors.js'
import { run } from '../lib/exec.js'
import { logger } from '../lib/logger.js'
import { parseFfmpegProgressLine, percentFromDuration } from './progress.js'
import { type Quality, bitrateFor } from './quality.js'

export interface ToMp3Options {
  input: string
  output: string
  quality: Quality
  /** ffprobe で取った総尺（秒）。0 なら進捗は 0 のまま進む。 */
  durationSec: number
  /** MP3 のタイトルタグに書く文字列。 */
  title?: string
  /** 0〜100 が渡る。同じ値の連続呼び出しは間引き済み。 */
  onPercent?: (percent: number) => void
  signal?: AbortSignal
}

/** 変換が終わらないまま張り付くのを防ぐ上限。尺の 4 倍か 10 分の長い方。 */
function timeoutFor(durationSec: number): number {
  const byDuration = Math.ceil(durationSec * 4) * 1000
  return Math.max(10 * 60_000, byDuration)
}

/**
 * 動画・音声ファイルを MP3 に変換する。
 * YouTube 経路もダウンロード後にこの関数を通すので、変換処理は 1 箇所に集約される。
 */
export async function toMp3(options: ToMp3Options): Promise<void> {
  const { input, output, quality, durationSec, title, onPercent, signal } = options
  const ffmpeg = requireBinary('ffmpeg')

  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    input,
    // 映像を捨てて音声だけ残す。
    '-vn',
    '-acodec',
    'libmp3lame',
    '-b:a',
    bitrateFor(quality),
    // iTunes / Windows Media Player でも読めるタグ形式。
    '-id3v2_version',
    '3',
    '-write_id3v1',
    '1',
    ...(title ? ['-metadata', `title=${title}`] : []),
    '-progress',
    'pipe:1',
    '-nostats',
    output,
  ]

  let lastReported = -1
  const stderrTail: string[] = []

  const result = await run(ffmpeg, args, {
    timeoutMs: timeoutFor(durationSec),
    ...(signal ? { signal } : {}),
    onStdoutLine: (line) => {
      const progress = parseFfmpegProgressLine(line)
      if (!progress || progress.outTimeUs === undefined) return
      const percent = percentFromDuration(progress.outTimeUs, durationSec)
      if (percent === lastReported) return
      lastReported = percent
      onPercent?.(percent)
    },
    onStderrLine: (line) => {
      // 失敗時の原因調査用。直近だけ保持してログを膨らませない。
      stderrTail.push(line)
      if (stderrTail.length > 20) stderrTail.shift()
    },
  })

  if (result.timedOut) {
    logger.error('ffmpeg がタイムアウト', { input, durationSec })
    throw internal(
      '変換に時間がかかりすぎたため中止しました。',
      'ファイルが非常に長い場合に起きます。短いファイルで試してください。',
    )
  }

  if (result.code !== 0) {
    logger.error('ffmpeg が異常終了', { code: result.code, stderr: stderrTail.join(' / ') })
    throw internal(
      '変換に失敗しました。',
      '別のファイルで試してください。何度も続く場合はアプリを再起動してください。',
      new Error(stderrTail.join('\n')),
      'retry',
    )
  }

  onPercent?.(100)
}
