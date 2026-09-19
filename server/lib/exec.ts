import { spawn } from 'node:child_process'

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface RunOptions {
  timeoutMs?: number
  cwd?: string
  /** stdout に流れてくる 1 行ごとに呼ばれる。進捗パースに使う。 */
  onStdoutLine?: (line: string) => void
  /** stderr に流れてくる 1 行ごとに呼ばれる。 */
  onStderrLine?: (line: string) => void
  /** 呼び出し側から中断するための signal。 */
  signal?: AbortSignal
  /**
   * コンソールウィンドウを作らないか（既定 true）。
   * ffmpeg/yt-dlp 向けの既定だが、GUI アプリ（explorer.exe 等）を
   * 起動する呼び出しでは false にする。ドキュメント上 GUI サブシステムの
   * プロセスには無視されるはずのフラグだが、念のため呼び出し側で選べるようにする。
   */
  windowsHide?: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * 外部コマンドを実行する唯一の入口。
 * shell を必ず false にし、引数は配列で渡す（文字列連結でのコマンド注入を構造的に防ぐ）。
 */
export function run(
  cmd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cwd,
    onStdoutLine,
    onStderrLine,
    signal,
    windowsHide = true,
  } = options

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(cmd, [...args], {
      shell: false,
      windowsHide,
      ...(cwd ? { cwd } : {}),
      ...(signal ? { signal } : {}),
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            child.kill('SIGKILL')
          }, timeoutMs)
        : undefined

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    const stdoutLines = lineSplitter((line) => onStdoutLine?.(line))
    const stderrLines = lineSplitter((line) => onStderrLine?.(line))

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (onStdoutLine) stdoutLines.push(chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      if (onStderrLine) stderrLines.push(chunk)
    })

    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      stdoutLines.flush()
      stderrLines.flush()
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

/** チャンク境界で行が割れても正しく 1 行ずつ渡すためのバッファ。 */
function lineSplitter(emit: (line: string) => void): {
  push: (chunk: string) => void
  flush: () => void
} {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      // ffmpeg / yt-dlp は \r で行を上書きしてくるので \r も区切りとして扱う。
      const parts = buffer.split(/\r\n|\r|\n/)
      buffer = parts.pop() ?? ''
      for (const part of parts) emit(part)
    },
    flush() {
      if (buffer) {
        emit(buffer)
        buffer = ''
      }
    },
  }
}
