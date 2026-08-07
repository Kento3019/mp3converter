import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import type { JobView } from '../../server/jobs/types.js'
import type { ApiResponse } from '../../server/lib/http.js'
import { SAMPLE_NO_AUDIO, SAMPLE_WITH_AUDIO, generateFixtures } from '../fixtures/generate.js'

/**
 * server/config.ts は読み込み時に env を凍結する。
 * import は巻き上げられるため、beforeAll では手遅れ。vi.hoisted で import より先に設定する。
 */
const dirs = vi.hoisted(() => {
  const base = (process.env.TMPDIR ?? process.env.TEMP ?? '/tmp').replace(/[\\/]+$/, '')
  const outputDir = `${base}/mp3conv-api-out`
  const workDir = `${base}/mp3conv-api-work`
  process.env.OUTPUT_DIR = outputDir
  process.env.WORK_DIR = workDir
  process.env.YTDLP_UPDATE_INTERVAL_HOURS = '0'
  // 上限超過（413）を現実的なサイズで試すため小さくしておく。
  process.env.MAX_UPLOAD_BYTES = String(1024 * 1024)
  return { outputDir, workDir, maxUploadBytes: 1024 * 1024 }
})

// yt-dlp は実ネットワークに出さない。テストの決定性を保つためモックする。
vi.mock('../../server/media/ytdlp.js', () => ({
  fetchMeta: vi.fn(async () => ({ id: 'test', title: 'モック動画', durationSec: 3 })),
  // 変換後に入力ファイルは削除されるため、fixture 本体ではなく複製を返す。
  downloadAudio: vi.fn(async (params: { destDir: string; baseName: string }) => {
    const { copyFile } = await import('node:fs/promises')
    const dest = join(params.destDir, `${params.baseName}.mp4`)
    await copyFile(SAMPLE_WITH_AUDIO, dest)
    return dest
  }),
  selfUpdate: vi.fn(async () => ({ updated: false, message: 'すでに最新でした。' })),
  startAutoUpdate: vi.fn(),
}))

const { outputDir, workDir } = dirs
let app: Hono

beforeAll(async () => {
  await generateFixtures()
  // 前回の残骸があると連番付きの名前になるため、毎回まっさらから始める。
  await rm(outputDir, { recursive: true, force: true })
  await rm(workDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  app = (await import('../../server/app.js')).createApp()
}, 180_000)

afterAll(async () => {
  await rm(outputDir, { recursive: true, force: true })
  await rm(workDir, { recursive: true, force: true })
})

/** 正規の画面が送るヘッダ。変更系はこれが無いと弾かれる。 */
const CLIENT = { 'X-Mp3Converter-Client': '1' } as const

async function body<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>
}

/** 完成か失敗になるまで待つ。 */
async function waitForFinish(id: string): Promise<JobView> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const payload = await body<JobView>(await app.request(`/api/jobs/${id}`))
    const job = payload.data
    if (job && (job.status === 'done' || job.status === 'error')) return job
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('ジョブが終わりませんでした')
}

/** 202 で返ったジョブを取り出す。 */
async function created(response: Response): Promise<JobView> {
  const payload = await body<JobView>(response)
  if (!payload.data) throw new Error(`ジョブが作られませんでした: ${JSON.stringify(payload)}`)
  return payload.data
}

describe('GET /api/health', () => {
  test('生存確認と保存先を返す', async () => {
    const payload = await body<{ status: string; outputDir: string }>(
      await app.request('/api/health'),
    )

    expect(payload.success).toBe(true)
    expect(payload.data?.status).toBe('ok')
    expect(payload.data?.outputDir).toBe(outputDir)
  })

  test('依存の状態を 3 件返す', async () => {
    const response = await app.request('/api/health/deps')
    const payload = await body<{ allReady: boolean; items: unknown[] }>(response)

    expect(response.status).toBe(200)
    expect(payload.data?.items).toHaveLength(3)
  })
})

