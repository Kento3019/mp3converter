import { Hono } from 'hono'
import { z } from 'zod'
import { enqueueYoutube } from '../jobs/runner.js'
import { jobStore } from '../jobs/store.js'
import { toJobView } from '../jobs/types.js'
import { badRequest } from '../lib/errors.js'
import { ok } from '../lib/http.js'
import { DEFAULT_QUALITY, QualitySchema } from '../media/quality.js'
import { parseYoutubeUrl } from '../media/youtube-url.js'

export const youtubeRoutes = new Hono()

const BodySchema = z.object({
  url: z.string().min(1),
  quality: QualitySchema.catch(DEFAULT_QUALITY).default(DEFAULT_QUALITY),
})

/** YouTube のアドレスから音声を取って MP3 にする。 */
youtubeRoutes.post('/', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    throw badRequest('アドレスが読み取れませんでした。', 'もう一度貼り付けてください。')
  }

  // 許可リストを通った URL だけが yt-dlp に渡る。
  const url = parseYoutubeUrl(parsed.data.url)

  const job = jobStore.create({
    kind: 'youtube',
    title: '動画の情報を確認しています…',
    quality: parsed.data.quality,
    sourceUrl: url,
  })
  enqueueYoutube(job.id, url)

  return c.json(ok(toJobView(job)), 202)
})
