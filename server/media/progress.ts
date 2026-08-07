/**
 * ffmpeg / yt-dlp の標準出力を進捗率に直す純関数群。
 * プロセス起動を伴わないので、テストはここに集中させる。
 */

export interface FfmpegProgress {
  /** 変換済みの位置（マイクロ秒）。 */
  outTimeUs?: number
  /** 処理倍率（1.5x なら 1.5）。残り時間の見積もりに使う。 */
  speed?: number
  /** progress=end を受け取ったか。 */
  done?: boolean
}

/**
 * `ffmpeg -progress pipe:1` が吐く key=value を 1 行ずつ解釈する。
 * 関心のない行は null を返す。
 */
export function parseFfmpegProgressLine(line: string): FfmpegProgress | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const separator = trimmed.indexOf('=')
  if (separator <= 0) return null

  const key = trimmed.slice(0, separator).trim()
  const value = trimmed.slice(separator + 1).trim()
  if (!value || value === 'N/A') return null

  if (key === 'out_time_us') {
    const micros = Number.parseInt(value, 10)
    return Number.isFinite(micros) ? { outTimeUs: micros } : null
  }

  if (key === 'speed') {
    const speed = Number.parseFloat(value.replace(/x$/, ''))
    return Number.isFinite(speed) ? { speed } : null
  }

  if (key === 'progress') {
    return { done: value === 'end' }
  }

  return null
}

/** 経過マイクロ秒と総尺（秒）から 0〜100 の整数を作る。 */
export function percentFromDuration(outTimeUs: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  if (!Number.isFinite(outTimeUs) || outTimeUs <= 0) return 0
  const ratio = outTimeUs / (durationSec * 1_000_000)
  return clampPercent(Math.round(ratio * 100))
}

const YTDLP_PERCENT = /^\[download\]\s+([\d.]+)%/

/**
 * yt-dlp の `[download]  42.3% of ...` から百分率を取り出す。
 * `--newline` を付けて実行する前提。
 */
export function parseYtdlpPercent(line: string): number | null {
  const match = YTDLP_PERCENT.exec(line.trim())
  if (!match?.[1]) return null
  const percent = Number.parseFloat(match[1])
  return Number.isFinite(percent) ? clampPercent(percent) : null
}

function clampPercent(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

/**
 * 2 段処理（ダウンロード → 変換）の進捗を全体の 0〜100 にたたむ。
 * ダウンロードを前半 50%、変換を後半 50% に割り当てる。
 */
export function combineStagedPercent(stage: 'downloading' | 'converting', percent: number): number {
  const bounded = clampPercent(percent)
  return stage === 'downloading' ? Math.round(bounded / 2) : Math.round(50 + bounded / 2)
}
