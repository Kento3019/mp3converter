import type { JobView } from '../lib/api.js'
import { JobCard } from './JobCard.js'

interface JobListProps {
  jobs: JobView[]
  outputDir: string
  onReveal: (job: JobView) => void
  onDelete: (job: JobView) => void
  onRecover: (job: JobView) => void
  recoveringId: string | null
}

export function JobList({
  jobs,
  outputDir,
  onReveal,
  onDelete,
  onRecover,
  recoveringId,
}: JobListProps) {
  return (
    <section className="jobs" aria-labelledby="jobs-heading">
      <div className="jobs__head">
        <h2 id="jobs-heading" className="jobs__title">
          変換したもの
        </h2>
        {outputDir && <p className="jobs__where">保存先: {outputDir}</p>}
      </div>

      {jobs.length === 0 ? (
        <p className="jobs__empty">
          まだ何もありません。上から動画を入れるか、YouTube のアドレスを貼ってください。
        </p>
      ) : (
        <ul className="jobs__list">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onReveal={onReveal}
              onDelete={onDelete}
              onRecover={onRecover}
              recovering={recoveringId === job.id}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
