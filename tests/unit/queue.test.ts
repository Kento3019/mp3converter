import { describe, expect, test } from 'vitest'
import { createLimiter } from '../../server/jobs/queue.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createLimiter', () => {
  test('同時に走る本数を上限以下に保つ', async () => {
    const limit = createLimiter(2)
    let running = 0
    let peak = 0

    const tasks = Array.from({ length: 6 }, () =>
      limit(async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 10))
        running -= 1
      }),
    )

    await Promise.all(tasks)
    expect(peak).toBe(2)
    expect(running).toBe(0)
  })

  test('先に積んだものから走る', async () => {
    const limit = createLimiter(1)
    const order: number[] = []

    await Promise.all(
      [1, 2, 3].map((n) =>
        limit(async () => {
          order.push(n)
        }),
      ),
    )

    expect(order).toEqual([1, 2, 3])
  })

  test('1 本が失敗しても後続は詰まらない', async () => {
    const limit = createLimiter(1)

    await expect(
      limit(async () => {
        throw new Error('失敗')
      }),
    ).rejects.toThrow('失敗')

    await expect(limit(async () => 'ok')).resolves.toBe('ok')
  })

  test('上限に達している間は待たされる', async () => {
    const limit = createLimiter(1)
    const gate = deferred<void>()
    let secondStarted = false

    const first = limit(async () => {
      await gate.promise
    })
    const second = limit(async () => {
      secondStarted = true
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(secondStarted).toBe(false)

    gate.resolve()
    await Promise.all([first, second])
    expect(secondStarted).toBe(true)
  })

  test('戻り値がそのまま返る', async () => {
    const limit = createLimiter(3)
    await expect(limit(async () => 123)).resolves.toBe(123)
  })
})
