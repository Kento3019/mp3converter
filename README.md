# MP3コンバーター

動画ファイルや YouTube から、音声だけを取り出して MP3 にするツール。
Mac / Windows 11 の中だけで動く。インターネットに何かを送ることはない。

---

# 第1部 使う人へ

**むずかしい操作はありません。アイコンを押すだけです。**

## はじめかた

紫色の音符のアイコンを押す。

- **Mac**: Dock（画面の下のバー）にあるアイコンを押す
- **Windows**: スタートメニューまたはタスクバーにあるアイコンを押す

それだけで画面が開く。パソコンを起動しておけば、いつでもすぐ使える。

> アイコンが見当たらないときは、
> **Mac** は Launchpad（ロケットのアイコン）を開いて「MP3コンバーター」を探し Dock にドラッグする。
> **Windows** はスタートメニューで「MP3コンバーター」を検索し、タスクバーにピン留めする。

## 動画ファイルから MP3 を作る

1. 画面の**左側の大きな枠**に、動画ファイルをドラッグして落とす
2. 待つ（バーがのびて 100% になる）
3. 「完成！」と出たら **［フォルダを開く］** を押す
4. できた MP3 がフォルダに入っている

ファイルは何個でも、まとめて落として大丈夫。

## YouTube から MP3 を作る

1. YouTube で動画を開き、ブラウザの**アドレス欄をコピー**する
2. 画面の**右側の入力欄**に貼り付ける
3. **［MP3 にする］** を押す
4. 「完成！」と出たら **［フォルダを開く］** を押す

## 音質について

3 つから選べる。迷ったら **「高音質」** のままでよい。

| 選ぶもの | どんなとき |
|---|---|
| 標準 | たくさん保存したいとき（ファイルが小さい） |
| **高音質** | ふだんはこれ |
| 最高音質 | 音にこだわりたいとき（ファイルが大きい） |

## できた MP3 はどこにある？

**「ミュージック」フォルダの中の「MP3コンバーター」フォルダ**に入る。

画面の［フォルダを開く］を押せば、そこが自動で開く。探さなくてよい。

## うまくいかないとき

画面に「何が起きたか」と「どうすればよいか」が出る。
書いてあるとおりにすれば、たいてい直る。

| 出てきた文 | どうする |
|---|---|
| YouTube から取得できませんでした | **［更新して再試行］** を押す。これで直ることが多い |
| この動画には音声が入っていません | 別の動画で試す |
| この動画は非公開のため取得できません | 公開されている動画を選ぶ |
| アプリとの通信ができませんでした | 画面を閉じて、アプリのアイコンをもう一度押す |
| 動かすために足りないものがあります（赤い帯） | 導入した人に、赤い帯に書いてある文章をそのまま伝える |

それでも直らないときは、パソコンを再起動してからもう一度試す。

## 知っておいてほしいこと

- 導入した直後に、Mac が「バックグラウンド項目が追加されました」と知らせることがある。**これは正常**。
- YouTube からのダウンロードは、自分に権利がある動画や、許可されている範囲で使うこと。

---

# 第2部 導入する人へ

## これは何か

