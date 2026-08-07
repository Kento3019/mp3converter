import { describe, expect, test } from 'vitest'
import { parseYoutubeUrl } from '../../server/media/youtube-url.js'

describe('parseYoutubeUrl — 通す URL', () => {
  test.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ])('%s', (url) => {
    expect(parseYoutubeUrl(url)).toContain('dQw4w9WgXcQ')
  })

  test('前後の空白は無視する', () => {
    expect(parseYoutubeUrl('  https://youtu.be/abc123  ')).toContain('abc123')
  })

  test('大文字のホスト名も通す', () => {
    expect(parseYoutubeUrl('https://WWW.YouTube.COM/watch?v=abc123')).toContain('abc123')
  })
})

describe('parseYoutubeUrl — 弾く URL', () => {
  test.each([
    ['許可リスト外ホスト', 'https://evil.example/watch?v=x'],
    ['サブドメイン偽装', 'https://youtube.com.evil.example/watch?v=x'],
    ['接尾辞偽装', 'https://notyoutube.com/watch?v=x'],
    ['javascript スキーム', 'javascript:alert(1)'],
    ['file スキーム', 'file:///etc/passwd'],
    ['内部ネットワーク', 'http://127.0.0.1:5487/api/health'],
    ['URL ですらない', 'これはURLではない'],
    ['空文字', ''],
  ])('%s は拒否する', (_label, url) => {
    expect(() => parseYoutubeUrl(url)).toThrow()
  })

  test('拒否時は日本語の説明と直し方を持つ', () => {
    try {
      parseYoutubeUrl('https://evil.example/x')
      throw new Error('例外が飛ばなかった')
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        userMessage: expect.stringContaining('YouTube'),
      })
    }
  })
})
