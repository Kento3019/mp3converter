import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Hono } from 'hono'
import { config } from '../config.js'
import { enqueueConversion } from '../jobs/runner.js'
import { jobStore } from '../jobs/store.js'
import { toJobView } from '../jobs/types.js'
import { badRequest } from '../lib/errors.js'
import { ok } from '../lib/http.js'
import { ensureDir, safeFilename } from '../lib/paths.js'
import { saveStreamToFile } from '../lib/upload.js'
import { DEFAULT_QUALITY, QualitySchema } from '../media/quality.js'

export const convertRoutes = new Hono()

/**
 * 手元の動画ファイルを MP3 にする。
 * 生ボディを直接受け取る（multipart を使わない）ため、数 GB でもメモリに載らない。
 * 例: POST /api/convert?quality=high&filename=%E5%8B%95%E7%94%BB.mp4
 */
convertRoutes.post('/', async (c) => {
  const quality = QualitySchema.catch(DEFAULT_QUALITY).parse(c.req.query('quality'))
  const originalName = decodeName(c.req.query('filename'))

  const body = c.req.raw.body
  if (!body) {
    throw badRequest('ファイルが読み取れませんでした。', 'もう一度ファイルを選んでください。')
  }

  await ensureDir(config.workDir)
  const uploadPath = join(config.workDir, `${randomUUID()}.upload`)
  const bytes = await saveStreamToFile(body, uploadPath, config.maxUploadBytes)

  if (bytes === 0) {
    throw badRequest('中身が空のファイルです。', '別のファイルを選んでください。')
  }

  const job = jobStore.create({ kind: 'file', title: originalName, quality })
  enqueueConversion({ jobId: job.id, inputPath: uploadPath, desiredName: originalName })

  return c.json(ok(toJobView(job)), 202)
})

/** クエリのファイル名を復号し、表示にもファイル名にも安全な形にする。 */
function decodeName(raw: string | undefined): string {
  if (!raw) return '音声'
  try {
    return safeFilename(decodeURIComponent(raw), '音声')
  } catch {
    return safeFilename(raw, '音声')
  }
}
