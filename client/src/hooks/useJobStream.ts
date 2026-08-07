import { useCallback, useEffect, useRef, useState } from 'react'
import { type JobView, fetchJobs } from '../lib/api.js'

function isRunning(job: JobView): boolean {
  return job.status !== 'done' && job.status !== 'error'
}

/**
 * ジョブ一覧を持ち、進行中のものだけ SSE で追いかける。
 * 完成・失敗を受け取った時点で、その接続は閉じる。
 */
export function useJobStream() {
  const [jobs, setJobs] = useState<JobView[]>([])
  const sources = useRef(new Map<string, EventSource>())

  /** 常に新しい配列を作って差し替える（既存の要素は書き換えない）。 */
  const upsert = useCallback((incoming: JobView) => {
    setJobs((current) => {
      const index = current.findIndex((job) => job.id === incoming.id)
      if (index === -1) return [incoming, ...current]
      const next = [...current]
      next[index] = incoming
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    sources.current.get(id)?.close()
    sources.current.delete(id)
    setJobs((current) => current.filter((job) => job.id !== id))
  }, [])

  const watch = useCallback(
    (job: JobView) => {
      upsert(job)
      if (!isRunning(job) || sources.current.has(job.id)) return

      const source = new EventSource(`/api/jobs/${job.id}/events`)
      sources.current.set(job.id, source)

      const handle = (event: MessageEvent<string>): void => {
        try {
          upsert(JSON.parse(event.data) as JobView)
        } catch {
          // 壊れた 1 件は捨てる。次の更新で追いつく。
        }
      }

      const close = (): void => {
        source.close()
        sources.current.delete(job.id)
      }

      source.addEventListener('progress', handle)
      source.addEventListener('done', (event) => {
        handle(event as MessageEvent<string>)
        close()
      })
      source.addEventListener('error', (event) => {
        const message = event as MessageEvent<string>

        // 本文があればサーバが送った「変換失敗」。これで終わりなので閉じる。
        if (message.data) {
          handle(message)
          close()
          return
        }

        // 本文が無いのは単なる接続断（サーバ再起動など）。
        // ここで close() すると EventSource の自動再接続まで止まり、
        // 進捗バーが固まったまま二度と復帰しなくなる。何もせず任せる。
      })
    },
    [upsert],
  )

  // 起動時に既存のジョブを拾い、進行中のものは購読を再開する。
  useEffect(() => {
    let cancelled = false
    void fetchJobs()
      .then((list) => {
        if (cancelled) return
        setJobs(list)
        for (const job of list) if (isRunning(job)) watch(job)
      })
      .catch(() => undefined)

    const opened = sources.current
    return () => {
      cancelled = true
      for (const source of opened.values()) source.close()
      opened.clear()
    }
  }, [watch])

  return { jobs, watch, remove }
}
