# 実装ステータス

最終更新: 2026-09-19

## 全体進捗

```
██████████  10 / 10 フェーズ完了（Mac / Windows どちらも実機での受け入れのみ残）
```

## フェーズ別

| # | フェーズ | 状態 | 検証したこと |
|---|---------|------|-------------|
| 1 | 足場 + STATUS.md | ✅ 完了 | `GET /api/health` が 200、型チェック通過、保存先を自動生成 |
| 2 | 依存検出 + `npm run doctor` | ✅ 完了 | ffmpeg / ffprobe / yt-dlp の 3 件を日本語で表示。`GET /api/health/deps` も提供 |
| 3 | 進捗パーサ + ffprobe + ffmpeg | ✅ 完了 | 合成 fixture → MP3。`ffprobe` で codec=mp3・尺一致・ビットレートを実測検証 |
| 4 | ジョブ / キュー / SSE + 変換 API | ✅ 完了 | アップロード → SSE 0→100% → ダウンロード。日本語名を RFC 5987 で配信 |
| 5 | YouTube 経路（yt-dlp 2段構成） | ✅ 完了 | 実 URL で DL 0-50% → 変換 50-100% → MP3。許可リスト外 URL を日本語で拒否 |
| 6 | React UI | ✅ 完了 | 本番ビルドを配信して JS 63.7KB(gzip) / CSS 2.5KB(gzip)。アセット 200 応答を確認 |
| 7 | cleanup + テスト + カバレッジ | ✅ 完了 | 133 テスト通過。lines 83.8% / funcs 88.7% / branch 82.0%（閾値クリア） |
| 8 | macOS 導入一式 | ⚠️ 実機未検証 | 全スクリプト `bash -n` 通過、テンプレ置換をドライラン検証、アイコン生成を実行確認 |
| 9 | README + レビュー | ✅ 完了 | 利用者編 / 開発者編を記載。指摘 4 件をすべて修正し再検証 |
| 10 | Windows 11 導入一式 | ⚠️ 実機で問題発見・修正中 | 実ユーザが Windows 11 実機で `setup.ps1` を 2 回実行し、2 件の実バグを発見・修正。**未再検証**。詳細は下記「Windows 実機で見つかった不具合」 |

## レビューでの指摘と対応

| 重大度 | 指摘 | 対応 |
|---|---|---|
| CRITICAL | `Origin` 検証が無く、利用者が開いている**別のWebページから** `POST /api/convert` を叩けた。`c.req.json()` は Content-Type を見ないため `text/plain` ボディならプリフライトも起きず、**任意のバイト列を ffmpeg の C パーサに送り込めた** | `server/lib/origin-guard.ts` を追加。Origin 許可リスト + 変更系に `X-Mp3Converter-Client` 必須。実サーバで PoC が 403 になることを確認 |
| HIGH | 処理中ジョブを `DELETE` できてしまい、ffmpeg/yt-dlp が止まらないまま出力が孤児化し、SSE も永久に閉じなかった | 未完了ジョブの削除を 409 で拒否（`server/routes/jobs.ts`） |
| MEDIUM | `useJobStream` が接続断でも `close()` していたため `EventSource` の自動再接続が死に、サーバ再起動後に進捗バーが固まったまま復帰しなかった | 本文の無い error（＝単なる接続断）では閉じずブラウザに任せる |
| LOW | SSE 送出ループが切断後も書き込みを試みていた / 逐次アップロードの意図が不明 | ループ条件に `closed` を追加。逐次である理由をコメントで明示 |
| （多層防御） | キューが無制限に積める | 未完了ジョブを 20 件で頭打ちにし、超過は日本語メッセージで 503 |

## 検証済みの環境

| 項目 | 開発機（Windows 11 上の Linux/WSL2） | 本番（Apple Silicon Mac） | 本番（Windows 11 実機） |
|------|--------------------------------------|--------------------------|--------------------------|
| Node.js | 未検証（この環境に node が無く実行できない） | 未検証（`setup.sh` が brew で導入） | 未検証（`setup.ps1` が winget で導入） |
| ffmpeg | 未検証 | 未検証（`setup.sh` が brew で導入） | 未検証（`setup.ps1` が winget で導入） |
| yt-dlp | 未検証 | 未検証（`npm install` が取得） | 未検証（同梱 → 失敗時 winget にフォールバック） |
| python3 | 未検証 | 未検証（`setup.sh` が brew で導入） | 未検証（`setup.ps1` が winget で導入） |

