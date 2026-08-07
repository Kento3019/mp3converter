import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { config } from './config.js'
import { describeError, toApiError } from './lib/errors.js'
import { fail } from './lib/http.js'
import { logger } from './lib/logger.js'
import { originGuard } from './lib/origin-guard.js'
import { convertRoutes } from './routes/convert.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { maintenanceRoutes } from './routes/maintenance.js'
import { youtubeRoutes } from './routes/youtube.js'

/** ルート登録済みの Hono アプリを組み立てる。起動処理は index.ts が持つ。 */
export function createApp(): Hono {
  const app = new Hono()

  // 127.0.0.1 バインドは「同じブラウザの別タブ」を防がない。
  // API はすべてここを通し、他サイトからの横入りを塞ぐ。
  app.use('/api/*', originGuard)

  app.route('/api/health', healthRoutes)
  app.route('/api/convert', convertRoutes)
  app.route('/api/youtube', youtubeRoutes)
  app.route('/api/jobs', jobRoutes)
  app.route('/api/maintenance', maintenanceRoutes)

  registerClient(app)

  app.onError((error, c) => {
    const { status, body } = toApiError(error)
    logger.error('リクエスト処理に失敗', describeError(error))
    return c.json(fail(body), status as ContentfulStatusCode)
  })

  return app
}

/**
 * ビルド済み画面の配信。
 * dev では Vite(5173) が画面を出すため、ここが使われるのは本番のみ。
 * 未ビルドのときは「何をすれば直るか」を日本語で返す。
 */
function registerClient(app: Hono): void {
  const indexHtml = join(config.clientDistDir, 'index.html')

  if (!existsSync(indexHtml)) {
    app.get('*', (c) => c.html(notBuiltPage(), 503))
    return
  }

  // serveStatic の root は cwd 起点。区切り文字は posix 形式にそろえる。
  const root = (relative(process.cwd(), config.clientDistDir) || '.').split(sep).join('/')
  app.use('/*', serveStatic({ root }))

  // 画面側のルーティングに任せるためのフォールバック。
  app.get('*', async (c) => c.html(await readFile(indexHtml, 'utf8')))
}

function notBuiltPage(): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>準備中</title></head>
<body style="font-family:system-ui;padding:2rem;line-height:1.8">
<h1>画面がまだ用意できていません</h1>
<p>アプリのインストールが最後まで終わっていない可能性があります。</p>
<p>導入した人に「<code>npm run build</code> を実行してください」と伝えてください。</p>
</body></html>`
}
