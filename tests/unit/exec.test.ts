import { describe, expect, test } from 'vitest'
import { run } from '../../server/lib/exec.js'

const NODE = process.execPath

describe('run', () => {
  test('stdout と終了コードを回収する', async () => {
    const result = await run(NODE, ['-e', 'process.stdout.write("こんにちは")'])

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('こんにちは')
    expect(result.timedOut).toBe(false)
  })

  test('stderr と非ゼロ終了を回収する', async () => {
    const result = await run(NODE, ['-e', 'process.stderr.write("だめ");process.exit(3)'])

    expect(result.code).toBe(3)
    expect(result.stderr).toBe('だめ')
  })

  test('チャンク境界で行が割れても 1 行ずつ渡す', async () => {
    const lines: string[] = []
    // 1 文字ずつ書き出して、必ずチャンク境界が行の途中に来るようにする。
    await run(NODE, ['-e', 'for (const c of "ab\\ncd\\nef") process.stdout.write(c)'], {
      onStdoutLine: (line) => lines.push(line),
    })

    expect(lines).toEqual(['ab', 'cd', 'ef'])
  })

  test('CR 区切り（ffmpeg / yt-dlp の上書き出力）も 1 行として扱う', async () => {
    const lines: string[] = []
    await run(NODE, ['-e', 'process.stdout.write("a\\rb\\rc")'], {
      onStdoutLine: (line) => lines.push(line),
    })

    expect(lines).toEqual(['a', 'b', 'c'])
  })

  test('stderr も 1 行ずつ渡す', async () => {
    const lines: string[] = []
    await run(NODE, ['-e', 'process.stderr.write("x\\ny\\n")'], {
      onStderrLine: (line) => lines.push(line),
    })

    expect(lines).toEqual(['x', 'y'])
  })

  test('タイムアウトすると timedOut が立つ', async () => {
    const result = await run(NODE, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 })

    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
  })

  test('存在しないコマンドは reject する', async () => {
    await expect(run('このコマンドは存在しない__zzz', [])).rejects.toThrow()
  })

  test('引数は配列で渡るためシェル展開されない', async () => {
    // シェル経由なら * が展開されるが、shell:false なのでそのまま渡る。
    const result = await run(NODE, ['-e', 'process.stdout.write(process.argv[1])', '*'])

    expect(result.stdout).toBe('*')
  })
})
