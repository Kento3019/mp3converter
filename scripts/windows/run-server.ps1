#Requires -Version 5.1
<#
  タスクスケジューラから呼ばれる本体。
  node を起動し、標準出力・標準エラーをログファイルへ追記する。
  macOS 版 launchd の StandardOutPath / StandardErrorPath に相当する。
#>
$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoDir = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$AppDataDir = Join-Path $env:LOCALAPPDATA 'mp3converter'
$LogDir = Join-Path $AppDataDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$ServerLog = Join-Path $LogDir 'server.log'
$ErrorLog = Join-Path $LogDir 'error.log'

# setup.ps1 が書き出した設定（PORT / HOST / node の実パス）。
# node の実パスを PATH 検索に頼らず固定することで、
# 「ターミナルでは動くのに常駐だと見つからない」事故を避ける（macOS 版と同じ対策）。
$EnvFile = Join-Path $AppDataDir 'env.ps1'
if (Test-Path $EnvFile) { . $EnvFile }
$env:NODE_ENV = 'production'

$Node = $env:MP3CONVERTER_NODE
if (-not $Node -or -not (Test-Path $Node)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  $Node = if ($cmd) { $cmd.Source } else { $null }
}

if (-not $Node) {
  "$([DateTime]::Now.ToString('o')) [error] node が見つかりません。scripts\windows\setup.ps1 を再実行してください。" |
    Out-File -FilePath $ErrorLog -Append -Encoding utf8
  exit 1
}

Set-Location $RepoDir
& $Node (Join-Path $RepoDir 'dist\server\index.js') 1>> $ServerLog 2>> $ErrorLog
