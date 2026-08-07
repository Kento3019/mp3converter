import { Hono } from 'hono'
import { detectDeps } from '../deps/detect.js'
import { ok } from '../lib/http.js'
import { selfUpdate } from '../media/ytdlp.js'

export const maintenanceRoutes = new Hono()

/**
 * 画面の［更新して再試行］が押されたときの処理。
 * YouTube 側の仕様変更で壊れても、利用者がターミナルを開かずに直せるようにする。
 */
maintenanceRoutes.post('/update-ytdlp', async (c) => {
  const result = await selfUpdate()
  // 更新でパスやバージョンが変わるため、依存の判定をやり直す。
  await detectDeps({ refresh: true })
  return c.json(ok(result))
})
