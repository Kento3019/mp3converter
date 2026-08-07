import type { ApiError } from '../lib/http.js'
import type { Quality } from '../media/quality.js'

export type JobKind = 'file' | 'youtube'

/** 画面には日本語 4 段階（準備中 / ダウンロード中 / 変換中 / 完成！）で見せる。 */
export type JobStatus = 'queued' | 'downloading' | 'converting' | 'done' | 'error'

export interface Job {
  readonly id: string
  readonly kind: JobKind
  /** 画面に出す名前。元ファイル名または動画タイトル。 */
  readonly title: string
  readonly status: JobStatus
  /** 0〜100。 */
  readonly progress: number
  readonly quality: Quality
  /** YouTube 経路のみ。失敗時に同じ URL で再実行するために保持する。 */
  readonly sourceUrl: string | null
  /** 完成した MP3 のファイル名（拡張子つき）。 */
  readonly outputName: string | null
  /** 完成した MP3 の絶対パス。サーバ内部でだけ使い、画面には渡さない。 */
  readonly outputPath: string | null
  readonly error: ApiError | null
  readonly createdAt: number
  readonly updatedAt: number
}

/** 画面へ返す形。絶対パスは含めない。 */
export interface JobView {
  id: string
  kind: JobKind
  title: string
  status: JobStatus
  statusLabel: string
  progress: number
  quality: Quality
  sourceUrl: string | null
  outputName: string | null
  canDownload: boolean
  error: ApiError | null
  createdAt: number
  updatedAt: number
}

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: '準備中',
  downloading: 'ダウンロード中',
  converting: '変換中',
  done: '完成！',
  error: '失敗',
}

export function statusLabel(status: JobStatus): string {
  return STATUS_LABELS[status]
}

export function isFinished(status: JobStatus): boolean {
  return status === 'done' || status === 'error'
}

export function toJobView(job: Job): JobView {
  return {
    id: job.id,
    kind: job.kind,
    title: job.title,
    status: job.status,
    statusLabel: statusLabel(job.status),
    progress: job.progress,
    quality: job.quality,
    sourceUrl: job.sourceUrl,
    outputName: job.outputName,
    canDownload: job.status === 'done' && job.outputPath !== null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
