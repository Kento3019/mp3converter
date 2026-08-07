import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { isInside, safeFilename, uniquePath } from '../../server/lib/paths.js'

describe('safeFilename', () => {
  test('日本語はそのまま残す', () => {
    expect(safeFilename('テスト動画')).toBe('テスト動画')
  })

  test('パス区切りを消してディレクトリ移動を防ぐ', () => {
    const result = safeFilename('../../etc/passwd')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    expect(result).not.toContain('..')
  })

  test('Windows で使えない記号を潰す', () => {
    const result = safeFilename('a<b>c:d"e|f?g*h')
    for (const char of ['<', '>', ':', '"', '|', '?', '*']) {
      expect(result).not.toContain(char)
    }
  })

  test('制御文字を潰す', () => {
    // NUL(0x00) と DEL(0x7f)。リテラルで書くとファイル自体が壊れるので組み立てる。
    const ctrl = `a${String.fromCharCode(0)}b${String.fromCharCode(0x7f)}c`
    expect(safeFilename(ctrl)).toBe('a_b_c')
  })

  test('先頭のドットを落として隠しファイル化を防ぐ', () => {
    expect(safeFilename('...secret').startsWith('.')).toBe(false)
  })

  test('Windows の予約名は接頭辞を付ける', () => {
    expect(safeFilename('CON')).toBe('_CON')
    expect(safeFilename('com1')).toBe('_com1')
  })

  test('空になる入力は代替名を返す', () => {
    expect(safeFilename('')).toBe('audio')
    expect(safeFilename('   ')).toBe('audio')
    expect(safeFilename('...', '音声')).toBe('音声')
  })

  test('長すぎる名前を切り詰めるが文字を割らない', () => {
    const result = safeFilename('あ'.repeat(200))
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(180)
    // 途中で割れていれば不正な文字（U+FFFD）が現れる。
    expect(result).not.toContain('�')
  })

  test('連続する空白は 1 つにまとめる', () => {
    expect(safeFilename('a    b')).toBe('a b')
  })
})

describe('isInside', () => {
  const parent = join(tmpdir(), 'mp3conv-parent')

  test('配下のファイルは true', () => {
    expect(isInside(parent, join(parent, 'a.mp3'))).toBe(true)
    expect(isInside(parent, join(parent, 'sub', 'a.mp3'))).toBe(true)
  })

  test('親自身は false（配下ではない）', () => {
    expect(isInside(parent, parent)).toBe(false)
  })

  test('外へ出るパスは false', () => {
    expect(isInside(parent, join(parent, '..', 'other.mp3'))).toBe(false)
    expect(isInside(parent, join(tmpdir(), 'other.mp3'))).toBe(false)
  })

  test('正規化前に .. を含んでいても配下なら true', () => {
    expect(isInside(parent, join(parent, 'sub', '..', 'a.mp3'))).toBe(true)
  })
})

describe('uniquePath', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mp3conv-unique-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('空いていればそのままの名前', () => {
    expect(basename(uniquePath(dir, '曲', '.mp3'))).toBe('曲.mp3')
  })

  test('埋まっていれば連番を付ける', async () => {
    await writeFile(join(dir, '曲.mp3'), '')
    expect(basename(uniquePath(dir, '曲', '.mp3'))).toBe('曲 (2).mp3')

    await writeFile(join(dir, '曲 (2).mp3'), '')
    expect(basename(uniquePath(dir, '曲', '.mp3'))).toBe('曲 (3).mp3')
  })

  test('返すのは指定ディレクトリ直下のパス', () => {
    const result = uniquePath(dir, 'x', '.mp3')
    expect(result.startsWith(dir + sep)).toBe(true)
  })
})
