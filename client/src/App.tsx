import { useCallback, useEffect, useState } from 'react'
import { DepsBanner } from './components/DepsBanner.js'
import { FileDropZone } from './components/FileDropZone.js'
import { JobList } from './components/JobList.js'
import { YoutubeForm } from './components/YoutubeForm.js'
import { useJobStream } from './hooks/useJobStream.js'
import {
  type ApiError,
  type DepsReport,
  type JobView,
  type Quality,
  deleteJob,
  fetchDeps,
  fetchHealth,
  revealJob,
  submitYoutube,
  toDisplayError,
  updateYtdlp,
  uploadFile,
} from './lib/api.js'

export function App() {
  const { jobs, watch, remove } = useJobStream()
  const [quality, setQuality] = useState<Quality>('high')
  const [deps, setDeps] = useState<DepsReport | null>(null)
  const [checkingDeps, setCheckingDeps] = useState(false)
  const [outputDir, setOutputDir] = useState('')
  const [notice, setNotice] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)

  const refreshDeps = useCallback(async (refresh: boolean) => {
    setCheckingDeps(true)
    try {
      setDeps(await fetchDeps(refresh))
    } catch {
      // 依存チェックの失敗自体は致命的ではない。赤帯を出さないだけ。
    } finally {
      setCheckingDeps(false)
    }
  }, [])

  useEffect(() => {
    void refreshDeps(false)
    void fetchHealth()
      .then((info) => setOutputDir(info.outputDir))
      .catch(() => undefined)
  }, [refreshDeps])

  async function handleFiles(files: File[]): Promise<void> {
    setBusy(true)
    setNotice(null)
    // 意図的に 1 本ずつ送る。数 GB の動画を並列アップロードすると
    // ディスク I/O を食い合って全体が遅くなる。Promise.all にしないこと。
    for (const file of files) {
      try {
        watch(await uploadFile(file, quality))
      } catch (error) {
        setNotice(toDisplayError(error))
      }
    }
    setBusy(false)
  }

  async function handleYoutube(url: string): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      watch(await submitYoutube(url, quality))
    } catch (error) {
      setNotice(toDisplayError(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleReveal(job: JobView): Promise<void> {
    try {
      await revealJob(job.id)
    } catch (error) {
      setNotice(toDisplayError(error))
    }
  }

  async function handleDelete(job: JobView): Promise<void> {
    try {
      await deleteJob(job.id)
      remove(job.id)
    } catch (error) {
      setNotice(toDisplayError(error))
    }
  }

  /** YouTube 取得ソフトを更新してから、同じ URL でもう一度やり直す。 */
  async function handleRecover(job: JobView): Promise<void> {
    if (!job.sourceUrl) return
    setRecoveringId(job.id)
    setNotice(null)
    try {
      const result = await updateYtdlp()
      await refreshDeps(true)
      watch(await submitYoutube(job.sourceUrl, job.quality))
      await deleteJob(job.id).catch(() => undefined)
      remove(job.id)
      setNotice({ message: result.message, hint: 'もう一度取得を始めました。' })
    } catch (error) {
      setNotice(toDisplayError(error))
    } finally {
      setRecoveringId(null)
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="hero__eyebrow">音だけ取り出す道具</p>
        <h1 className="hero__title">MP3コンバーター</h1>
        <p className="hero__lead">
          動画ファイルを入れるか、YouTube のアドレスを貼るだけ。MP3 ができます。
        </p>
      </header>

      <DepsBanner report={deps} onRecheck={() => void refreshDeps(true)} checking={checkingDeps} />

      {notice && (
        <div className="notice" role="status">
          <p className="notice__message">{notice.message}</p>
          <p className="notice__hint">{notice.hint}</p>
          <button type="button" className="notice__close" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </div>
      )}

      <div className="panels">
        <FileDropZone
          quality={quality}
          onQualityChange={setQuality}
          onFiles={(files) => void handleFiles(files)}
          busy={busy}
        />
        <YoutubeForm
          quality={quality}
          onQualityChange={setQuality}
          onSubmit={(url) => void handleYoutube(url)}
          busy={busy}
        />
      </div>

      <JobList
        jobs={jobs}
        outputDir={outputDir}
        onReveal={(job) => void handleReveal(job)}
        onDelete={(job) => void handleDelete(job)}
        onRecover={(job) => void handleRecover(job)}
        recoveringId={recoveringId}
      />

      <footer className="foot">
        <p>この画面はこのパソコンの中だけで動いています。外部には何も送っていません。</p>
      </footer>
    </div>
  )
}
