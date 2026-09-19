import type { DepsReport } from '../../../server/deps/detect.js'
import type { JobView } from '../../../server/jobs/types.js'
import type { ApiError, ApiResponse } from '../../../server/lib/http.js'
import type { Quality } from '../../../server/media/quality.js'

export type { ApiError, DepsReport, JobView, Quality }

/** 画面に出せる形のエラー。API 層で必ずこの形にそろえる。 */
export class ApiFailure extends Error {
  readonly detail: ApiError

  constructor(detail: ApiError) {
    super(detail.message)
    this.name = 'ApiFailure'
    this.detail = detail
  }
}

const NETWORK_ERROR: ApiError = {
  message: 'アプリとの通信ができませんでした。',
  hint: 'アプリが動いていない可能性があります。アプリのアイコンをもう一度押してください。',
  action: 'retry',
}

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!payload) {
    throw new ApiFailure({
      message: '応答を読み取れませんでした。',
      hint: 'もう一度お試しください。',
      action: 'retry',
    })
  }
  if (!payload.success || payload.data === undefined) {
    throw new ApiFailure(payload.error ?? NETWORK_ERROR)
  }
  return payload.data
}

/**
 * サーバが要求する専用ヘッダ。
 * これが付くとクロスオリジンの要求は必ずプリフライトになり、
 * サーバは CORS 許可を返さないので他サイトからは送信段階で落ちる。
 */
const CLIENT_HEADER = { 'X-Mp3Converter-Client': '1' } as const

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers: { ...CLIENT_HEADER, ...init?.headers },
    })
  } catch {
    throw new ApiFailure(NETWORK_ERROR)
  }
  return unwrap<T>(response)
}

export interface HealthInfo {
  status: 'ok'
  outputDir: string
}

export function fetchHealth(): Promise<HealthInfo> {
  return request<HealthInfo>('/api/health')
}

export function fetchDeps(refresh = false): Promise<DepsReport> {
  return request<DepsReport>(`/api/health/deps${refresh ? '?refresh=1' : ''}`)
}

export function fetchJobs(): Promise<JobView[]> {
  return request<JobView[]>('/api/jobs')
}

/**
 * ファイルを生ボディで送る。
 * multipart にしないことで、大きな動画でもブラウザ側がメモリを食いつぶさない。
 */
export function uploadFile(file: File, quality: Quality): Promise<JobView> {
  const params = new URLSearchParams({ quality, filename: file.name })
  return request<JobView>(`/api/convert?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
}

export function submitYoutube(url: string, quality: Quality): Promise<JobView> {
  return request<JobView>('/api/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, quality }),
  })
}

export function revealJob(id: string): Promise<{ revealed: boolean }> {
  return request<{ revealed: boolean }>(`/api/jobs/${id}/reveal`, { method: 'POST' })
}

export function deleteJob(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' })
}

export function updateYtdlp(): Promise<{ updated: boolean; message: string }> {
  return request<{ updated: boolean; message: string }>('/api/maintenance/update-ytdlp', {
    method: 'POST',
  })
}

export function downloadUrl(id: string): string {
  return `/api/jobs/${id}/download`
}

/** 想定外の例外も含め、必ず画面に出せる日本語にする。 */
export function toDisplayError(error: unknown): ApiError {
  if (error instanceof ApiFailure) return error.detail
  return NETWORK_ERROR
}
