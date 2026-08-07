import { badRequest } from '../lib/errors.js'

/**
 * 完全一致で照合するホスト許可リスト。
 * 前方後方一致にすると youtube.com.evil.example や notyoutube.com を通してしまう。
 */
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function reject(): never {
  throw badRequest(
    'YouTube のアドレスではないようです。',
    'ブラウザのアドレス欄をコピーして貼り付けてください（youtube.com か youtu.be で始まります）。',
  )
}

/**
 * 貼り付けられた文字列を検証し、yt-dlp に渡してよい URL だけを返す。
 * ここを通らない文字列は外部プロセスに一切渡らない。
 */
export function parseYoutubeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) reject()

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    reject()
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) reject()
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) reject()

  return url.toString()
}
