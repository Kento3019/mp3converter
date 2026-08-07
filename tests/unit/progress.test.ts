import { describe, expect, test } from 'vitest'
import {
  parseFfmpegProgressLine,
  parseYtdlpPercent,
  percentFromDuration,
} from '../../server/media/progress.js'

describe('parseFfmpegProgressLine', () => {
  test('out_time_us から経過マイクロ秒を取り出す', () => {
    expect(parseFfmpegProgressLine('out_time_us=1500000')).toEqual({ outTimeUs: 1_500_000 })
  })

  test('ffmpeg が N/A を出す序盤は無視する', () => {
    expect(parseFfmpegProgressLine('out_time_us=N/A')).toBeNull()
  })

  test('progress=end で完了を通知する', () => {
    expect(parseFfmpegProgressLine('progress=end')).toEqual({ done: true })
  })

  test('progress=continue は未完了', () => {
    expect(parseFfmpegProgressLine('progress=continue')).toEqual({ done: false })
  })

  test('speed から処理倍率を取り出す', () => {
    expect(parseFfmpegProgressLine('speed=1.5x')).toEqual({ speed: 1.5 })
  })

  test('speed=N/A は無視する', () => {
    expect(parseFfmpegProgressLine('speed=N/A')).toBeNull()
  })

  test('興味のない行と空行は null', () => {
    expect(parseFfmpegProgressLine('bitrate=  32.0kbits/s')).toBeNull()
    expect(parseFfmpegProgressLine('')).toBeNull()
  })

  test('前後の空白があっても読める', () => {
    expect(parseFfmpegProgressLine('  out_time_us=2000000  ')).toEqual({ outTimeUs: 2_000_000 })
  })
})

describe('percentFromDuration', () => {
  test('尺の半分まで進んだら 50', () => {
    expect(percentFromDuration(5_000_000, 10)).toBe(50)
  })

  test('開始直後は 0', () => {
    expect(percentFromDuration(0, 10)).toBe(0)
  })

  test('尺を超えても 100 で頭打ち', () => {
    expect(percentFromDuration(20_000_000, 10)).toBe(100)
  })

  test('尺が 0 や不明でもゼロ除算しない', () => {
    expect(percentFromDuration(5_000_000, 0)).toBe(0)
    expect(percentFromDuration(5_000_000, Number.NaN)).toBe(0)
  })

  test('負の値は 0 に丸める', () => {
    expect(percentFromDuration(-1, 10)).toBe(0)
  })
})

describe('parseYtdlpPercent', () => {
  test('ダウンロード開始行', () => {
    expect(parseYtdlpPercent('[download]   0.0% of   10.00MiB at  1.00MiB/s ETA 00:10')).toBe(0)
  })

  test('途中経過（サイズ推定つき）', () => {
    expect(parseYtdlpPercent('[download]  42.3% of ~ 10.00MiB at    1.00MiB/s ETA 00:05')).toBe(
      42.3,
    )
  })

  test('完了行', () => {
    expect(parseYtdlpPercent('[download] 100% of 10.00MiB in 00:10')).toBe(100)
  })

  test('ダウンロード以外の行は null', () => {
    expect(parseYtdlpPercent('[youtube] abc123: Downloading webpage')).toBeNull()
    expect(parseYtdlpPercent('')).toBeNull()
  })

  test('100 を超える表記は 100 に丸める', () => {
    expect(parseYtdlpPercent('[download] 150.0% of 10.00MiB')).toBe(100)
  })
})
