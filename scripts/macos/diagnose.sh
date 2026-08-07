#!/usr/bin/env bash
#
# 起動できないときの状況をまとめて表示する。
# 何も書き換えない（読むだけ）。出力をそのまま貼れば原因が分かる。
#
set -u

LABEL="com.local.mp3converter"
APP_NAME="MP3コンバーター"
PORT="${PORT:-5487}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$HOME/Library/Logs/mp3converter"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_DIR="$HOME/Applications/$APP_NAME.app"

head() { printf '\n\033[1;35m>> %s\033[0m\n' "$1"; }

head "この Mac"
echo "  macOS $(sw_vers -productVersion) / $(uname -m)"
echo "  ユーザ: $(id -un) (uid=$(id -u))"

head "置き場所（Desktop/Documents/Downloads だと自動起動できない）"
echo "  $REPO_DIR"
case "$REPO_DIR/" in
"$HOME/Desktop/"* | "$HOME/Documents/"* | "$HOME/Downloads/"* | "$HOME/Library/Mobile Documents/"*)
  echo "  [要修正] macOS の保護対象フォルダの中にある。"
  echo "           launchd から起動したプロセスは、ここを読めない。"
  echo "           mv \"$REPO_DIR\" \"\$HOME/mp3converter\" して setup.sh を再実行する。"
  ;;
*)
  echo "  [OK  ] 保護対象フォルダの外"
  ;;
esac

head "ファイルの持ち主（root になっていたら sudo 汚染）"
for candidate in . node_modules dist package-lock.json storage; do
  target="$REPO_DIR/$candidate"
  if [[ -e "$target" ]]; then
    owner="$(stat -f '%Su' "$target" 2>/dev/null || echo '?')"
    mark="OK  "
    [[ "$owner" != "$(id -un)" ]] && mark="要修正"
    printf '  [%s] %-20s 持ち主: %s\n' "$mark" "$candidate" "$owner"
  else
    printf '  [なし] %-20s\n' "$candidate"
  fi
done

head "ビルド済みか"
for f in dist/server/index.js dist/client/index.html; do
  if [[ -f "$REPO_DIR/$f" ]]; then
    echo "  [OK  ] $f"
  else
    echo "  [なし] $f  → npm run build が必要"
  fi
done

head "必要なソフト"
for name in node ffmpeg ffprobe python3 yt-dlp; do
  path="$(command -v "$name" 2>/dev/null || true)"
  if [[ -n "$path" ]]; then
    echo "  [OK  ] $name -> $path"
  else
    echo "  [なし] $name"
  fi
done
BUNDLED="$REPO_DIR/node_modules/youtube-dl-exec/bin/yt-dlp"
if [[ -f "$BUNDLED" ]]; then
  if [[ -x "$BUNDLED" ]]; then
    echo "  [OK  ] 同梱 yt-dlp（実行可）"
  else
    echo "  [要修正] 同梱 yt-dlp に実行権限がない"
  fi
else
  echo "  [なし] 同梱 yt-dlp"
fi

head "ホーム配下の生成物の持ち主（root だと上書きできない）"
for target in "$HOME/Library/LaunchAgents" "$PLIST_PATH" "$APP_DIR" "$LOG_DIR" "$HOME/Music/$APP_NAME"; do
  if [[ -e "$target" ]]; then
    owner="$(stat -f '%Su' "$target" 2>/dev/null || echo '?')"
    mark="OK  "
    [[ "$owner" != "$(id -un)" ]] && mark="要修正"
    printf '  [%s] 持ち主: %-12s %s\n' "$mark" "$owner" "$target"
  else
    printf '  [なし] %s\n' "$target"
  fi
done

head "自動起動の登録"
if [[ -f "$PLIST_PATH" ]]; then
  echo "  [OK  ] $PLIST_PATH"
  plutil -lint "$PLIST_PATH" 2>&1 | sed 's/^/       /'

  # launchd は group / other に書き込み権のある plist を拒否する。
  # これが Bootstrap failed: 5 の典型的な原因。
  perm="$(stat -f '%Sp' "$PLIST_PATH" 2>/dev/null || echo '?')"
  mode="$(stat -f '%OLp' "$PLIST_PATH" 2>/dev/null || echo '000')"
  echo "       権限: $perm ($mode)  （644 が正しい）"
  # 8 進数の下 2 桁に書き込みビット（2）が立っていたら拒否される。
  group_other="${mode: -2}"
  if [[ "$((0${group_other} & 022))" -ne 0 ]]; then
    echo "       [要修正] group/other に書き込み権がある → chmod 644 \"$PLIST_PATH\""
  fi
else
  echo "  [なし] $PLIST_PATH  → setup.sh が最後まで終わっていない"
fi

if launchctl print "gui/0/$LABEL" >/dev/null 2>&1; then
  echo "  [要修正] root 側にも登録が残っている → sudo launchctl bootout gui/0/$LABEL"
fi

if launchctl print-disabled "gui/$(id -u)" 2>/dev/null | grep -qi "$LABEL.*true"; then
  echo "  [要修正] 無効化されている → launchctl enable gui/$(id -u)/$LABEL"
fi
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "  [OK  ] 常駐に登録されている"
  launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null |
    grep -E "state =|last exit code|pid =" | sed 's/^/       /'
else
  echo "  [なし] 常駐に登録されていない"
fi

head "Dock のアイコン"
if [[ -d "$APP_DIR" ]]; then
  echo "  [OK  ] $APP_DIR"
else
  echo "  [なし] $APP_DIR"
fi

head "応答"
if curl -s -m 3 -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
  echo "  [OK  ] http://127.0.0.1:$PORT につながる"
else
  echo "  [なし] つながらない"
fi
echo "  ポート $PORT の使用状況:"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sed 's/^/       /' || echo "       (誰も使っていない)"

head "launchd が使う設定の点検（exit 78 = EX_CONFIG の原因を特定する）"
probe() {
  if eval "$2" >/dev/null 2>&1; then
    printf '  [OK  ] %s\n' "$1"
  else
    printf '  [要修正] %s\n' "$1"
  fi
}
probe "作業ディレクトリに入れる: $REPO_DIR" "cd '$REPO_DIR'"
probe "本体がある: dist/server/index.js" "[ -f '$REPO_DIR/dist/server/index.js' ]"
probe "標準出力ログに追記できる: $LOG_DIR/server.log" ": >> '$LOG_DIR/server.log'"
probe "標準エラーログに追記できる: $LOG_DIR/error.log" ": >> '$LOG_DIR/error.log'"
if [[ -d "$LOG_DIR" ]]; then
  echo "  ログの持ち主:"
  ls -l "$LOG_DIR" | sed 's/^/    /'
fi

head "直近のエラーログ"
if [[ -f "$LOG_DIR/error.log" ]]; then
  tail -n 20 "$LOG_DIR/error.log" | sed 's/^/  /'
else
  echo "  (まだありません: $LOG_DIR/error.log)"
fi

head "次にやること"
cat <<'NEXT'
  上に「要修正」や「なし」があれば、sudo を付けずに次を実行する。

    ./scripts/macos/setup.sh

  それでも直らないときは、この出力をそのまま渡す。
NEXT
echo
