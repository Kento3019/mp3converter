#!/usr/bin/env bash
#
# MP3コンバーター を Mac に導入する。
# 何度実行しても同じ結果になる（冪等）。更新したいときも、このスクリプトを再実行するだけ。
#
set -euo pipefail

APP_NAME="MP3コンバーター"
LABEL="com.local.mp3converter"
PORT="${PORT:-5487}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
APP_DIR="$HOME/Applications/$APP_NAME.app"
LOG_DIR="$HOME/Library/Logs/mp3converter"
OUTPUT_DIR="$HOME/Music/$APP_NAME"

step() { printf '\n\033[1;35m>> %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$1"; }
ok() { printf '   \033[32m[OK]\033[0m %s\n' "$1"; }
die() {
  printf '\n\033[1;31m[NG] %s\033[0m\n\n' "$1" >&2
  exit 1
}

# ---------------------------------------------------------------- 1. 前提確認

step "この Mac を確認しています"

[[ "$(uname -s)" == "Darwin" ]] || die "このスクリプトは macOS 専用です。"
ok "macOS $(sw_vers -productVersion) / $(uname -m)"

# sudo で実行すると node_modules と dist が root 所有になる。
# 常駐は「あなたのユーザ権限」で動くため、root 所有だと読めずに起動できなくなる。
if [[ "$(id -u)" -eq 0 ]]; then
  die "sudo を付けずに実行してください。

  このアプリはあなたのユーザ権限で動きます。
  sudo で入れると持ち主が root になり、自動起動できなくなります。

    ./scripts/macos/setup.sh"
fi

# macOS のプライバシー保護（TCC）は Desktop / Documents / Downloads を守る。
# ターミナルからは読めても、launchd が起動したプロセスは確認ダイアログすら出ずに
# 拒否されるため、「手動なら動くのに自動起動だけ即死する」という症状になる。
case "$REPO_DIR/" in
"$HOME/Desktop/"* | "$HOME/Documents/"* | "$HOME/Downloads/"* | "$HOME/Library/Mobile Documents/"*)
  die "置き場所が悪いため、自動起動できません。

  今の場所: $REPO_DIR

  macOS はデスクトップ・書類・ダウンロードのフォルダを保護しており、
  自動起動（launchd）から起動したプログラムはここを読めません。
  ターミナルから手で動かしたときだけ動く、という状態になります。

  次のように移してから、もう一度実行してください。

    mv \"$REPO_DIR\" \"\$HOME/mp3converter\"
    cd \"\$HOME/mp3converter\"
    ./scripts/macos/setup.sh"
  ;;
esac
ok "置き場所: $REPO_DIR"

# 過去に sudo で実行してしまった痕跡を直す。
# リポジトリの中だけでなく、ホーム配下に作られた plist / .app / ログも対象にする。
# root が作った plist が残っていると、書き換えようとして Permission denied になる。
ME="$(id -u)"

owned_by_me() {
  [[ "$(stat -f '%u' "$1" 2>/dev/null || echo "$ME")" == "$ME" ]]
}

# LaunchAgents ディレクトリ自体が root 所有だと plist を置けない。
# 他アプリの plist を巻き込まないよう、ここだけ -R を付けない。
if [[ -d "$LAUNCH_AGENTS_DIR" ]] && ! owned_by_me "$LAUNCH_AGENTS_DIR"; then
  info "$LAUNCH_AGENTS_DIR の持ち主が別ユーザです。戻します。"
  sudo chown "$(id -u):$(id -g)" "$LAUNCH_AGENTS_DIR"
  ok "戻しました"
fi

BAD_PATHS=()
for target in \
  "$REPO_DIR/node_modules" \
  "$REPO_DIR/dist" \
  "$REPO_DIR/package-lock.json" \
  "$REPO_DIR/storage" \
  "$PLIST_PATH" \
  "$APP_DIR" \
  "$LOG_DIR" \
  "$OUTPUT_DIR"; do
  [[ -e "$target" ]] || continue
  owned_by_me "$target" || BAD_PATHS+=("$target")
done