> この会話ではサンドボックスに node/PowerShell が入っておらず、`npm run typecheck` /
> `npm test` / `.ps1` の実行そのものができなかった。すべて静的レビューのみで、
> 挙動は未確認。次にこのリポジトリを node の使える環境（あるいは実機）で開いたとき、
> 最初に `npm run typecheck && npm test` を通すこと。

## Mac 実機で必ず確認すること

- [ ] `./scripts/macos/setup.sh` が**依存が無い状態から**完走し、最後にブラウザが開く
- [ ] Mac を再起動 → ログインだけでサーバが常駐（`launchctl print gui/$(id -u)/com.local.mp3converter`）
- [ ] Dock のアイコンを押すとブラウザが開き、**Gatekeeper 警告が出ない**
- [ ] MP4 をドロップ → 完成 → ［フォルダを開く］で `~/Music/MP3コンバーター/` が Finder に出る
- [ ] YouTube URL → ダウンロード中 → 変換中 → 完成。タイトルがファイル名に反映
- [ ] `launchctl bootout` でサーバを落とした状態でアイコンを押す → 自動復帰する
- [ ] `setup.sh` を**もう一度**実行 → 二重登録されず正常終了（冪等性）
- [ ] `./scripts/macos/uninstall.sh` → 常駐停止・アイコン消滅、**変換済み MP3 は残る**
- [ ] `~/Library/Logs/mp3converter/error.log` に想定外のエラーが出ていない

## Windows 実機で見つかった不具合

開発環境（Linux/WSL2）には PowerShell が無く、`setup.ps1` は一度も実行できないまま
最初のバージョンを用意した。実ユーザに実機で試してもらったところ、2 回の実行で
2 件の実バグが見つかった。

