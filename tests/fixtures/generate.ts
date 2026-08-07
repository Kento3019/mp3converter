import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBinary } from '../../server/deps/detect.js'
import { run } from '../../server/lib/exec.js'

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url))

/** 音声つきの 3 秒動画。通常経路のテストに使う。 */
export const SAMPLE_WITH_AUDIO = join(FIXTURE_DIR, 'sample.mp4')

/** 音声が入っていない 2 秒動画。異常系（400）のテストに使う。 */
export const SAMPLE_NO_AUDIO = join(FIXTURE_DIR, 'no-audio.mp4')

export const SAMPLE_DURATION_SEC = 3

/**
 * ffmpeg の合成ソース（lavfi）でテスト素材を作る。
 * 実在の音源・動画を持ち込まないので、著作物をリポジトリに入れずに済む。
 */
export async function generateFixtures(): Promise<void> {
  const ffmpeg = resolveBinary('ffmpeg')
  if (!ffmpeg) throw new Error('ffmpeg が見つかりません。npm run doctor で確認してください。')

  await mkdir(FIXTURE_DIR, { recursive: true })

  if (!existsSync(SAMPLE_WITH_AUDIO)) {
    await runOrThrow(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=320x240:rate=15:duration=${SAMPLE_DURATION_SEC}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${SAMPLE_DURATION_SEC}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-shortest',
      '-metadata',
      'title=テスト素材',
      SAMPLE_WITH_AUDIO,
    ])
  }

  if (!existsSync(SAMPLE_NO_AUDIO)) {
    await runOrThrow(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=15:duration=2',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-an',
      SAMPLE_NO_AUDIO,
    ])
  }
}

async function runOrThrow(cmd: string, args: string[]): Promise<void> {
  const result = await run(cmd, args, { timeoutMs: 120_000 })
  if (result.code !== 0) {
    throw new Error(`テスト素材の生成に失敗しました (exit ${result.code})\n${result.stderr}`)
  }
}

// npm run test:fixtures から直接実行されたときだけ走らせる。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateFixtures()
  process.stdout.write(`テスト素材を作成しました: ${FIXTURE_DIR}\n`)
}
