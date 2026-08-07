export type DepName = 'ffmpeg' | 'ffprobe' | 'ytdlp'

interface DepDescriptor {
  /** 画面・ターミナルに出す日本語名。専門用語を避ける。 */
  label: string
  /** 何のために要るか。1 行。 */
  purpose: string
  /** 見つからないときの直し方。macOS / Windows で文言を変える。 */
  fix: { darwin: string; win32: string; other: string }
}

const DESCRIPTORS: Record<DepName, DepDescriptor> = {
  ffmpeg: {
    label: '変換ソフト（ffmpeg）',
    purpose: '動画から音声を取り出して MP3 にする',
    fix: {
      darwin: 'ターミナルで brew install ffmpeg を実行してください（setup.sh が自動で行います）。',
      win32: 'winget install Gyan.FFmpeg を実行し、PC を再起動してください。',
      other: 'パッケージマネージャで ffmpeg を導入してください。',
    },
  },
  ffprobe: {
    label: '動画情報の読み取り（ffprobe）',
    purpose: '動画の長さを調べて進捗を計算する',
    fix: {
      darwin: 'ffmpeg と一緒に入ります。brew install ffmpeg を実行してください。',
      win32: 'ffmpeg と一緒に入ります。winget install Gyan.FFmpeg を実行してください。',
      other: 'ffmpeg パッケージに同梱されています。',
    },
  },
  ytdlp: {
    label: 'YouTube 取得ソフト（yt-dlp）',
    purpose: 'YouTube の音声をダウンロードする',
    fix: {
      darwin: 'アプリのフォルダで npm install を実行し直してください。',
      win32: 'アプリのフォルダで npm install を実行し直してください。',
      other: 'アプリのフォルダで npm install を実行し直してください。',
    },
  },
}

export function depLabel(name: DepName): string {
  return DESCRIPTORS[name].label
}

export function depPurpose(name: DepName): string {
  return DESCRIPTORS[name].purpose
}

/** 実行環境に合わせた「直し方」を返す。 */
export function depFixHint(name: DepName, platform: NodeJS.Platform = process.platform): string {
  const fix = DESCRIPTORS[name].fix
  if (platform === 'darwin') return fix.darwin
  if (platform === 'win32') return fix.win32
  return fix.other
}

/** ffmpeg はあるが MP3 が作れない（libmp3lame 無し）ときの文言。 */
export const MP3_ENCODER_MISSING = {
  message: '変換ソフトが MP3 に対応していません。',
  hint: 'ffmpeg を入れ直してください（macOS: brew reinstall ffmpeg）。',
} as const