if [[ ${#BAD_PATHS[@]} -gt 0 ]]; then
  info "以前 sudo で実行した形跡があります。持ち主をあなたに戻します。"
  for target in "${BAD_PATHS[@]}"; do info "  $target"; done
  info "管理者パスワードの入力を求められます。"
  sudo chown -R "$(id -u):$(id -g)" "${BAD_PATHS[@]}"
  ok "持ち主を戻しました"
fi

# root 側の launchd に残っていると、こちらの登録と衝突する。
sudo launchctl bootout "gui/0/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "gui/$ME/$LABEL" >/dev/null 2>&1 || true

# Homebrew の場所は Apple Silicon と Intel で違う。両方を見る。
BREW=""
for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [[ -x "$candidate" ]]; then
    BREW="$candidate"
    break
  fi
done
[[ -z "$BREW" ]] && BREW="$(command -v brew || true)"

if [[ -z "$BREW" ]]; then
  die "Homebrew が入っていません。
  先に次を実行してから、もう一度このスクリプトを動かしてください。

    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

  （管理者パスワードの入力が必要なため、自動では実行しません）"
fi

BREW_BIN="$(dirname "$BREW")"
export PATH="$BREW_BIN:$PATH"
ok "Homebrew: $BREW"

# --------------------------------------------------- 2. 足りないソフトを入れる

step "必要なソフトを確認しています"

install_if_missing() {
  local command_name="$1" formula="$2" label="$3"
  if command -v "$command_name" >/dev/null 2>&1; then
    ok "$label は入っています"
    return
  fi
  info "$label が無いので入れます（brew install $formula）…"
  "$BREW" install "$formula"
  ok "$label を入れました"
}

install_if_missing node node "Node.js"
install_if_missing ffmpeg ffmpeg "変換ソフト（ffmpeg）"
install_if_missing python3 python "Python 3"

NODE_BIN="$(command -v node)"
ok "Node.js: $NODE_BIN ($("$NODE_BIN" --version))"

# ------------------------------------------------------------ 3. アプリを組む

step "アプリを組み立てています（数分かかります）"

cd "$REPO_DIR"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

BUILD_LOG="$(mktemp)"
set +e
npm run build 2>&1 | tee "$BUILD_LOG"
BUILD_STATUS=${PIPESTATUS[0]}
set -e

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  # npm の既知の不具合（optional dependencies）。
  # package-lock.json に該当プラットフォームのバイナリが記載されていても、
  # npm ci が実際にはインストールしないことがある。
  # https://github.com/npm/cli/issues/4828
  # npm 自身が案内する通り、node_modules と package-lock.json を作り直せば直る。
  if grep -qiE "native binding|optional dependencies" "$BUILD_LOG"; then
    info "既知の npm の不具合（optional dependencies）を検知しました。node_modules を作り直します…"
    rm -rf node_modules package-lock.json
    npm install
    npm run build
    info "package-lock.json が更新されました。git で差分を確認し、問題なければコミットしてください。"
  else
    rm -f "$BUILD_LOG"
    die "npm run build に失敗しました。上のログを確認してください。"
  fi
fi
rm -f "$BUILD_LOG"
ok "組み立てが終わりました"

# youtube-dl-exec の同梱バイナリを確かめる。
# ダウンロードに失敗することがあるので、駄目なら Homebrew に切り替える。
step "YouTube 取得ソフト（yt-dlp）を確認しています"

YTDLP="$REPO_DIR/node_modules/youtube-dl-exec/bin/yt-dlp"
YTDLP_READY=0

if [[ -f "$YTDLP" ]]; then
  # 実行権限が落ちていることがあるので付け直す。
  chmod +x "$YTDLP" 2>/dev/null || true
  if version="$("$YTDLP" --version 2>/dev/null)"; then
    ok "同梱版を使います: $version"
    YTDLP_READY=1
  fi
fi

if [[ "$YTDLP_READY" -ne 1 ]]; then
  info "同梱版が使えないので Homebrew から入れます…"
  "$BREW" install yt-dlp || true
  if command -v yt-dlp >/dev/null 2>&1; then
    ok "Homebrew 版を使います: $(yt-dlp --version 2>/dev/null || echo '不明')"
  else
    die "YouTube 取得ソフト（yt-dlp）を用意できませんでした。
  ネットワークを確認してから、もう一度このスクリプトを実行してください。
  手動で入れる場合: brew install yt-dlp"
  fi
fi

step "必要なソフトの最終確認"
npm run doctor

# ---------------------------------------------------------- 4. 置き場所を作る

# git clone の仕方によっては実行権限が落ちることがある。
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true

step "保存先とログの置き場所を用意しています"
mkdir -p "$OUTPUT_DIR" "$LOG_DIR" "$LAUNCH_AGENTS_DIR" "$HOME/Applications"
ok "MP3 の保存先: $OUTPUT_DIR"

# launchd は StandardOutPath / StandardErrorPath を自分で open する。
# 以前 root で常駐させた名残でログファイルが root 所有だと、ここで失敗し
# ジョブは exit code 78 (EX_CONFIG) で即死する。プログラムは一切動かない。
for logfile in "$LOG_DIR/server.log" "$LOG_DIR/error.log"; do
  if [[ -e "$logfile" ]] && ! owned_by_me "$logfile"; then
    info "$(basename "$logfile") の持ち主が別ユーザです。作り直します。"
    sudo rm -f "$logfile"
  fi
  # 実際に追記できるか確かめる。駄目なら消して作り直す。
  if ! : >>"$logfile" 2>/dev/null; then
    sudo rm -f "$logfile" 2>/dev/null || true
    : >>"$logfile" || die "ログを書き込めません: $logfile"
  fi
done
ok "ログ: $LOG_DIR"

# -------------------------------------------------------- 5. Dock のアイコン

step "Dock のアイコンを作っています"

# .app は「この Mac の上で」作る。ダウンロードしたものではないので
# com.apple.quarantine が付かず、Gatekeeper の警告が出ない。
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

sed -e "s|__LABEL__|$LABEL|g" \
  -e "s|__PORT__|$PORT|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__REPO_DIR__|$REPO_DIR|g" \
  "$SCRIPT_DIR/launcher.sh.tpl" >"$APP_DIR/Contents/MacOS/launcher"
chmod +x "$APP_DIR/Contents/MacOS/launcher"

cat >"$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$LABEL.launcher</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# アイコンが作れなくても導入は続ける（見た目の問題にすぎない）。
if bash "$SCRIPT_DIR/make-icon.sh" "$APP_DIR/Contents/Resources/icon.icns" "$NODE_BIN" 2>/dev/null; then
  ok "アイコンを作りました"
else
  info "アイコンは作れませんでしたが、動作には影響しません"
fi

# Finder にアイコンの変更を伝える。
touch "$APP_DIR"
ok "アプリ: $APP_DIR"

# ---------------------------------------------------- 6. 自動起動の登録

step "パソコン起動時に自動で立ち上がるよう登録しています"

PLIST_TMP="$(mktemp)"
sed -e "s|__LABEL__|$LABEL|g" \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__REPO_DIR__|$REPO_DIR|g" \
  -e "s|__PORT__|$PORT|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__BREW_BIN__|$BREW_BIN|g" \
  -e "s|__HOME__|$HOME|g" \
  -e "s|__USER__|$(id -un)|g" \
  -e "s|__TMPDIR__|${TMPDIR:-/tmp}|g" \
  "$SCRIPT_DIR/com.local.mp3converter.plist.tpl" >"$PLIST_TMP"

# 既存が root 所有だと上書きできない。消せなければ理由を出して止める。
if ! mv -f "$PLIST_TMP" "$PLIST_PATH" 2>/dev/null; then
  rm -f "$PLIST_TMP"
  die "登録ファイルを書き込めませんでした（Permission denied）。

  $PLIST_PATH

  以前 sudo で実行したときに root が作ったファイルが残っています。
  次で消してから、もう一度このスクリプトを実行してください。

    sudo rm -f \"$PLIST_PATH\""
fi

# launchd は group / other に書き込み権のある plist を拒否する
# （Bootstrap failed: 5: Input/output error の典型的な原因）。
chmod 644 "$PLIST_PATH"
chmod go-w "$LAUNCH_AGENTS_DIR" 2>/dev/null || true

# plist として妥当か確かめてから登録する。
plutil -lint "$PLIST_PATH" >/dev/null 2>&1 || die "登録ファイルの形式が不正です: $PLIST_PATH"

# load / unload は 10.10 以降 deprecated で Apple Silicon 上の挙動が不安定なため
# bootstrap / bootout を使う。
#
# "Bootstrap failed: 5: Input/output error" は主に次の 3 つで起きる。
#   1) 同じラベルが既に登録されている        → bootout で外す
#   2) そのラベルが disable されている        → enable で戻す
#   3) plist が group/other 書き込み可        → 上で chmod 644 済み
# 3 つとも潰してから登録する。
try_bootstrap() {
  launchctl bootout "gui/$ME/$LABEL" >/dev/null 2>&1 || true
  launchctl enable "gui/$ME/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$ME" "$PLIST_PATH" 2>&1
}

BOOTSTRAP_ERR="$(try_bootstrap)" || {
  # 1 回目は取りこぼすことがあるので、間を置いて 1 度だけやり直す。
  sleep 2
  BOOTSTRAP_ERR="$(try_bootstrap)" || {
    printf '\n\033[1;31m[NG] 自動起動の登録に失敗しました。\033[0m\n\n' >&2
    echo "  launchctl の出力: $BOOTSTRAP_ERR" >&2
    echo "" >&2
    echo "  --- 今の状態 ---" >&2
    echo "  plist の権限: $(stat -f '%Sp %Su:%Sg' "$PLIST_PATH" 2>/dev/null || echo '読めない')" >&2
    echo "               （-rw-r--r-- で、持ち主が $(id -un) である必要がある）" >&2
    echo "  無効化の有無:" >&2
    launchctl print-disabled "gui/$ME" 2>/dev/null | grep -i mp3converter | sed 's/^/    /' >&2 ||
      echo "    (該当なし)" >&2
    echo "" >&2
    echo "  --- 手で直す ---" >&2
    cat >&2 <<MANUAL
    sudo launchctl bootout gui/0/$LABEL 2>/dev/null
    launchctl bootout gui/$ME/$LABEL 2>/dev/null
    launchctl enable gui/$ME/$LABEL
    chmod 644 "$PLIST_PATH"
    launchctl bootstrap gui/$ME "$PLIST_PATH"
MANUAL
    echo "" >&2
    exit 1
  }
}
ok "登録しました: $PLIST_PATH"

# --------------------------------------------------------------- 7. 疎通確認

step "動き始めるのを待っています"

STARTED=0
for _ in $(seq 1 30); do
  if curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
    STARTED=1
    break
  fi
  sleep 1
done

if [[ "$STARTED" -ne 1 ]]; then
  printf '\n\033[1;31m[NG] 起動を確認できませんでした。\033[0m\n\n' >&2

  echo "--- launchd の状態 ---" >&2
  launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null |
    grep -E "state =|last exit code|active count|path =" | sed 's/^/  /' >&2

  echo "" >&2
  echo "--- $LOG_DIR/error.log の末尾 ---" >&2
  if [[ -s "$LOG_DIR/error.log" ]]; then
    tail -n 20 "$LOG_DIR/error.log" | sed 's/^/  /' >&2
  else
    echo "  (空)" >&2
  fi

  # exit code 78 (EX_CONFIG) は launchd がジョブを構成できなかったという意味で、
  # プログラムの異常ではない。launchd が触る対象を 1 つずつ確かめる。
  echo "" >&2
  echo "--- launchd が使う設定の点検 ---" >&2
  probe() {
    if eval "$2" >/dev/null 2>&1; then
      printf '  [OK  ] %s\n' "$1" >&2
    else
      printf '  [NG  ] %s\n' "$1" >&2
    fi
  }
  probe "作業ディレクトリに入れる: $REPO_DIR" "cd '$REPO_DIR'"
  probe "本体がある: dist/server/index.js" "[ -f '$REPO_DIR/dist/server/index.js' ]"
  probe "node が実行できる: $NODE_BIN" "'$NODE_BIN' --version"
  probe "標準出力ログに追記できる" ": >> '$LOG_DIR/server.log'"
  probe "標準エラーログに追記できる" ": >> '$LOG_DIR/error.log'"
  echo "  ログの持ち主:" >&2
  ls -l "$LOG_DIR" 2>/dev/null | sed 's/^/    /' >&2

  echo "" >&2
  echo "--- 手で起動して確かめる ---" >&2
  echo "  cd \"$REPO_DIR\" && \"$NODE_BIN\" dist/server/index.js" >&2
  echo "" >&2
  exit 1
fi

ok "動いています: http://127.0.0.1:$PORT"
open "http://127.0.0.1:$PORT"

# ----------------------------------------------------------------- 8. 案内

cat <<DONE

------------------------------------------------------------
 導入が終わりました
------------------------------------------------------------

 使い方（利用者に伝えること）

   1. Launchpad か「アプリケーション」フォルダの
      「$APP_NAME」を Dock に入れておく
   2. あとはそのアイコンを押すだけ
   3. できた MP3 は $OUTPUT_DIR に入る

 知っておいてほしいこと

   ・パソコンを起動すると自動で待機します。手順は要りません。
   ・macOS が「バックグラウンド項目が追加されました」と
     通知することがあります。これは正常です。
     システム設定 > 一般 > ログイン項目 に表示されます。
     ここを切ると自動起動しなくなります。
   ・止めたいとき:   ./scripts/macos/uninstall.sh
   ・更新したいとき: git pull してから、このスクリプトを再実行

------------------------------------------------------------

DONE
