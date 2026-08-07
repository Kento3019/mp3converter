<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>__LABEL__</string>

  <key>ProgramArguments</key>
  <array>
    <string>__NODE__</string>
    <string>__REPO_DIR__/dist/server/index.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>__REPO_DIR__</string>

  <!-- ログイン時に起動し、落ちたら自動で復帰する -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <!--
    launchd 配下では .zshrc の PATH が効かない。
    Homebrew の場所を明示しないと ffmpeg を見失う。
  -->
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>__BREW_BIN__:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <!--
      launchd はターミナルの環境を引き継がない。
      HOME が無いと保存先の解決や npm/yt-dlp のキャッシュ書き込みが崩れるため明示する。
    -->
    <key>HOME</key>
    <string>__HOME__</string>
    <key>USER</key>
    <string>__USER__</string>
    <key>LOGNAME</key>
    <string>__USER__</string>
    <key>TMPDIR</key>
    <string>__TMPDIR__</string>
    <key>PORT</key>
    <string>__PORT__</string>
    <key>HOST</key>
    <string>127.0.0.1</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>

  <key>StandardOutPath</key>
  <string>__LOG_DIR__/server.log</string>
  <key>StandardErrorPath</key>
  <string>__LOG_DIR__/error.log</string>

  <!-- 起動失敗時に暴走しないよう、再起動の間隔を空ける -->
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