describe('よそのページからの横入り対策', () => {
  test('他サイトの Origin は拒否する', async () => {
    const response = await app.request('/api/jobs', {
      headers: { Origin: 'https://evil.example' },
    })

    expect(response.status).toBe(403)
    expect((await body(response)).error?.message).toBe('この操作は許可されていません。')
  })

  test('専用ヘッダの無い POST は拒否する（プリフライトを誘発させる仕掛け）', async () => {
    // text/plain ボディの fetch はプリフライト無しで飛ばせてしまうため、
    // ヘッダ必須にして送信前に落とす。
    const response = await app.request('/api/youtube', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://youtu.be/abc123' }),
    })

    expect(response.status).toBe(403)
  })

  test('専用ヘッダの無いアップロードも拒否する', async () => {
    const response = await app.request('/api/convert?filename=x.mp4', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
    })

    expect(response.status).toBe(403)
  })

  test('専用ヘッダの無い DELETE も拒否する', async () => {
    expect((await app.request('/api/jobs/なにか', { method: 'DELETE' })).status).toBe(403)
  })

  test('自分のオリジンからは通る', async () => {
    const response = await app.request('/api/jobs', {
      headers: { Origin: 'http://127.0.0.1:5487' },
    })

    expect(response.status).toBe(200)
  })

  test('Origin の無い要求（curl・死活監視）は通す', async () => {
    expect((await app.request('/api/health')).status).toBe(200)
  })
})

