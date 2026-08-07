#!/usr/bin/env bash
#
# MP3コンバーター の常駐とアイコンを取り除く。
# 変換した MP3 は消さない。
#
set -euo pipefail

APP_NAME="MP3コンバーター"
LABEL="com.local.mp3converter"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_DIR="$HOME/Applications/$APP_NAME.app"
OUTPUT_DIR="$HOME/Music/$APP_NAME"
LOG_DIR="$HOME/Library/Logs/mp3converter"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ok() { printf '   \033[32m[OK]\033[0m %s\n' "$1"; }

printf '\n\033[1;35m>> 常駐を止めています\033[0m\n'
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
ok "自動起動を解除しました"

if [[ -f "$PLIST_PATH" ]]; then
  rm -f "$PLIST_PATH"
  ok "登録ファイルを削除しました: $PLIST_PATH"
fi

if [[ -d "$APP_DIR" ]]; then
  rm -rf "$APP_DIR"
  ok "アイコンを削除しました: $APP_DIR"
fi

cat <<DONE

------------------------------------------------------------
 取り外しが終わりました
------------------------------------------------------------

 残してあるもの（必要なら手で消してください）

   変換した MP3   : $OUTPUT_DIR
   ログ           : $LOG_DIR
   プログラム本体 : $REPO_DIR

------------------------------------------------------------

DONE
