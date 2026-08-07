import { describe, expect, test } from 'vitest'
import { resolveBinary } from '../../server/deps/detect.js'
import { depFixHint, depLabel, depPurpose } from '../../server/deps/messages.js'
import {
  AppError,
  badRequest,
  describeError,
  notFound,
  toApiError,
} from '../../server/lib/errors.js'
import { fail, ok } from '../../server/lib/http.js'
import {
  DEFAULT_QUALITY,
  QualitySchema,
  bitrateFor,
  qualityLabel,
} from '../../server/media/quality.js'

describe('quality', () => {
  test('3 択がビットレートに対応する', () => {
    expect(bitrateFor('standard')).toBe('192k')
    expect(bitrateFor('high')).toBe('256k')
    expect(bitrateFor('best')).toBe('320k')
  })

  test('画面に出すのは日本語ラベル', () => {
    expect(qualityLabel('standard')).toBe('標準')
    expect(qualityLabel('high')).toBe('高音質')
    expect(qualityLabel('best')).toBe('最高音質')
  })

  test('未知の値は既定に落とす', () => {
    expect(QualitySchema.catch(DEFAULT_QUALITY).parse('でたらめ')).toBe('high')
    expect(QualitySchema.catch(DEFAULT_QUALITY).parse(undefined)).toBe('high')
  })

  test('正しい値はそのまま通る', () => {
    expect(QualitySchema.parse('best')).toBe('best')
  })
})

describe('errors', () => {
  test('AppError は日本語の 3 点セットを持つ', () => {
    const error = badRequest('だめでした。', 'こうしてください。', 'retry')

    expect(error.status).toBe(400)
    expect(error.toApiError()).toEqual({
      message: 'だめでした。',
      hint: 'こうしてください。',
      action: 'retry',
    })
  })

  test('action なしなら action キーを付けない', () => {
    expect(notFound('ない。', 'さがして。').toApiError()).toEqual({
      message: 'ない。',
      hint: 'さがして。',
    })
  })

  test('想定外の例外も日本語に変換する', () => {
    const { status, body } = toApiError(new TypeError('undefined is not a function'))

    expect(status).toBe(500)
    expect(body.message).toBe('処理中に問題が起きました。')
    // 技術的な原文を利用者に見せない。
    expect(body.message).not.toContain('undefined')
    expect(body.hint).toBeTruthy()
  })

  test('AppError はそのままの status で返る', () => {
    const { status } = toApiError(new AppError({ status: 503, message: 'a', hint: 'b' }))
    expect(status).toBe(503)
  })

  test('describeError はログ用に原因まで展開する', () => {
    const inner = new Error('根本原因')
    const outer = new Error('表層', { cause: inner })

    expect(describeError(outer)).toContain('根本原因')
    expect(describeError('ただの文字列')).toBe('ただの文字列')
  })
})

describe('http エンベロープ', () => {
  test('成功は success:true と data', () => {
    expect(ok({ n: 1 })).toEqual({ success: true, data: { n: 1 } })
  })

  test('失敗は success:false と error', () => {
    const body = { message: 'a', hint: 'b' }
    expect(fail(body)).toEqual({ success: false, error: body })
  })
})

describe('依存の文言', () => {
  test('ラベルと用途が日本語で埋まっている', () => {
    for (const name of ['ffmpeg', 'ffprobe', 'ytdlp'] as const) {
      expect(depLabel(name).length).toBeGreaterThan(0)
      expect(depPurpose(name).length).toBeGreaterThan(0)
    }
  })

  test('OS ごとに直し方を出し分ける', () => {
    expect(depFixHint('ffmpeg', 'darwin')).toContain('brew')
    expect(depFixHint('ffmpeg', 'win32')).toContain('winget')
    expect(depFixHint('ffmpeg', 'linux')).toContain('パッケージマネージャ')
  })
})

describe('resolveBinary', () => {
  test('この開発機では ffmpeg / ffprobe / yt-dlp が見つかる', () => {
    expect(resolveBinary('ffmpeg')).toBeTruthy()
    expect(resolveBinary('ffprobe')).toBeTruthy()
    expect(resolveBinary('ytdlp')).toBeTruthy()
  })
})
