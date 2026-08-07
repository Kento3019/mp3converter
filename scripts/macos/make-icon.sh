#!/usr/bin/env bash
#
# Dock 用の .icns を作る。
# 使うのは macOS 標準の sips / iconutil と Node だけ（追加インストール不要）。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:?出力先の .icns パスを指定してください}"
NODE_BIN="${2:-node}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

"$NODE_BIN" "$SCRIPT_DIR/make-icon.mjs" "$WORK/icon.png" >/dev/null

ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$WORK/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$WORK/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$OUT"
