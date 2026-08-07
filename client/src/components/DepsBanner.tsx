import type { DepsReport } from '../lib/api.js'

interface DepsBannerProps {
  report: DepsReport | null
  onRecheck: () => void
  checking: boolean
}

/**
 * 必要なソフトが足りないときだけ出す赤帯。
 * 「何が足りないか」と「どうすれば直るか」を並べて、利用者が人に伝えられるようにする。
 */
export function DepsBanner({ report, onRecheck, checking }: DepsBannerProps) {
  if (!report || report.allReady) return null

  const missing = report.items.filter((item) => !item.found || item.canEncodeMp3 === false)

  return (
    <div className="deps" role="alert">
      <p className="deps__title">動かすために足りないものがあります</p>
      <ul className="deps__list">
        {missing.map((item) => (
          <li key={item.name} className="deps__item">
            <span className="deps__name">{item.label}</span>
            {item.hint && <span className="deps__hint">{item.hint}</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button button--ghost"
        onClick={onRecheck}
        disabled={checking}
      >
        {checking ? '確認しています…' : 'もう一度確認する'}
      </button>
    </div>
  )
}
