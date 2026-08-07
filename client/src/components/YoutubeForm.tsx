import { useState } from 'react'
import type { Quality } from '../lib/api.js'
import { QualityPicker } from './QualityPicker.js'

interface YoutubeFormProps {
  quality: Quality
  onQualityChange: (quality: Quality) => void
  onSubmit: (url: string) => void
  busy: boolean
}

export function YoutubeForm({ quality, onQualityChange, onSubmit, busy }: YoutubeFormProps) {
  const [url, setUrl] = useState('')

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setUrl('')
  }

  return (
    <section className="panel panel--youtube" aria-labelledby="yt-heading">
      <h2 id="yt-heading" className="panel__title">
        <span className="panel__step">2</span>
        YouTube から作る
      </h2>

      <form className="yt" onSubmit={handleSubmit}>
        <label className="yt__label" htmlFor="yt-url">
          動画のアドレスを貼り付けてください
        </label>
        <div className="yt__row">
          <input
            id="yt-url"
            className="yt__input"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="button button--primary" disabled={busy || !url.trim()}>
            MP3 にする
          </button>
        </div>
      </form>

      <QualityPicker value={quality} onChange={onQualityChange} disabled={busy} />
    </section>
  )
}
