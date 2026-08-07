import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'
import { logger } from './logger.js'

const SWEEP_INTERVAL_MS = 60 * 60_000

/**
 * 作業用の一時ファイルだけを消す。
 * 保存先（~/Music/MP3コンバーター）には絶対に触れない。
 * 利用者が作った MP3 を勝手に消さないことがこの関数の不変条件。
 */
export async function sweepWorkDir(): Promise<number> {
  const cutoff = Date.now() - config.retentionHours * 60 * 60_000
  const entries = await readdir(config.workDir).catch(() => [] as string[])

  let removed = 0
  for (const entry of entries) {
    const path = join(config.workDir, entry)
    try {
      const info = await stat(path)
      if (info.mtimeMs >= cutoff) continue
      await rm(path, { recursive: true, force: true })
      removed += 1
    } catch {
      // 使用中や権限で消せないものは次回に回す。
    }
  }

  if (removed > 0) logger.info(`古い作業ファイルを削除しました: ${removed} 件`)
  return removed
}

/** 起動時に 1 回、その後 1 時間ごとに掃除する。 */
export function startCleanupSchedule(): void {
  const tick = (): void => {
    void sweepWorkDir().catch((error: unknown) => logger.warn('作業ファイルの掃除で例外', error))
  }
  tick()
  setInterval(tick, SWEEP_INTERVAL_MS).unref()
}
