import { type JobView, downloadUrl } from '../lib/api.js'

interface JobCardProps {
  job: JobView
  onReveal: (job: JobView) => void
  onDelete: (job: JobView) => void
  onRecover: (job: JobView) => void
  recovering: boolean
}

export function JobCard({ job, onReveal, onDelete, onRecover, recovering }: JobCardProps) {
  const running = job.status !== 'done' && job.status !== 'error'
  // 再実行できるのは元の URL が残っている YouTube 経路のみ。
  // ファイル経路はアップロード済みの原本を消しているため、入れ直してもらう。
  const recoverable =
    job.sourceUrl !== null &&
    (job.error?.action === 'update-ytdlp' || job.error?.action === 'retry')

  return (
    <li className="card" data-status={job.status}>
      <div className="card__head">
        <span className="card__kind" aria-hidden="true">
          {job.kind === 'youtube' ? '▶' : '♪'}
        </span>
        <p className="card__title" title={job.title}>
          {job.title}
        </p>
        <span className="card__badge" data-status={job.status}>
          {job.statusLabel}
        </span>
      </div>

      {running && (
        <div className="card__progress">
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={job.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${job.statusLabel} ${job.progress}%`}
          >
            <span className="bar__fill" style={{ transform: `scaleX(${job.progress / 100})` }} />
          </div>
          <span className="card__percent">{job.progress}%</span>
        </div>
      )}

      {job.error && (
        <div className="card__error" role="alert">
          <p className="card__error-message">{job.error.message}</p>
          <p className="card__error-hint">{job.error.hint}</p>
        </div>
      )}

      <div className="card__actions">
        {job.canDownload && (
          <>
            <button type="button" className="button button--primary" onClick={() => onReveal(job)}>
              フォルダを開く
            </button>
            <a className="button button--ghost" href={downloadUrl(job.id)} download>
              保存する
            </a>
          </>
        )}

        {job.error && recoverable && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => onRecover(job)}
            disabled={recovering}
          >
            {recovering ? '更新しています…' : '更新して再試行'}
          </button>
        )}

        {!running && (
          <button type="button" className="button button--quiet" onClick={() => onDelete(job)}>
            消す
          </button>
        )}
      </div>
    </li>
  )
}
