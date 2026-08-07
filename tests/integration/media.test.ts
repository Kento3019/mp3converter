import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { resolveBinary } from '../../server/deps/detect.js'
import { AppError } from '../../server/lib/errors.js'
import { run } from '../../server/lib/exec.js'
import { toMp3 } from '../../server/media/ffmpeg.js'
import { probeMedia } from '../../server/media/ffprobe.js'
import {
  SAMPLE_DURATION_SEC,
  SAMPLE_NO_AUDIO,
  SAMPLE_WITH_AUDIO,
  generateFixtures,
} from '../fixtures/generate.js'

let workDir: string

beforeAll(async () => {
  await generateFixtures()
  workDir = await mkdtemp(join(tmpdir(), 'mp3conv-test-'))
}, 180_000)

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

describe('probeMedia', () => {
  test('音声つき動画から尺とタイトルを読み取る', async () => {
    const info = await probeMedia(SAMPLE_WITH_AUDIO)

    expect(info.hasAudio).toBe(true)
    expect(info.durationSec).toBeGreaterThan(SAMPLE_DURATION_SEC - 0.5)
    expect(info.durationSec).toBeLessThan(SAMPLE_DURATION_SEC + 0.5)
    expect(info.title).toBe('テスト素材')
  })

  test('音声の無い動画は日本語エラーで弾く', async () => {
    await expect(probeMedia(SAMPLE_NO_AUDIO)).rejects.toThrow(AppError)
    await expect(probeMedia(SAMPLE_NO_AUDIO)).rejects.toMatchObject({
      status: 400,
      userMessage: 'この動画には音声が入っていません。',
    })
  })

  test('存在しないファイルは日本語エラーで弾く', async () => {
    await expect(probeMedia(join(workDir, 'いない.mp4'))).rejects.toMatchObject({ status: 400 })
  })
})

describe('toMp3', () => {
  test('MP4 を MP3 に変換し、進捗が 100 まで届く', async () => {
    const output = join(workDir, 'out.mp3')
    const seen: number[] = []

    await toMp3({
      input: SAMPLE_WITH_AUDIO,
      output,
      quality: 'high',
      durationSec: SAMPLE_DURATION_SEC,
      title: 'テスト素材',
      onPercent: (percent) => seen.push(percent),
    })

    // 出力が本当に MP3 で、尺が元と一致するかを ffprobe で検証する。
    const probe = await probeOutput(output)
    expect(probe.codec).toBe('mp3')
    expect(probe.durationSec).toBeGreaterThan(SAMPLE_DURATION_SEC - 0.5)
    expect(probe.durationSec).toBeLessThan(SAMPLE_DURATION_SEC + 0.5)

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toBe(100)
    // 進捗は後戻りしない。
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  test('音質の指定がビットレートに反映される', async () => {
    const output = join(workDir, 'best.mp3')

    await toMp3({
      input: SAMPLE_WITH_AUDIO,
      output,
      quality: 'best',
      durationSec: SAMPLE_DURATION_SEC,
    })

    const probe = await probeOutput(output)
    // 320k 指定。実測はわずかに前後するため範囲で見る。
    expect(probe.bitRate).toBeGreaterThan(280_000)
  })

  test('壊れた入力は日本語エラーになる', async () => {
    await expect(
      toMp3({
        input: join(workDir, 'ない.mp4'),
        output: join(workDir, 'ng.mp3'),
        quality: 'standard',
        durationSec: 1,
      }),
    ).rejects.toMatchObject({ status: 500, userMessage: '変換に失敗しました。' })
  })
})

interface OutputProbe {
  codec: string
  durationSec: number
  bitRate: number
}

async function probeOutput(path: string): Promise<OutputProbe> {
  const ffprobe = resolveBinary('ffprobe')
  if (!ffprobe) throw new Error('ffprobe が見つかりません')

  const result = await run(ffprobe, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path,
  ])

  const parsed = JSON.parse(result.stdout) as {
    streams?: Array<{ codec_name?: string; codec_type?: string }>
    format?: { duration?: string; bit_rate?: string }
  }

  const audio = parsed.streams?.find((s) => s.codec_type === 'audio')
  return {
    codec: audio?.codec_name ?? '',
    durationSec: Number.parseFloat(parsed.format?.duration ?? '0'),
    bitRate: Number.parseInt(parsed.format?.bit_rate ?? '0', 10),
  }
}
