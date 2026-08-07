import { beforeEach, describe, expect, test, vi } from 'vitest'
import { jobStore } from '../../server/jobs/store.js'
import { isFinished, statusLabel, toJobView } from '../../server/jobs/types.js'

beforeEach(() => {
  jobStore.clear()
})

describe('jobStore', () => {
  test('作成直後は準備中で進捗 0', () => {
    const job = jobStore.create({ kind: 'file', title: '動画.mp4', quality: 'high' })

    expect(job.status).toBe('queued')
    expect(job.progress).toBe(0)
    expect(job.outputPath).toBeNull()
    expect(job.error).toBeNull()
  })

  test('update は既存オブジェクトを書き換えず新しい物を返す', () => {
    const original = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    const updated = jobStore.update(original.id, { progress: 42 })

    expect(updated).not.toBe(original)
    expect(updated?.progress).toBe(42)
    // 元のオブジェクトは変わっていない。
    expect(original.progress).toBe(0)
  })

  test('存在しない ID の更新は undefined', () => {
    expect(jobStore.update('いない', { progress: 1 })).toBeUndefined()
  })

  test('購読者に更新後のジョブが届く', () => {
    const job = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    const listener = vi.fn()
    const unsubscribe = jobStore.subscribe(job.id, listener)

    jobStore.update(job.id, { status: 'converting', progress: 10 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ status: 'converting', progress: 10 })

    unsubscribe()
    jobStore.update(job.id, { progress: 20 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('一覧は新しい順', async () => {
    const first = jobStore.create({ kind: 'file', title: '1', quality: 'high' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = jobStore.create({ kind: 'file', title: '2', quality: 'high' })

    expect(jobStore.list().map((job) => job.id)).toEqual([second.id, first.id])
  })

  test('削除したジョブは取得できない', () => {
    const job = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    expect(jobStore.remove(job.id)?.id).toBe(job.id)
    expect(jobStore.get(job.id)).toBeUndefined()
  })

  test('YouTube 経路は元 URL を保持する', () => {
    const job = jobStore.create({
      kind: 'youtube',
      title: 'a',
      quality: 'best',
      sourceUrl: 'https://youtu.be/abc',
    })
    expect(job.sourceUrl).toBe('https://youtu.be/abc')
  })
})

describe('toJobView', () => {
  test('絶対パスを画面へ渡さない', () => {
    const job = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    const done = jobStore.update(job.id, {
      status: 'done',
      outputPath: '/Users/someone/Music/a.mp3',
      outputName: 'a.mp3',
    })
    expect(done).toBeDefined()

    const view = toJobView(done as NonNullable<typeof done>) as unknown as Record<string, unknown>
    expect(view.outputPath).toBeUndefined()
    expect(view.outputName).toBe('a.mp3')
    expect(view.canDownload).toBe(true)
  })

  test('未完了ならダウンロード不可', () => {
    const job = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    expect(toJobView(job).canDownload).toBe(false)
  })

  test('状態は日本語ラベルを伴う', () => {
    const job = jobStore.create({ kind: 'file', title: 'a', quality: 'high' })
    expect(toJobView(job).statusLabel).toBe('準備中')
  })
})

describe('statusLabel / isFinished', () => {
  test('4 段階 + 失敗の日本語ラベル', () => {
    expect(statusLabel('queued')).toBe('準備中')
    expect(statusLabel('downloading')).toBe('ダウンロード中')
    expect(statusLabel('converting')).toBe('変換中')
    expect(statusLabel('done')).toBe('完成！')
    expect(statusLabel('error')).toBe('失敗')
  })

  test('完成と失敗だけが終了状態', () => {
    expect(isFinished('done')).toBe(true)
    expect(isFinished('error')).toBe(true)
    expect(isFinished('converting')).toBe(false)
    expect(isFinished('queued')).toBe(false)
  })
})
