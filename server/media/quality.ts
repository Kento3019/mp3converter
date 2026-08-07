import { z } from 'zod'

/**
 * 画面に「ビットレート」という語を出さないための対応表。
 * 利用者は 3 択から選ぶだけで、kbps を意識しない。
 */
export const QualitySchema = z.enum(['standard', 'high', 'best'])
export type Quality = z.infer<typeof QualitySchema>

const BITRATES: Record<Quality, string> = {
  standard: '192k',
  high: '256k',
  best: '320k',
}

const LABELS: Record<Quality, string> = {
  standard: '標準',
  high: '高音質',
  best: '最高音質',
}

export function bitrateFor(quality: Quality): string {
  return BITRATES[quality]
}

export function qualityLabel(quality: Quality): string {
  return LABELS[quality]
}

export const DEFAULT_QUALITY: Quality = 'high'
