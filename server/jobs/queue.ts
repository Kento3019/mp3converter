import { config } from '../config.js'

type Task = () => void

/**
 * 同時に走る変換の本数を絞る FIFO リミッタ。
 * ffmpeg を無制限に並列起動すると PC が固まるため、既定 2 本に抑える。
 */
export function createLimiter(maxConcurrent: number) {
  let running = 0
  const waiting: Task[] = []

  function next(): void {
    if (running >= maxConcurrent) return
    const task = waiting.shift()
    if (!task) return
    running += 1
    task()
  }

  return function schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        work()
          .then(resolve, reject)
          .finally(() => {
            running -= 1
            next()
          })
      })
      next()
    })
  }
}

/** アプリ全体で共有する変換キュー。 */
export const conversionQueue = createLimiter(config.maxConcurrentJobs)
