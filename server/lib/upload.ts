import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tooLarge } from './errors.js'

class UploadTooLargeError extends Error {
  constructor() {
    super('upload exceeds limit')
    this.name = 'UploadTooLargeError'
  }
}

/**
 * リクエストのボディをそのままファイルへ流す。
 * multipart を経由せず生ボディを受けることで、数 GB の動画でもメモリに載せずに済む。
 * 上限を超えた時点で打ち切り、書きかけのファイルを消す。
 */
export async function saveStreamToFile(
  body: ReadableStream<Uint8Array>,
  destination: string,
  maxBytes: number,
): Promise<number> {
  let written = 0

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength
      if (written > maxBytes) {
        controller.error(new UploadTooLargeError())
        return
      }
      controller.enqueue(chunk)
    },
  })

  try {
    await pipeline(
      Readable.fromWeb(body.pipeThrough(counter) as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(destination),
    )
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined)
    if (error instanceof UploadTooLargeError || isTooLarge(error)) {
      throw tooLarge(
        'ファイルが大きすぎます。',
        `${Math.floor(maxBytes / 1024 ** 3)}GB までのファイルを選んでください。`,
      )
    }
    throw error
  }

  return written
}

/** TransformStream の controller.error は cause 経由で伝わることがある。 */
function isTooLarge(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof UploadTooLargeError
}
