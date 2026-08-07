#!/bin/bash
#
# Dock のアイコンを押したときに走る中身。
# 利用者はターミナルを見ない前提なので、失敗はすべてネイティブのダイアログで伝える。
#
set -u

LABEL="__LABEL__"
PORT="__PORT__"
URL="http://127.0.0.1:${PORT}"
LOG_DIR="__LOG_DIR__"
REPO_DIR="__REPO_DIR__"

alert() {
  /usr/bin/osascript -e "display alert \"MP3コンバーター\" message \"$1\" as critical buttons {\"OK\"} default button 1" >/dev/null 2>&1
}

is_alive() {
  /usr/bin/curl -s -m 2 -o /dev/null "${URL}/api/health"
}

# 動いていればそのまま開く。
if is_alive; then
  /usr/bin/open "$URL"
  exit 0
fi

# 自動起動が登録されていない＝セットアップが最後まで終わっていない。
if ! /bin/launchctl print "gui/$(/usr/bin/id -u)/${LABEL}" >/dev/null 2>&1; then
  alert "セットアップが終わっていません。

導入した人に、次を実行してもらってください。

cd ${REPO_DIR}
./scripts/macos/setup.sh

（sudo は付けないこと）"
  exit 1
fi

# 登録はされている。止まっているだけなので起こす。
/bin/launchctl kickstart -k "gui/$(/usr/bin/id -u)/${LABEL}" >/dev/null 2>&1

for _ in $(seq 1 15); do
  sleep 1
  if is_alive; then
    /usr/bin/open "$URL"
    exit 0
  fi
done

# ここまで来たら本当に起動できていない。原因の手がかりを一緒に見せる。
LAST_ERROR="$(/usr/bin/tail -n 3 "${LOG_DIR}/error.log" 2>/dev/null | /usr/bin/tr '\n' ' ')"
[ -z "$LAST_ERROR" ] && LAST_ERROR="(ログはまだありません)"

alert "アプリを起動できませんでした。

導入した人に、次を実行してもらってください。

cd ${REPO_DIR}
./scripts/macos/setup.sh

--- 直前のエラー ---
${LAST_ERROR}"
exit 1
