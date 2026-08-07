import { describe, expect, test } from 'vitest'
import { mapYtdlpError } from '../../server/media/ytdlp.js'

describe('mapYtdlpError', () => {
  test('非公開動画は原因を伝えて再試行を促さない', () => {
    const error = mapYtdlpError('ERROR: [youtube] xyz: Private video. Sign in if you...')

    expect(error.status).toBe(400)
    expect(error.userMessage).toBe('この動画は非公開のため取得できません。')
    expect(error.action).toBeUndefined()
  })

  test('削除・地域制限', () => {
    const error = mapYtdlpError('ERROR: Video unavailable')

    expect(error.status).toBe(400)
    expect(error.userMessage).toBe('この動画は見つかりませんでした。')
  })

  test('年齢制限', () => {
    const error = mapYtdlpError('ERROR: Sign in to confirm your age')

    expect(error.status).toBe(400)
    expect(error.userMessage).toContain('年齢制限')
  })

  test('メンバー限定も非公開扱い', () => {
    expect(mapYtdlpError('This video is members-only content').userMessage).toContain('非公開')
  })

  test('原因不明は仕様変更とみなして更新ボタンを出す', () => {
    const error = mapYtdlpError('ERROR: なにかよく分からない失敗')

    expect(error.status).toBe(502)
    expect(error.userMessage).toBe('YouTube から取得できませんでした。')
    expect(error.action).toBe('update-ytdlp')
  })

  test('どの分岐でも日本語の message と hint が埋まる', () => {
    const samples = [
      'Private video',
      'Video unavailable',
      'confirm your age',
      'Sign in to continue',
      '',
    ]

    for (const sample of samples) {
      const error = mapYtdlpError(sample)
      expect(error.userMessage.length).toBeGreaterThan(0)
      expect(error.hint.length).toBeGreaterThan(0)
      // 英語の原文をそのまま利用者に見せない。
      expect(error.userMessage).not.toContain('ERROR')
    }
  })
})
