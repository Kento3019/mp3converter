import { existsSync } from 'node:fs'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let workDir: string
let outputDir: string
let sweepWorkDir: () => Promise<number>

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mp3conv-work-'))
  outputDir = await mkdtemp(join(tmpdir(), 'mp3conv-out-'))

  // config は読み込み時に env を固めるため、import より先に設定する。
  process.env.WORK_DIR = workDir
  process.env.OUTPUT_DIR = outputDir
  process.env.RETENTION_HOURS = '24'
  process.env.YTDLP_UPDATE_INTERVAL_HOURS = '0'

  const module = await import('../../server/lib/cleanup.js')
  sweepWorkDir = module.sweepWorkDir
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
  await rm(outputDir, { recursive: true, force: true })
})

/** mtime を指定時間だけ過去にずらす。 */
async function ageFile(path: string, hoursAgo: number): Promise<void> {
  const when = new Date(Date.now() - hoursAgo * 60 * 60_000)
  await utimes(path, when, when)
}

describe('sweepWorkDir', () => {
  test('保持期間を過ぎた作業ファイルだけ消す', async () => {
    const old = join(workDir, 'old.upload')
    const fresh = join(workDir, 'fresh.upload')
    await writeFile(old, 'x')
    await writeFile(fresh, 'x')
    await ageFile(old, 48)

    const removed = await sweepWorkDir()

    expect(removed).toBe(1)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })

  test('保存先の MP3 には触れない', async () => {
    const keep = join(outputDir, '大事な曲.mp3')
    await writeFile(keep, 'x')
    await ageFile(keep, 999)

    await sweepWorkDir()

    expect(existsSync(keep)).toBe(true)
  })

  test('消すものが無ければ 0 を返す', async () => {
    await rm(join(workDir, 'fresh.upload'), { force: true })
    expect(await sweepWorkDir()).toBe(0)
  })
})
