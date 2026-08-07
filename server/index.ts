import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config } from './config.js'
import { startCleanupSchedule } from './lib/cleanup.js'
import { logger } from './lib/logger.js'
import { ensureDir } from './lib/paths.js'
import { startAutoUpdate } from './media/ytdlp.js'

await start()

async function start(): Promise<void> {
  await ensureDir(config.outputDir)
  await ensureDir(config.workDir)

  const app = createApp()

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    logger.info(`起動しました http://${config.host}:${info.port}`)
    logger.info(`MP3 の保存先: ${config.outputDir}`)
  })

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        `ポート ${config.port} が既に使われています。` +
          'アプリが二重に起動している可能性があります。' +
          '一度アプリを終了するか、.env の PORT を別の番号に変えてください。',
      )
      process.exit(1)
    }
    logger.error('サーバでエラーが発生', error)
    process.exit(1)
  })

  // YouTube 側の変更に追随するため、起動時と 24 時間ごとに yt-dlp を更新する。
  startAutoUpdate()
  // 作業用の一時ファイルだけを定期的に掃除する（保存先の MP3 には触れない）。
  startCleanupSchedule()

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info(`${signal} を受信。終了します。`)
      server.close(() => process.exit(0))
    })
  }
}
