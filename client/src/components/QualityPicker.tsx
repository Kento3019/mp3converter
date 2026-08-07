import type { Quality } from '../lib/api.js'

interface QualityPickerProps {
  value: Quality
  onChange: (quality: Quality) => void
  disabled?: boolean
}

const OPTIONS: ReadonlyArray<{ value: Quality; label: string; note: string }> = [
  { value: 'standard', label: '標準', note: 'ファイルが小さい' },
  { value: 'high', label: '高音質', note: 'おすすめ' },
  { value: 'best', label: '最高音質', note: 'ファイルが大きい' },
]

/** 「ビットレート」という語を出さずに音質を選ばせるための 3 択。 */
export function QualityPicker({ value, onChange, disabled = false }: QualityPickerProps) {
  return (
    <fieldset className="quality" disabled={disabled}>
      <legend className="quality__legend">音質</legend>
      <div className="quality__options" role="radiogroup" aria-label="音質">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="quality__option"
            data-selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="quality__label">{option.label}</span>
            <span className="quality__note">{option.note}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
