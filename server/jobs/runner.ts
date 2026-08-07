import { rm } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { config } from '../config.js'
import { describeError, toApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { ensureDir, safeFilename, uniquePath } from '../lib/paths.js'
import { toMp3 } from '../media/ffmpeg.js'
import { probeMedia } from '../media/ffprobe.js'
import { combineStagedPercent } from '../media/progress.js'
import { downloadAudio, fetchMeta } from '../media/ytdlp.js'
import { conversionQueue } from './queue.js'
import { jobStore } from './store.js'

export interface ConvertToMp3Params {
  jobId: string
  /** 変換元。ローカルの作業ファイル。 */
  inputPath: string
  /** 出力ファイル名の元になる文字列（元ファイル名 or 動画タイトル）。 */
  desiredName: string
  /** 全体進捗のうち、変換に割り当てる範囲。YouTube 経路は 50→100 を渡す。 */
  progressRange?: { from: number; to: number }
  /** 変換後に作業ファイルを消すか。 */
  cleanupInput?: boolean
}

/**
 * 作業ファイルを MP3 にして保存先へ置く。
 * ファイル経路も YouTube 経路もここを通るので、変換ロジックは 1 箇所しかない。
 */
export async function convertToMp3(params: ConvertToMp3Params): Promise<void> {
  const { jobId, inputPath, desiredName, progressRange, cleanupInput = true } = params
  const from = progressRange?.from ?? 0
  const to = progressRange?.to ?? 100

  try {
    const info = await probeMedia(inputPath)

    const base = safeFilename(stripExtension(desiredName) || info.title || '音声')
    await ensureDir(config.outputDir)
    const outputPath = uniquePath(config.outputDir, base, '.mp3')

    jobStore.update(jobId, { status: 'converting', progress: from })

    const job = jobStore.get(jobId)
    await toMp3({
      input: inputPath,
      output: outputPath,
      quality: job?.quality ?? 'high',
      durationSec: info.durationSec,
      title: info.title ?? base,
      onPercent: (percent) => {
        jobStore.update(jobId, { progress: Math.round(from + ((to - from) * percent) / 100) })
      },
    })

    jobStore.update(jobId, {
      status: 'done',
      progress: 100,
      outputName: basename(outputPath),
      outputPath,
    })
    logger.info('変換完了', { jobId, output: basename(outputPath) })
  } catch (error) {
    const { body } = toApiError(error)
    jobStore.update(jobId, { status: 'error', error: body })
    logger.error('変換に失敗', { jobId, detail: describeError(error) })
  } finally {
    if (cleanupInput) await rm(inputPath, { force: true }).catch(() => undefined)
  }
}

/** キューに積んで順番に処理する。呼び出し側は待たない（202 を即返すため）。 */
export function enqueueConversion(params: ConvertToMp3Params): void {
  void conversionQueue(() => convertToMp3(params)).catch((error: unknown) => {
    logger.error('キュー処理で想定外の例外', describeError(error))
  })
}

/**
 * YouTube の 2 段処理。
 * ダウンロードを全体の 0〜50%、MP3 変換を 50〜100% に割り当てる。
 */
async function runYoutubeJob(jobId: string, url: string): Promise<void> {
  let downloadedPath: string | null = null

  try {
    jobStore.update(jobId, { status: 'downloading', progress: 0 })

    const meta = await fetchMeta(url)
    jobStore.update(jobId, { title: meta.title })

    await ensureDir(config.workDir)
    downloadedPath = await downloadAudio({
      url,
      destDir: config.workDir,
      baseName: jobId,
      onPercent: (percent) => {
        jobStore.update(jobId, { progress: combineStagedPercent('downloading', percent) })
      },
    })

    // 変換部分はファイル経路と完全に同じ関数を使う。
    await convertToMp3({
      jobId,
      inputPath: downloadedPath,
      desiredName: meta.title,
      progressRange: { from: 50, to: 100 },
    })
  } catch (error) {
    const { body } = toApiError(error)
    jobStore.update(jobId, { status: 'error', error: body })
    logger.error('YouTube 取得に失敗', { jobId, detail: describeError(error) })
    if (downloadedPath) await rm(downloadedPath, { force: true }).catch(() => undefined)
  }
}

export function enqueueYoutube(jobId: string, url: string): void {
  void conversionQueue(() => runYoutubeJob(jobId, url)).catch((error: unknown) => {
    logger.error('キュー処理で想定外の例外', describeError(error))
  })
}

function stripExtension(name: string): string {
  const ext = extname(name)
  return ext ? name.slice(0, -ext.length) : name
}
