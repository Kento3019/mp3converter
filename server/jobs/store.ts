import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { tooBusy } from '../lib/errors.js'
import type { Quality } from '../media/quality.js'
import { type Job, type JobKind, isFinished } from './types.js'

export interface CreateJobInput {
  kind: JobKind
  title: string
  quality: Quality
  /** YouTube 経路のみ。検証済みの URL を渡す。 */
  sourceUrl?: string
}

/** 古いジョブを無制限に抱えないための上限。超えたら完了済みの古い順に捨てる。 */
const MAX_RETAINED_JOBS = 100

/**
 * 同時に抱える未完了ジョブの上限。
 * キューは 2 本ずつしか処理しないため、際限なく積まれると
 * ディスクと CPU を延々と食い続ける。入口で止める。
 */
const MAX_ACTIVE_JOBS = 20

type Listener = (job: Job) => void

class JobStore {
  private readonly jobs = new Map<string, Job>()
  private readonly emitter = new EventEmitter()

  constructor() {
    // 多数のジョブを同時に購読しても警告が出ないようにする。
    this.emitter.setMaxListeners(0)
  }

  create(input: CreateJobInput): Job {
    if (this.activeCount() >= MAX_ACTIVE_JOBS) {
      throw tooBusy(
        'いま処理待ちが多すぎます。',
        '今の変換が終わってから、もう一度お試しください。',
      )
    }

    const now = Date.now()
    const job: Job = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      status: 'queued',
      progress: 0,
      quality: input.quality,
      sourceUrl: input.sourceUrl ?? null,
      outputName: null,
      outputPath: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(job.id, job)
    this.evictIfNeeded()
    this.emitter.emit(job.id, job)
    return job
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  /** 新しい順。 */
  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 既存の Job は変更せず、新しいオブジェクトに差し替える。
   * 購読者には差し替え後の Job を渡す。
   */
  update(id: string, patch: Partial<Omit<Job, 'id' | 'createdAt'>>): Job | undefined {
    const current = this.jobs.get(id)
    if (!current) return undefined

    const next: Job = { ...current, ...patch, updatedAt: Date.now() }
    this.jobs.set(id, next)
    this.emitter.emit(id, next)
    return next
  }

  remove(id: string): Job | undefined {
    const job = this.jobs.get(id)
    if (!job) return undefined
    this.jobs.delete(id)
    return job
  }

  /** 戻り値を呼ぶと購読を解除する。 */
  subscribe(id: string, listener: Listener): () => void {
    this.emitter.on(id, listener)
    return () => {
      this.emitter.off(id, listener)
    }
  }

  /** テスト用。 */
  clear(): void {
    this.jobs.clear()
  }

  /** まだ終わっていないジョブの数。 */
  activeCount(): number {
    let count = 0
    for (const job of this.jobs.values()) if (!isFinished(job.status)) count += 1
    return count
  }

  private evictIfNeeded(): void {
    if (this.jobs.size <= MAX_RETAINED_JOBS) return
    const finished = [...this.jobs.values()]
      .filter((job) => job.status === 'done' || job.status === 'error')
      .sort((a, b) => a.createdAt - b.createdAt)

    for (const job of finished) {
      if (this.jobs.size <= MAX_RETAINED_JOBS) break
      this.jobs.delete(job.id)
    }
  }
}

export const jobStore = new JobStore()