- **サーバ**: Node.js + [Hono](https://hono.dev/)。`127.0.0.1` にのみバインドし、外部公開しない
- **画面**: React + Vite。同じサーバが配信する
- **変換**: `ffmpeg` を直接 `spawn`（`-progress pipe:1` で進捗を取得）
- **YouTube**: `yt-dlp`（`youtube-dl-exec` が同梱バイナリを取得）。起動時と 24 時間ごとに自己更新
- **常駐**: Mac は launchd の LaunchAgent。Windows はタスクスケジューラのログオントリガー。どちらもログイン時に起動し、落ちたら自動復帰
- **ランチャ**: セットアップ時にその場で生成するアイコン。Mac は `.app`（**ローカル生成なので Gatekeeper の警告が出ない**）、Windows はスタートメニューのショートカット

## 導入

### Mac（Apple Silicon / Intel 共通）

```bash
git clone <このリポジトリ> ~/apps/mp3converter
cd ~/apps/mp3converter
./scripts/macos/setup.sh
```

`setup.sh` がやること:

1. Homebrew の場所を検出（`/opt/homebrew` と `/usr/local` の両方を見る）
2. `node` / `ffmpeg` / `python3` を確認し、**足りないものだけ** `brew install`
3. `npm ci` → `npm run build`
4. yt-dlp が取得できたかを検証（取れていなければ中止）
5. `npm run doctor` で最終確認
6. `~/Music/MP3コンバーター/` と `~/Library/Logs/mp3converter/` を作成
7. `~/Applications/MP3コンバーター.app` を生成（アイコンも生成）
8. LaunchAgent を `launchctl bootstrap` で登録
9. 起動を確認してブラウザを開く

**冪等**。何度実行しても二重登録されない。更新も `git pull` してから再実行するだけ。

> Homebrew 自体は自動インストールしない。管理者パスワードの入力が必要なため、
> 未導入の場合は案内を出して停止する。

#### 動作確認

```bash
# 常駐しているか
launchctl print gui/$(id -u)/com.local.mp3converter | head -20

# 応答しているか
curl -s http://127.0.0.1:5487/api/health

# 必要なソフトが揃っているか
npm run doctor

# ログ
tail -f ~/Library/Logs/mp3converter/server.log
tail -f ~/Library/Logs/mp3converter/error.log
```

#### 起動できないとき

まず状況をまとめて出す。何も書き換えないので安全。

```bash
./scripts/macos/diagnose.sh
```

「要修正」「なし」が出た項目が原因。多くは `setup.sh` の再実行（**sudo なし**）で直る。

##### よくある原因

| 症状 | 原因 | 直し方 |
|---|---|---|
| Dock のアイコンで「セットアップが終わっていません」 | `setup.sh` が途中で止まっていて LaunchAgent が未登録 | `./scripts/macos/setup.sh` を再実行 |
| 常駐が起動しない / アイコンでエラー | **`sudo` で `npm install` や `npm run dev` を実行し、`node_modules` と `dist` が root 所有になった**。常駐はユーザ権限で動くため読めない | `setup.sh` を再実行すると検出して持ち主を戻す。手動なら `sudo chown -R $(id -u):$(id -g) node_modules dist` |
| `setup.sh` が yt-dlp で止まる | GitHub からのダウンロードに失敗 | 現在は自動で `brew install yt-dlp` にフォールバックする。手動なら `brew install yt-dlp` |
| `npm run build` が `Cannot find native binding`（rolldown/vite）で失敗 | **npm の既知の不具合**（[npm/cli#4828](https://github.com/npm/cli/issues/4828)）。`package-lock.json` に該当プラットフォームのバイナリが記載されていても `npm ci` が実際にはインストールしないことがある | `setup.sh` が検知して `node_modules` と `package-lock.json` を作り直し、自動でリトライする。`package-lock.json` が更新されるので、差分は git で確認してコミットすること |
| **手で起動すると動くのに、自動起動だけ即死する**（`active count = 0` / `state = spawn scheduled` を繰り返す） | **リポジトリを `~/Desktop` `~/Documents` `~/Downloads` に置いている**。macOS のプライバシー保護（TCC）により、launchd から起動したプロセスはこれらのフォルダを読めない。ターミナルからは Terminal.app に許可があるため動いてしまい、切り分けを誤らせる | 保護対象外へ移す。`mv <今の場所> ~/mp3converter && cd ~/mp3converter && ./scripts/macos/setup.sh` |
| `last exit code = 78: EX_CONFIG`（登録はできるが起動しない。手動起動は通る） | **launchd がジョブを構成できていない。プログラムの異常ではない**。多くは `StandardOutPath`/`StandardErrorPath`（`~/Library/Logs/mp3converter/*.log`）が別ユーザ所有で開けないケース。以前 root で常駐させた名残 | `setup.sh` がログファイルの持ち主を確認し、開けなければ作り直す。手動なら `sudo rm -f ~/Library/Logs/mp3converter/*.log` |
| `Bootstrap failed: 5: Input/output error` | ①同じラベルが既に登録されている ②そのラベルが `disable` されている ③**plist が group/other 書き込み可**（`chmod 777` などにすると launchd が拒否する。正しくは `644`） | `setup.sh` が 3 つとも自動で潰す。手動なら下の「手で直す」を実行 |
| ターミナルでは動くのに常駐だと ffmpeg が見つからない | launchd 配下では `.zshrc` の PATH が効かない | plist に PATH を明示注入済み。`setup.sh` を再実行して plist を作り直す |

##### 手で直す（登録だけが失敗する場合）

```bash
LABEL=com.local.mp3converter
PLIST=~/Library/LaunchAgents/$LABEL.plist

sudo launchctl bootout gui/0/$LABEL 2>/dev/null   # root 側の残骸を外す
launchctl bootout gui/$(id -u)/$LABEL 2>/dev/null # 自分側の登録を外す
launchctl enable gui/$(id -u)/$LABEL              # 無効化されていたら戻す
chmod 644 "$PLIST"                                # group/other の書き込み権を落とす
launchctl bootstrap gui/$(id -u) "$PLIST"
launchctl print gui/$(id -u)/$LABEL | head -20    # active count = 1 になれば成功
```

`plist` の権限は **`-rw-r--r--`（644）／持ち主は自分**でなければならない。
`chmod 777` にすると launchd は読み込みを拒否する。

#### やってはいけないこと

**`sudo` を付けて `npm install` / `npm run dev` / `setup.sh` を実行しない。**
このアプリはあなたのユーザ権限で常駐する。root で入れると所有者が変わり、自動起動できなくなる。
`setup.sh` は root で起動された場合その場で停止する。

#### 取り外し

```bash
./scripts/macos/uninstall.sh
```

常駐を解除し、`.app` と plist を消す。**変換済みの MP3 は消さない**。

### Windows 11

PowerShell（管理者権限は**不要**。むしろ使わない）で実行する。

```powershell
git clone <このリポジトリ> ~\apps\mp3converter
cd ~\apps\mp3converter
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1
```

`setup.ps1` がやること:

1. `winget` の有無を確認（無ければ Microsoft Store の「アプリ インストーラー」更新を案内して停止）
2. `node` / `ffmpeg` / `python` を確認し、**足りないものだけ** `winget install`
3. `npm ci` → `npm run build`
4. yt-dlp が取得できたかを検証（同梱で使えなければ `winget install yt-dlp.yt-dlp` にフォールバック）
5. `npm run doctor` で最終確認
6. `~\Music\MP3コンバーター\` と `%LOCALAPPDATA%\mp3converter\logs\` を作成
7. `%LOCALAPPDATA%\mp3converter\` にアイコン（.ico）と設定（PORT / HOST / node の実パス）を生成
8. スタートメニューにショートカットを作成
9. タスクスケジューラにログオントリガーを登録し、起動を確認してブラウザを開く

**冪等**。何度実行しても二重登録されない。更新も `git pull` してから再実行するだけ。

> 管理者として実行すると停止する。このアプリはあなたのユーザ権限で常駐するため。
> `winget` 自体のインストール（各パッケージの導入時）は必要に応じて個別に確認（UAC）が出ることがある。

#### 動作確認

```powershell
# 常駐しているか
Get-ScheduledTask -TaskName MP3Converter | Get-ScheduledTaskInfo

# 応答しているか
Invoke-WebRequest http://127.0.0.1:5487/api/health -UseBasicParsing

# 必要なソフトが揃っているか
npm run doctor

# ログ
Get-Content "$env:LOCALAPPDATA\mp3converter\logs\server.log" -Wait
Get-Content "$env:LOCALAPPDATA\mp3converter\logs\error.log" -Wait
```

#### 起動できないとき

まず状況をまとめて出す。何も書き換えないので安全。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\diagnose.ps1
```

「なし」が出た項目が原因。多くは `setup.ps1` の再実行（**管理者権限なし**）で直る。

##### よくある原因

| 症状 | 原因 | 直し方 |
|---|---|---|
| アイコンで「セットアップが終わっていません」 | `setup.ps1` が途中で止まっていてタスク未登録 | `setup.ps1` を再実行 |
| `setup.ps1` が `winget が見つかりません` で止まる | 「アプリ インストーラー」が古い/未導入 | Microsoft Store で更新してから再実行 |
| `setup.ps1` が yt-dlp で止まる | ダウンロードに失敗 | 現在は自動で `winget install yt-dlp.yt-dlp` にフォールバックする |
| `npm run build` が `Cannot find native binding`（rolldown/vite）で失敗 | **npm の既知の不具合**（[npm/cli#4828](https://github.com/npm/cli/issues/4828)）。`package-lock.json` に Windows 用バイナリが記載されていても `npm ci` が実際にはインストールしないことがある | `setup.ps1` が検知して `node_modules` と `package-lock.json` を作り直し、自動でリトライする。`package-lock.json` が更新されるので、差分は git で確認してコミットすること |
| ターミナルでは動くのに常駐だと ffmpeg / node が見つからない | `winget` install 直後は PATH がそのセッションに反映されない、または常駐が別セッションで PATH を再構成できていない | node の実パスは `%LOCALAPPDATA%\mp3converter\env.ps1` に固定済み。ffmpeg/yt-dlp は `setup.ps1` を再実行して PATH を確定させる |
| `.ps1 を実行できません（実行ポリシー）` | Windows の既定ポリシーがスクリプト実行を止めている | `-ExecutionPolicy Bypass` を付けて実行する（上記コマンドの通り）。システム全体のポリシーは変更しない |
| タスクの `LastTaskResult` が 0 以外 | node の異常終了、または `dist/server/index.js` 未ビルド | `npm run build` を実行してから `Start-ScheduledTask -TaskName MP3Converter` |

タスクの実体は `MP3Converter` という名前でタスクスケジューラに登録される（フォルダはルート直下）。
ログオン時に起動するトリガーに加え、1 分おきの「見張りトリガー」を持つ。動作中は多重起動しない
（`MultipleInstances = IgnoreNew`）ため、落ちたときだけ最大 1 分以内に再起動する。

#### 取り外し

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1
```

常駐（タスク）とショートカットを消す。**変換済みの MP3 は消さない**。

## 設定

`.env.example` を `.env` にコピーして編集する。何も設定しなくても動く。

| 変数 | 既定 | 説明 |
|---|---|---|
| `PORT` | `5487` | 待ち受けポート |
| `HOST` | `127.0.0.1` | **変えないこと**。`0.0.0.0` にすると同じ LAN の他人から見える |
| `OUTPUT_DIR` | `~/Music/MP3コンバーター`（Windows も `Music` フォルダ配下） | MP3 の保存先 |
| `MAX_UPLOAD_BYTES` | `2147483648`（2GB） | アップロード上限 |
| `MAX_CONCURRENT_JOBS` | `2` | 同時変換数。増やすと PC が重くなる |
| `RETENTION_HOURS` | `24` | 一時ファイルの保持時間 |
| `YTDLP_UPDATE_INTERVAL_HOURS` | `24` | yt-dlp の自動更新間隔。`0` で無効 |
| `FFMPEG_PATH` / `FFPROBE_PATH` / `YTDLP_PATH` | 空 | 自動検出を上書きしたい場合のみ |

> `setup.sh` / `setup.ps1` はセットアップ実行時点の `PORT` をそれぞれ plist /
> `env.ps1` に固定して常駐へ渡す。常駐だけ `PORT` を変えたい場合は
> `PORT=<番号> ./scripts/macos/setup.sh`（Mac）や
> `$env:PORT='<番号>'; .\scripts\windows\setup.ps1`（Windows）のように
> 環境変数を付けて再実行する
> （`.env` の `PORT` は、常駐環境で明示的に上書きされていない場合にだけ使われる）。

## 開発

```bash
npm install
npm run dev            # サーバ(5487) と Vite(5173) を同時起動 → http://127.0.0.1:5173
                       # 起動まで 5〜10 秒かかる。両方のログが出てから開く
npm run typecheck
npm test
npm run test:coverage  # 80% 未満で失敗する
npm run build && npm start
```

### 構成

```
server/
  app.ts            Hono の組み立て（テストからも使う）
  index.ts          起動のみ
  config.ts         zod で env を検証して凍結
  routes/           health / convert / youtube / jobs / maintenance
  jobs/             store（不変更新）· queue（同時実行制限）· runner（変換の本体）
  media/            progress（純関数）· ffprobe · ffmpeg · ytdlp · youtube-url · quality
  deps/             detect（実行ファイル探索）· messages（日本語の直し方）
  lib/              paths · exec · errors · http · logger · upload · reveal · cleanup
client/src/         React（components / hooks / lib）
scripts/macos/      setup.sh · uninstall.sh · diagnose.sh · plist と launcher のテンプレ・アイコン生成
scripts/windows/    setup.ps1 · uninstall.ps1 · diagnose.ps1 · run-server.ps1 · launcher · アイコン生成
scripts/shared/     アイコン描画（macOS/Windows で共有する純関数）
tests/              unit · integration · fixtures（ffmpeg で合成素材を生成）
```

### 設計上の判断

| 決めたこと | 理由 |
|---|---|
| Electron を使わない | 未署名 `.app` の Gatekeeper 警告が非エンジニアには最大の障壁。`.app` は Mac 上で生成して quarantine を回避する |
| `fluent-ffmpeg` を使わない | 実質メンテ停止。`spawn` + `-progress pipe:1` の方が短く確実で依存ゼロ |
| `@distube/ytdl-core` を使わない | YouTube 側の変更で頻繁に壊れる。yt-dlp が最も堅い |
| launchd は `bootstrap`/`bootout` | `load`/`unload` は 10.10 以降 deprecated で Apple Silicon 上の挙動が不安定 |
| plist に PATH を明示注入 | launchd 配下では `.zshrc` の PATH が効かず、ffmpeg を見失う典型事故を防ぐ |
| YouTube は 2 段構成（DL → ffmpeg） | 変換処理をファイル経路と共有でき、進捗も 0-50% / 50-100% に割れる |
| アップロードは生ボディ | `multipart` だと数 GB がメモリに載る。ストリームで直接ディスクへ流す |
| Windows はサービス化せずタスクスケジューラ | Windows サービスはユーザのデスクトップセッションを持たず、`~/Music` など対話ユーザのプロファイルに素直にアクセスできない。ログオントリガー + ユーザ権限（`LogonType Interactive`）なら launchd の `gui/$UID` と同じ発想で動く |
| タスクスケジューラの再起動はログオン + 1分間隔の繰り返しトリガー | ネイティブの「失敗時再起動」機能は再起動回数に上限があり無期限にできない。動作中は `MultipleInstances = IgnoreNew` で多重起動しないため、繰り返しトリガーは実質「落ちたときだけ」効く簡易 watchdog になる |
| node の実行パスを `env.ps1` に固定 | winget install 直後は PATH がそのセッションに反映されないことがある。plist に絶対パスを埋め込む Mac 版と同じ対策 |

### セキュリティ上の約束

- `127.0.0.1` にのみバインド
- **`Origin` 検証 + 専用ヘッダ必須**（`server/lib/origin-guard.ts`）。
  127.0.0.1 バインドは「同じブラウザの別タブ」を防がない。認証を持たないこのアプリでは、
  利用者が開いている無関係なページから `POST /api/convert` を叩かれると、
  **任意のバイト列を ffmpeg のパーサに送り込めてしまう**。
  そこで (1) `Origin` が付いていて自分のものでなければ拒否、
  (2) 変更系には `X-Mp3Converter-Client` を必須にする（カスタムヘッダは必ず
  プリフライトを誘発し、本サーバは CORS 許可を返さないので送信前に落ちる）。
  `curl` から変更系を叩く場合はこのヘッダが要る
- YouTube URL は**ホスト完全一致の許可リスト**で検証（`youtube.com` / `m.` / `music.` / `www.` / `youtu.be`）。前方後方一致にすると `youtube.com.evil.example` を通すため使わない
- 保存名は `jobId` ベースで自前生成。利用者由来の名前は `safeFilename()` で正規化し、表示と `Content-Disposition` にのみ使う
- 拡張子を信用せず `ffprobe` で実コンテンツを検証
- `/reveal` は出力ディレクトリ配下に解決されたパスのみ許可
- 外部プロセスは全て `shell: false` + 配列引数（`server/lib/exec.ts` が唯一の入口）

## 現在の実装状況

[STATUS.md](STATUS.md) を参照。
