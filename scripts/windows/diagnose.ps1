#Requires -Version 5.1
<#
  起動できないときの状況をまとめて表示する。
  何も書き換えない（読むだけ）。出力をそのまま貼れば原因が分かる。
#>

$TaskName = 'MP3Converter'
$AppName = 'MP3コンバーター'
$ScriptDir = $PSScriptRoot
$RepoDir = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$AppDataDir = Join-Path $env:LOCALAPPDATA 'mp3converter'
$LogDir = Join-Path $AppDataDir 'logs'
$EnvFile = Join-Path $AppDataDir 'env.ps1'
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ShortcutPath = Join-Path $StartMenuDir "$AppName.lnk"

$Port = '5487'
if (Test-Path $EnvFile) {
  . $EnvFile
  if ($env:PORT) { $Port = $env:PORT }
}

function Section([string]$Title) { Write-Host ''; Write-Host ">> $Title" -ForegroundColor Magenta }

Section 'この Windows'
Write-Host "  $([System.Environment]::OSVersion.VersionString)"
Write-Host "  ユーザ: $env:USERNAME"

Section '置き場所'
Write-Host "  $RepoDir"

Section 'ビルド済みか'
foreach ($f in 'dist\server\index.js', 'dist\client\index.html') {
  $full = Join-Path $RepoDir $f
  if (Test-Path $full) {
    Write-Host "  [OK  ] $f"
  } else {
    Write-Host "  [なし] $f  -> npm run build が必要"
  }
}

Section '必要なソフト'
foreach ($name in 'node', 'ffmpeg', 'ffprobe', 'python', 'yt-dlp') {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    Write-Host "  [OK  ] $name -> $($cmd.Source)"
  } else {
    Write-Host "  [なし] $name"
  }
}
$bundled = Join-Path $RepoDir 'node_modules\youtube-dl-exec\bin\yt-dlp.exe'
if (Test-Path $bundled) {
  Write-Host '  [OK  ] 同梱 yt-dlp'
} else {
  Write-Host '  [なし] 同梱 yt-dlp'
}

Section '設定ファイル（PORT / HOST / node の実パス）'
if (Test-Path $EnvFile) {
  Write-Host "  [OK  ] $EnvFile"
} else {
  Write-Host "  [なし] $EnvFile  -> setup.ps1 が最後まで終わっていない"
}

Section 'スタートメニューのショートカット'
if (Test-Path $ShortcutPath) {
  Write-Host "  [OK  ] $ShortcutPath"
} else {
  Write-Host "  [なし] $ShortcutPath"
}

Section '自動起動の登録'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Write-Host "  [OK  ] タスク「$TaskName」が登録されています（状態: $($task.State)）"
  $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($info) {
    Write-Host "         最終実行: $($info.LastRunTime)  最終結果: $($info.LastTaskResult)（0 が正常）"
  }
} else {
  Write-Host "  [なし] タスク「$TaskName」が登録されていません  -> setup.ps1 が最後まで終わっていない"
}

Section '応答'
try {
  $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3 -UseBasicParsing
  if ($response.StatusCode -eq 200) { Write-Host "  [OK  ] http://127.0.0.1:$Port につながる" }
} catch {
  Write-Host '  [なし] つながらない'
}
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "  ポート $Port を使っている PID: $(($listening.OwningProcess | Select-Object -Unique) -join ', ')"
} else {
  Write-Host "  ポート $Port は誰も使っていない"
}

Section '直近のエラーログ'
$errorLog = Join-Path $LogDir 'error.log'
if (Test-Path $errorLog) {
  Get-Content $errorLog -Tail 20
} else {
  Write-Host "  (まだありません: $errorLog)"
}

Section '次にやること'
Write-Host '  上に「なし」があれば、次を実行する。'
Write-Host ''
Write-Host '    .\scripts\windows\setup.ps1'
Write-Host ''
Write-Host '  それでも直らないときは、この出力をそのまま渡す。'
Write-Host ''
