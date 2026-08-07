import { useRef, useState } from 'react'
import type { Quality } from '../lib/api.js'
import { QualityPicker } from './QualityPicker.js'

interface FileDropZoneProps {
  quality: Quality
  onQualityChange: (quality: Quality) => void
  onFiles: (files: File[]) => void
  busy: boolean
}

const ACCEPT = '.mp4,.mov,.m4v,.mkv,.webm,.avi,.wmv,.flv,.m4a,.aac,.wav,.mp3,video/*,audio/*'

export function FileDropZone({ quality, onQualityChange, onFiles, busy }: FileDropZoneProps) {
  const [hovering, setHovering] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault()
    setHovering(false)
    const files = [...event.dataTransfer.files]
    if (files.length > 0) onFiles(files)
  }

  return (
    <section className="panel panel--drop" aria-labelledby="drop-heading">
      <h2 id="drop-heading" className="panel__title">
        <span className="panel__step">1</span>
        動画ファイルから作る
      </h2>

      <button
        type="button"
        className="dropzone"
        data-hovering={hovering}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setHovering(true)
        }}
        onDragLeave={() => setHovering(false)}
        onDrop={handleDrop}
      >
        <span className="dropzone__icon" aria-hidden="true">
          ♪
        </span>
        <span className="dropzone__main">ここに動画をドラッグ</span>
        <span className="dropzone__sub">クリックしてファイルを選ぶこともできます</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        accept={ACCEPT}
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) onFiles(files)
          event.target.value = ''
        }}
      />

      <QualityPicker value={quality} onChange={onQualityChange} disabled={busy} />
    </section>
  )
}
