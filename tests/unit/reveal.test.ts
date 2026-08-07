import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

/** config は読み込み時に env を凍結するため、import より先に設定する。 */
const dirs = vi.hoisted(() => {
  const base = (process.env.TMPDIR ?? process.env.TEMP ?? '/tmp').replace(/[\\/]+$/, '')
  const outputDir = `${base}/mp3conv-reveal-out`
  process.env.OUTPUT_DIR = outputDir
  process.env.WORK_DIR = `${base}/mp3conv-reveal-work`
  return { outputDir, base }
})

let revealInFileManager: (path: string) => Promise<void>

beforeAll(async () => {
  await mkdir(dirs.outputDir, { recursive: true })
  const module = await import('../../server/lib/reveal.js')
  revealInFileManager = module.revealInFileManager
})

afterAll(async () => {
  await rm(dirs.outputDir, { recursive: true, force: true })
})

/**
 * 成功経路は実際に Finder / エクスプローラの窓が開いてしまうため検証しない。
 * ここで守りたいのは「保存先の外を開かせない」という境界だけ。
 */
describe('revealInFileManager の境界', () => {
  test('保存先の外のパスは拒否する', async () => {
    await expect(revealInFileManager(join(dirs.base, 'よそのファイル.mp3'))).rejects.toMatchObject({
      status: 404,
    })
  })

  test('.. で外へ抜けようとしても拒否する', async () => {
    const escape = join(dirs.outputDir, '..', 'そと.mp3')
    await expect(revealInFileManager(escape)).rejects.toMatchObject({ status: 404 })
  })

  test('保存先の中でも存在しないファイルは拒否する', async () => {
    await expect(revealInFileManager(join(dirs.outputDir, 'ない.mp3'))).rejects.toMatchObject({
      status: 404,
    })
  })

  test('拒否時のメッセージは日本語で対処を示す', async () => {
    await writeFile(join(dirs.outputDir, 'ある.mp3'), 'x')
    try {
      await revealInFileManager(join(dirs.base, 'そと.mp3'))
      throw new Error('例外が飛ばなかった')
    } catch (error) {
      expect(error).toMatchObject({
        userMessage: 'ファイルが見つかりませんでした。',
      })
      expect((error as { hint: string }).hint.length).toBeGreaterThan(0)
    }
  })
})
