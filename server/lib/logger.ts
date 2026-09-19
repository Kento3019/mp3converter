import { describeError } from './errors.js'

type Level = 'info' | 'warn' | 'error'

/**
 * 常駐の仕組み（macOS: launchd の StandardOutPath/StandardErrorPath、
 * Windows: run-server.ps1 のリダイレクト）にそのまま流れる前提の最小ロガー。
 * 常駐後に何が起きたか追えるよう、必ず時刻とレベルを付ける。
 */
function write(level: Level, message: string, detail?: unknown): void {
  const suffix = detail === undefined ? '' : ` | ${format(detail)}`
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}\n`
  if (level === 'error') {
    process.stderr.write(line)
    return
  }
  process.stdout.write(line)
}

function format(detail: unknown): string {
  if (detail instanceof Error) return describeError(detail)
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export const logger = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
}
