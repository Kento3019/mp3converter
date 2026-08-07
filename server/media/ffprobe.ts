import { z } from 'zod'
import { requireBinary } from '../deps/detect.js'
import { AppError, badRequest, internal } from '../lib/errors.js'
import { run } from '../lib/exec.js'

export interface MediaInfo {
  /** 総尺（秒）。取れなければ 0（進捗は不定表示になる）。 */
  durationSec: number
  hasAudio: boolean
  /** ファイルに埋め込まれたタイトル。無ければ null。 */
  title: string | null
}

const ProbeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
      }),
    )
    .default([]),
  format: z
    .object({
      duration: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
})

/**
 * 入力ファイルを実際に解析する。
 * 拡張子は信用しない。音声が入っていなければここで弾く。
 */
export async function probeMedia(path: string): Promise<MediaInfo> {
  const ffprobe = requireBinary('ffprobe')

  const result = await run(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { timeoutMs: 30_000 },
  )

  if (result.code !== 0) {
    throw badRequest(
      'このファイルは読み取れませんでした。',
      '動画または音声のファイルを選んでください。壊れている可能性もあります。',
    )
  }

  const parsed = ProbeSchema.safeParse(safeJsonParse(result.stdout))
  if (!parsed.success) {
    throw internal('ファイルの情報を読み取れませんでした。', 'もう一度お試しください。', parsed.error)
  }

  const hasAudio = parsed.data.streams.some((stream) => stream.codec_type === 'audio')
  if (!hasAudio) {
    throw badRequest('この動画には音声が入っていません。', '音声つきの動画を選んでください。')
  }

  const rawDuration = parsed.data.format?.duration
  const durationSec = rawDuration ? Number.parseFloat(rawDuration) : Number.NaN

  return {
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
    hasAudio,
    title: pickTitle(parsed.data.format?.tags),
  }
}

function pickTitle(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  for (const [key, value] of Object.entries(tags)) {
    if (key.toLowerCase() === 'title' && value.trim()) return value.trim()
  }
  return null
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new AppError({
      status: 500,
      message: 'ファイルの情報を読み取れませんでした。',
      hint: 'もう一度お試しください。',
      cause: error,
    })
  }
}