| # | 症状 | 原因 | 対応 | 再検証 |
|---|---|---|---|---|
| 1 | `npm run build` が `vite build` の `rolldown` ネイティブバインディング読み込みで失敗 | npm の既知の不具合（optional dependencies、[npm/cli#4828](https://github.com/npm/cli/issues/4828)）。`package-lock.json` に Windows 用バイナリが記載されていても `npm ci` が実際にはインストールしないことがある | `node_modules` + `package-lock.json` を作り直して `npm install` から再試行する自動リカバリを追加（`setup.ps1`/`setup.sh` 両方） | ⚠️ 未検証（下の #2 に阻まれて発動しなかった） |
| 2 | 上のリカバリを追加した版を再実行しても、**リカバリに入る前に**スクリプトが無言で終了 | `$ErrorActionPreference = 'Stop'` を設定したまま `npm run build 2>&1 \| Tee-Object` で stderr を結合していた。Windows PowerShell は結合された stderr 行を `ErrorRecord` として扱うため、`node` の失敗時スタックトレース（stderr）1 行目で即座にスクリプト全体が終了していた（`Die` すら呼ばれない） | 該当呼び出しの間だけ `$ErrorActionPreference = 'Continue'` に戻すよう修正 | ⚠️ 未検証 |
| （付随） | `npm warn EBADENGINE`（vite/rolldown が要求する `>=22.12.0` に対し、winget 導入の Node が `22.11.0`） | winget の `OpenJS.NodeJS.LTS` マニフェスト更新が遅れていた可能性 | Node バージョンを確認し、`22.12.0` 未満なら `winget upgrade` で更新する処理を追加 | ⚠️ 未検証。#1 の根本原因かは不明（このバージョン不一致と無関係に #1 の npm バグ自体は既知） |

## Windows 11 実機で必ず確認すること

- [ ] `.\scripts\windows\setup.ps1` を再実行し、上の 3 件の修正がすべて機能して最後まで通る
- [ ] `.\scripts\windows\setup.ps1` が**依存が無い状態から**完走し、最後にブラウザが開く（管理者権限を付けずに実行）
- [ ] `winget install` が個々に UAC を求めてきても、その後の処理が続行する
- [ ] タスクスケジューラの繰り返しトリガー（`Repetition.Duration = ''`）が本当に無期限に効くか（`Register-ScheduledTask` 実行後に `Get-ScheduledTask MP3Converter | fl *` で `Repetition` を確認）
- [ ] Windows を再起動 → ログインだけでサーバが常駐（`Get-ScheduledTask -TaskName MP3Converter`）
- [ ] スタートメニューのアイコンを押すとブラウザが開き、コンソールが一切ちらつかない（`launcher.vbs` → `launcher.ps1` の無表示実行）
- [ ] MP4 をドロップ → 完成 → ［フォルダを開く］で `explorer /select,` がエクスプローラを開く
- [ ] YouTube URL → ダウンロード中 → 変換中 → 完成
- [ ] タスクマネージャーで node プロセスを強制終了 → 1 分以内に見張りトリガーで自動復帰する
- [ ] `setup.ps1` を**もう一度**実行 → 二重登録されず正常終了（冪等性）
- [ ] `.\scripts\windows\uninstall.ps1` → 常駐停止・ショートカット消滅、**変換済み MP3 は残る**
- [ ] `%LOCALAPPDATA%\mp3converter\logs\error.log` に想定外のエラーが出ていない
- [ ] `.ico` がスタートメニュー/タスクバーで正しく表示される（PNG フレーム埋め込み ICO の互換性確認）

## 決定事項

- **Electron 不採用** — 未署名 `.app` の Gatekeeper 警告が非エンジニアには最大の障壁。`.app` は setup 時に Mac 上で生成し、quarantine 属性を付けない
- **`fluent-ffmpeg` 不採用** — メンテ停止。`child_process.spawn` + `-progress pipe:1` を直接使う
- **`@distube/ytdl-core` 不採用** — YouTube 側の変更で頻繁に破損。yt-dlp バイナリを使う
- **launchd は `bootstrap`/`bootout`** — `load`/`unload` は 10.10 以降 deprecated で Apple Silicon 上の挙動が不安定
- **PATH は plist に明示注入** — launchd 配下では `.zshrc` の PATH が効かず ffmpeg を見失う
- **アップロードは生ボディ** — `multipart` だと 2GB がメモリに載る。ストリームで直接ディスクへ流す
- **YouTube は 2 段構成** — 変換処理をファイル経路と共有（DRY）し、進捗を 0-50% / 50-100% に割る
- API レスポンスは `{ success, data, error }` 形式に統一
- **Windows はサービス化せずタスクスケジューラ（ログオントリガー）** — launchd の `gui/$UID` と同じ発想。Windows サービスは対話ユーザのプロファイル（`~/Music`）に素直に届かない
- **Windows の常駐再起動はログオン + 1分間隔の繰り返しトリガー** — ネイティブの「失敗時再起動」は回数上限があり無期限にできない。`MultipleInstances = IgnoreNew` で多重起動は防ぐ
- **アイコン生成ロジックを `scripts/shared/icon-render.mjs` に共通化** — macOS の `.icns`（1024px 1枚 → `sips` で縮小）と Windows の `.ico`（16/32/48/256px を直接描画して PNG フレームとして埋め込み）が同じ図形定義を使う

## 既知の制約

- **画面の見た目はブラウザで未確認** — Playwright MCP のブラウザ拡張ブリッジが開発機で使えず、HTTP レベル（アセット 200 応答・ビルドサイズ）までの確認に留めた。初回起動時に目視すること
- **Windows 対応スクリプトは実機未検証** — 開発環境に PowerShell が無く、`setup.ps1`/`diagnose.ps1`/`uninstall.ps1`/タスクスケジューラ登録を一度も実行できていない。静的レビューのみ
- **ジョブ一覧はメモリ上のみ** — サーバを再起動すると一覧は消える（変換済み MP3 は残る）。保持は最新 100 件まで
- **同時変換は既定 2 本** — `.env` の `MAX_CONCURRENT_JOBS` で変更可。増やすと PC が重くなる
