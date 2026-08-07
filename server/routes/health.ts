import { Hono } from 'hono'
import { config } from '../config.js'
import { detectDeps } from '../deps/detect.js'
import { ok } from '../lib/http.js'

export const healthRoutes = new Hono()

/**
 * 常駐しているかの確認。ランチャ（.app）がこれを叩いて起動判定する。
 * ついでに保存先を返し、画面が「どこに入るか」を提示できるようにする。
 */
healthRoutes.get('/', (c) =>
  c.json(ok({ status: 'ok' as const, outputDir: config.outputDir })),
)

/**
 * 必要なソフトが揃っているか。
 * 画面の赤帯（DepsBanner）がこれを見て、足りないものと直し方をそのまま表示する。
 */
healthRoutes.get('/deps', async (c) => {
  const refresh = c.req.query('refresh') === '1'
  return c.json(ok(await detectDeps({ refresh })))
})
