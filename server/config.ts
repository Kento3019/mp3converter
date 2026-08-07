import { join } from 'node:path'
import { z } from 'zod'
import { APP_ROOT, defaultOutputDir, defaultWorkDir } from './lib/paths.js'

// .env があれば読む。無くても既定値で動く。
try {
  process.loadEnvFile(join(APP_ROOT, '.env'))
} catch {
  // .env 未配置は正常系。
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5487),
  HOST: z.string().min(1).default('127.0.0.1'),
  OUTPUT_DIR: z.string().default(''),
  WORK_DIR: z.string().default(''),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 ** 3),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(8).default(2),
  RETENTION_HOURS: z.coerce.number().positive().default(24),
  YTDLP_UPDATE_INTERVAL_HOURS: z.coerce.number().min(0).default(24),
  FFMPEG_PATH: z.string().default(''),
  FFPROBE_PATH: z.string().default(''),
  YTDLP_PATH: z.string().default(''),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
  throw new Error(`.env の設定値が不正です → ${detail}`)
}

const env = parsed.data

export const config = Object.freeze({
  appRoot: APP_ROOT,
  port: env.PORT,
  /** 127.0.0.1 固定が既定。0.0.0.0 にすると同じ LAN の他人から見えるため変えないこと。 */
  host: env.HOST,
  outputDir: env.OUTPUT_DIR || defaultOutputDir(),
  workDir: env.WORK_DIR || defaultWorkDir(),
  maxUploadBytes: env.MAX_UPLOAD_BYTES,
  maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
  retentionHours: env.RETENTION_HOURS,
  ytdlpUpdateIntervalHours: env.YTDLP_UPDATE_INTERVAL_HOURS,
  /** 空なら deps/detect.ts が自動検出する。 */
  overrides: Object.freeze({
    ffmpeg: env.FFMPEG_PATH || undefined,
    ffprobe: env.FFPROBE_PATH || undefined,
    ytdlp: env.YTDLP_PATH || undefined,
  }),
  clientDistDir: join(APP_ROOT, 'dist', 'client'),
})

export type Config = typeof config
