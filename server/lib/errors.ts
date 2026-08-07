import type { ApiError, ErrorAction } from './http.js'

/**
 * 画面にそのまま出せる日本語を持つエラー。
 * 例外メッセージを利用者に見せないため、投げる側が必ず message / hint を決める。
 */
export class AppError extends Error {
  readonly status: number
  readonly userMessage: string
  readonly hint: string
  readonly action: ErrorAction | undefined

  constructor(params: {
    status: number
    message: string
    hint: string
    action?: ErrorAction
    cause?: unknown
  }) {
    super(params.message, { cause: params.cause })
    this.name = 'AppError'
    this.status = params.status
    this.userMessage = params.message
    this.hint = params.hint
    this.action = params.action
  }

  toApiError(): ApiError {
    return this.action
      ? { message: this.userMessage, hint: this.hint, action: this.action }
      : { message: this.userMessage, hint: this.hint }
  }
}

export function badRequest(message: string, hint: string, action?: ErrorAction): AppError {
  return new AppError(
    action ? { status: 400, message, hint, action } : { status: 400, message, hint },
  )
}

export function notFound(message: string, hint: string): AppError {
  return new AppError({ status: 404, message, hint })
}

export function forbidden(message: string, hint: string): AppError {
  return new AppError({ status: 403, message, hint })
}

export function conflict(message: string, hint: string): AppError {
  return new AppError({ status: 409, message, hint })
}

export function tooBusy(message: string, hint: string): AppError {
  return new AppError({ status: 503, message, hint })
}

export function tooLarge(message: string, hint: string): AppError {
  return new AppError({ status: 413, message, hint })
}

export function internal(
  message: string,
  hint: string,
  cause?: unknown,
  action?: ErrorAction,
): AppError {
  return new AppError({ status: 500, message, hint, ...(action ? { action } : {}), cause })
}

/** 想定外の例外も含め、必ず日本語の 3 点セットに変換する。 */
export function toApiError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof AppError) {
    return { status: error.status, body: error.toApiError() }
  }
  return {
    status: 500,
    body: {
      message: '処理中に問題が起きました。',
      hint: 'もう一度お試しください。何度も続く場合はアプリを再起動してください。',
      action: 'retry',
    },
  }
}

/** ログ用。利用者には見せない技術的な詳細を取り出す。 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` <- ${error.cause.message}` : ''
    return `${error.name}: ${error.message}${cause}`
  }
  return String(error)
}
