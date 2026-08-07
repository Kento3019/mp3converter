/**
 * API レスポンスの共通エンベロープ。
 * 画面側は success を見るだけで分岐でき、error は必ず「日本語で何が起きたか」を持つ。
 */
export interface ApiError {
  /** 何が起きたか。利用者にそのまま見せる日本語。 */
  message: string
  /** どうすれば直るか。1 行の日本語。 */
  hint: string
  /** 画面に出す復旧ボタンの種類。無ければボタンを出さない。 */
  action?: ErrorAction
}

export type ErrorAction = 'retry' | 'update-ytdlp' | 'check-deps'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function fail(error: ApiError): ApiResponse<never> {
  return { success: false, error }
}
