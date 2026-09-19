import type { MiddlewareHandler } from 'hono'
import { config } from '../config.js'
import { forbidden } from './errors.js'

/**
 * 127.0.0.1 にバインドしても、ブラウザの「別タブ」からは同じように叩ける。
 * つまり OS のソケット境界は、同じブラウザ内で動く他人のコードを防がない。
 *
 * 対策を 2 段重ねる。
 *  1) Origin ヘッダが付いていて、かつ自分のものでなければ拒否する。
 *  2) 変更系（POST/DELETE 等）には専用ヘッダを必須にする。
 *     カスタムヘッダは必ずプリフライトを誘発し、本サーバは CORS 許可ヘッダを
 *     一切返さないため、クロスオリジンからの要求は送信前に落ちる。
 *
 * Origin が付かない要求（curl、ランチャの死活監視）は通す。
 * ブラウザはクロスオリジンの fetch に必ず Origin を付けるため、これで塞がる。
 */

export const CLIENT_HEADER = 'x-mp3converter-client'
const CLIENT_HEADER_VALUE = '1'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function buildAllowedOrigins(): ReadonlySet<string> {
  const origins = new Set<string>()
  for (const host of ['127.0.0.1', 'localhost']) {
    origins.add(`http://${host}:${config.port}`)
    // dev では Vite(5173) が画面を出し、そこから /api を叩く。
    if (process.env.NODE_ENV !== 'production') origins.add(`http://${host}:5173`)
  }
  return origins
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

function reject(): never {
  throw forbidden(
    'この操作は許可されていません。',
    'MP3コンバーターの画面（アプリのアイコン）から操作してください。',
  )
}

export const originGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) reject()

  if (MUTATING_METHODS.has(c.req.method) && c.req.header(CLIENT_HEADER) !== CLIENT_HEADER_VALUE) {
    reject()
  }

  await next()
}