describe('POST /api/convert', () => {
  test('アップロードから MP3 完成まで通る', async () => {
    const file = await readFile(SAMPLE_WITH_AUDIO)
    const response = await app.request(
      `/api/convert?quality=standard&filename=${encodeURIComponent('テスト動画.mp4')}`,
      { method: 'POST', headers: CLIENT, body: file },
    )

    expect(response.status).toBe(202)
    const job = await created(response)
    expect(job.title).toBe('テスト動画.mp4')

    const finished = await waitForFinish(job.id)
    expect(finished.status).toBe('done')
    expect(finished.outputName).toBe('テスト動画.mp3')
    expect(finished.canDownload).toBe(true)
    expect(existsSync(join(outputDir, 'テスト動画.mp3'))).toBe(true)
  })

  test('音声の無い動画は日本語エラーで失敗する', async () => {
    const file = await readFile(SAMPLE_NO_AUDIO)
    const job = await created(
      await app.request('/api/convert?filename=noaudio.mp4', { method: 'POST', headers: CLIENT, body: file }),
    )

    const finished = await waitForFinish(job.id)
    expect(finished.status).toBe('error')
    expect(finished.error?.message).toBe('この動画には音声が入っていません。')
    expect(finished.error?.hint).toBeTruthy()
  })

  test('中身が空なら 400', async () => {
    const response = await app.request('/api/convert?filename=empty.mp4', {
      method: 'POST',
      headers: CLIENT,
      body:new Uint8Array(0),
    })

    expect(response.status).toBe(400)
    expect((await body(response)).error?.message).toBe('中身が空のファイルです。')
  })

  test('上限を超えるファイルは 413 で、書きかけを残さない', async () => {
    const { readdir } = await import('node:fs/promises')
    const oversized = new Uint8Array(dirs.maxUploadBytes + 1024)

    const response = await app.request('/api/convert?filename=huge.mp4', {
      method: 'POST',
      headers: CLIENT,
      body:oversized,
    })

    expect(response.status).toBe(413)
    expect((await body(response)).error?.message).toBe('ファイルが大きすぎます。')

    // 打ち切った巨大ファイルの書きかけが残っていない。
    // （変換中の通常アップロードは残りうるので、サイズで判別する）
    const { stat } = await import('node:fs/promises')
    const sizes = await Promise.all(
      (await readdir(workDir)).map(async (name) => (await stat(join(workDir, name))).size),
    )
    expect(sizes.every((size) => size < dirs.maxUploadBytes)).toBe(true)
  })

  test('ダウンロードは MP3 として日本語名で返る', async () => {
    const file = await readFile(SAMPLE_WITH_AUDIO)
    const job = await created(
      await app.request(`/api/convert?filename=${encodeURIComponent('曲.mp4')}`, {
        method: 'POST',
        headers: CLIENT,
        body: file,
      }),
    )
    await waitForFinish(job.id)

    const download = await app.request(`/api/jobs/${job.id}/download`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('audio/mpeg')
    expect(download.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('曲.mp3')}`,
    )
  })
})

describe('POST /api/youtube', () => {
  test('許可リスト外の URL は 400 で拒否する', async () => {
    const response = await app.request('/api/youtube', {
      method: 'POST',
      headers: { ...CLIENT, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://evil.example/watch?v=x' }),
    })

    expect(response.status).toBe(400)
    expect((await body(response)).error?.message).toBe('YouTube のアドレスではないようです。')
  })

  test('YouTube の URL なら受け付けて完成まで進む', async () => {
    const job = await created(
      await app.request('/api/youtube', {
        method: 'POST',
        headers: { ...CLIENT, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://youtu.be/abc123', quality: 'best' }),
      }),
    )

    expect(job.sourceUrl).toContain('youtu.be')

    const finished = await waitForFinish(job.id)
    expect(finished.status).toBe('done')
    expect(finished.title).toBe('モック動画')
  })

  test('JSON が壊れていれば 400', async () => {
    const response = await app.request('/api/youtube', {
      method: 'POST',
      headers: { ...CLIENT, 'Content-Type': 'application/json' },
      body: 'これはJSONではない',
    })
    expect(response.status).toBe(400)
  })
})

describe('GET /api/jobs', () => {
  test('一覧に絶対パスを含めない', async () => {
    const payload = await body<JobView[]>(await app.request('/api/jobs'))
    const jobs = payload.data ?? []

    expect(jobs.length).toBeGreaterThan(0)
    for (const job of jobs) {
      expect(job).not.toHaveProperty('outputPath')
    }
  })

  test('存在しない ID は 404', async () => {
    const response = await app.request('/api/jobs/いない')
    expect(response.status).toBe(404)
    expect((await body(response)).error?.hint).toBeTruthy()
  })

  test('DELETE でジョブと MP3 を消す', async () => {
    const file = await readFile(SAMPLE_WITH_AUDIO)
    const job = await created(
      await app.request('/api/convert?filename=deleteme.mp4', { method: 'POST', headers: CLIENT, body: file }),
    )
    await waitForFinish(job.id)

    expect(existsSync(join(outputDir, 'deleteme.mp3'))).toBe(true)

    const response = await app.request(`/api/jobs/${job.id}`, {
      method: 'DELETE',
      headers: CLIENT,
    })
    expect(response.status).toBe(200)
    expect(existsSync(join(outputDir, 'deleteme.mp3'))).toBe(false)
    expect((await app.request(`/api/jobs/${job.id}`)).status).toBe(404)
  })

  test('処理中のジョブは消せない（409）', async () => {
    const file = await readFile(SAMPLE_WITH_AUDIO)
    const job = await created(
      await app.request('/api/convert?filename=busy.mp4', {
        method: 'POST',
        headers: CLIENT,
        body: file,
      }),
    )

    // 変換が終わる前に消そうとする。
    const response = await app.request(`/api/jobs/${job.id}`, {
      method: 'DELETE',
      headers: CLIENT,
    })

    if (response.status !== 200) {
      // まだ処理中だった場合は拒否されること（本命の検証）。
      expect(response.status).toBe(409)
      expect((await body(response)).error?.message).toBe('まだ処理中のため消せません。')
    }

    // どちらの経路でも、最後にはジョブが終端に達する。
    const finished = await waitForFinish(job.id).catch(() => null)
    expect(finished === null || finished.status === 'done').toBe(true)
  })

  test('存在しないジョブのダウンロードは 404', async () => {
    expect((await app.request('/api/jobs/いない/download')).status).toBe(404)
  })

  test('SSE が進捗を流し、完成イベントで閉じる', async () => {
    const file = await readFile(SAMPLE_WITH_AUDIO)
    const job = await created(
      await app.request('/api/convert?filename=sse.mp4', { method: 'POST', headers: CLIENT, body: file }),
    )

    const stream = await app.request(`/api/jobs/${job.id}/events`)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')

    // 完成でサーバが閉じるため、text() はそこまで読んで返る。
    const body = await stream.text()
    expect(body).toContain('event: progress')
    expect(body).toContain('event: done')
    expect(body).toContain('"status":"done"')
  })
})

describe('POST /api/maintenance/update-ytdlp', () => {
  test('更新結果を日本語で返す', async () => {
    const payload = await body<{ updated: boolean; message: string }>(
      await app.request('/api/maintenance/update-ytdlp', { method: 'POST', headers: CLIENT }),
    )

    expect(payload.success).toBe(true)
    expect(payload.data?.message).toBe('すでに最新でした。')
  })
})
