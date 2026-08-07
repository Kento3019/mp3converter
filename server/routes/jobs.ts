import { createReadStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { config } from '../config.js'
import { jobStore } from '../jobs/store.js'
import { type Job, isFinished, toJobView } from '../jobs/types.js'
import { conflict, notFound } from '../lib/errors.js'
import { ok } from '../lib/http.js'
import { isInside } from '../lib/paths.js'
import { revealInFileManager } from '../lib/reveal.js'

export const jobRoutes = new Hono()

/** 接続を維持するためのハートビート間隔。 */
const SSE_PING_MS = 15_000

jobRoutes.get('/', (c) => c.json(ok(jobStore.list().map(toJobView))))

jobRoutes.get('/:id', (c) => c.json(ok(toJobView(mustGet(c.req.param('id'))))))

/**
 * 進捗のリアルタイム配信。
 * 完成・失敗のどちらかに達したらイベントを送って閉じる。
 */
jobRoutes.get('/:id/events', (c) => {
  const job = mustGet(c.req.param('id'))

  return streamSSE(c, async (stream) => {
    const pending: Job[] = [job]
    let wake: (() => void) | null = null
    let closed = false

    const wakeUp = (): void => {
      wake?.()
      wake = null
    }

    const unsubscribe = jobStore.subscribe(job.id, (updated) => {
      pending.push(updated)
      wakeUp()
    })

    stream.onAbort(() => {
      closed = true
      wakeUp()
    })

    try {
      while (!closed) {
        // 切断後に書き込もうとしないよう closed も見る。
        while (!closed && pending.length > 0) {
          const current = pending.shift()
          if (!current) break
          await stream.writeSSE({
            event: eventNameFor(current),
            data: JSON.stringify(toJobView(current)),
          })
          if (isFinished(current.status)) return
        }

        // 更新が来るか、ping の時間が来るまで待つ。
        await new Promise<void>((resolve) => {
          wake = resolve
          setTimeout(resolve, SSE_PING_MS).unref?.()
        })
        if (!closed && pending.length === 0) await stream.writeSSE({ event: 'ping', data: '' })
      }
    } finally {
      unsubscribe()
    }
  })
})

/** ブラウザに保存させたいときの副動線。主動線は「フォルダを開く」。 */
jobRoutes.get('/:id/download', async (c) => {
  const job = mustGet(c.req.param('id'))
  const path = mustHaveOutput(job)
  const info = await stat(path)

  const filename = job.outputName ?? 'audio.mp3'
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(info.size),
      'Content-Disposition': contentDisposition(filename),
    },
  })
})

/** 完成後の主動線。Finder / エクスプローラで保存先を開く。 */
jobRoutes.post('/:id/reveal', async (c) => {
  const job = mustGet(c.req.param('id'))
  await revealInFileManager(mustHaveOutput(job))
  return c.json(ok({ revealed: true }))
})

jobRoutes.delete('/:id', async (c) => {
  const job = mustGet(c.req.param('id'))

  // 実行中に消すと ffmpeg / yt-dlp が止まらないまま行き場を失い、
  // 出力が孤児ファイルになり、SSE も閉じられなくなる。終わるまで待たせる。
  if (!isFinished(job.status)) {
    throw conflict(
      'まだ処理中のため消せません。',
      '「完成！」か「失敗」になってから消してください。',
    )
  }

  if (job.outputPath && isInside(config.outputDir, job.outputPath)) {
    await rm(job.outputPath, { force: true }).catch(() => undefined)
  }
  jobStore.remove(job.id)
  return c.json(ok({ deleted: true }))
})

function mustGet(id: string): Job {
  const job = jobStore.get(id)
  if (!job) {
    throw notFound(
      'この項目は見つかりませんでした。',
      'アプリを再起動すると一覧は消えます。もう一度変換してください。',
    )
  }
  return job
}

function mustHaveOutput(job: Job): string {
  if (job.status !== 'done' || !job.outputPath || !isInside(config.outputDir, job.outputPath)) {
    throw notFound('まだファイルができていません。', '変換が終わるまでお待ちください。')
  }
  return job.outputPath
}

function eventNameFor(job: Job): string {
  if (job.status === 'done') return 'done'
  if (job.status === 'error') return 'error'
  return 'progress'
}

/** 日本語ファイル名でも壊れないよう RFC 5987 形式を併記する。 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
