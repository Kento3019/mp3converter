#Requires -Version 5.1
<#
  MP3コンバーター を Windows 11 に導入する。
  何度実行しても同じ結果になる（冪等）。更新したいときも、このスクリプトを再実行するだけ。
#>
$ErrorActionPreference = 'Stop'

$AppName = 'MP3コンバーター'
$TaskName = 'MP3Converter'
$Port = if ($env:PORT) { $env:PORT } else { '5487' }

$ScriptDir = $PSScriptRoot
$RepoDir = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$AppDataDir = Join-Path $env:LOCALAPPDATA 'mp3converter'
$LogDir = Join-Path $AppDataDir 'logs'
$OutputDir = Join-Path ([Environment]::GetFolderPath('MyMusic')) $AppName
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ShortcutPath = Join-Path $StartMenuDir "$AppName.lnk"
$IconPath = Join-Path $AppDataDir 'icon.ico'
$EnvFile = Join-Path $AppDataDir 'env.ps1'

function Step([string]$Message) { Write-Host ''; Write-Host ">> $Message" -ForegroundColor Magenta }
function Info([string]$Message) { Write-Host "   $Message" }
function Ok([string]$Message) { Write-Host "   [OK] $Message" -ForegroundColor Green }
function Die([string]$Message) {
  Write-Host ''
  Write-Host "[NG] $Message" -ForegroundColor Red
  Write-Host ''
  exit 1
}

# ---------------------------------------------------------------- 1. 前提確認

Step 'この Windows を確認しています'
Ok "$([System.Environment]::OSVersion.VersionString)"

# 管理者として実行すると、ユーザ権限で動くはずのタスク登録やショートカットが
# 崩れる事故につながる。このアプリはあなたのユーザ権限で常駐する。
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([Security.Principal.WindowsPrincipal]$currentIdentity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
  Die "管理者として実行しないでください。`n`n  通常の（管理者権限ではない）PowerShell から実行し直してください。`n`n    .\scripts\windows\setup.ps1"
}
Ok "置き場所: $RepoDir"

# --------------------------------------------------- 2. 足りないソフトを入れる

Step '必要なソフトを確認しています'

function Update-SessionPath {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  Die "winget が見つかりません。`n`n  Microsoft Store で「アプリ インストーラー」を更新してから、`n  もう一度このスクリプトを実行してください。"
}
Ok "winget: $($winget.Source)"

function Install-IfMissing {
  param([string]$CommandName, [string]$WingetId, [string]$Label)
  if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
    Ok "$Label は入っています"
    return
  }
  Info "$Label が無いので入れます（winget install $WingetId）…"
  winget install --id $WingetId -e --silent --accept-package-agreements --accept-source-agreements
  Update-SessionPath
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    Die "$Label を入れられませんでした。手動で次を実行してください。`n`n    winget install --id $WingetId -e"
  }
  Ok "$Label を入れました"
}

Install-IfMissing -CommandName 'node' -WingetId 'OpenJS.NodeJS.LTS' -Label 'Node.js'
Install-IfMissing -CommandName 'ffmpeg' -WingetId 'Gyan.FFmpeg' -Label '変換ソフト（ffmpeg）'
Install-IfMissing -CommandName 'python' -WingetId 'Python.Python.3.12' -Label 'Python 3'

Update-SessionPath
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Die '入れた直後ですが Node.js が見つかりません。PowerShell を開き直してもう一度実行してください。'
}
$NodeBin = $NodeCmd.Source
$NodeVersion = (& $NodeBin --version).TrimStart('v')

# winget の OpenJS.NodeJS.LTS はマニフェストの更新が遅れ、
# vite/rolldown が要求する最低版（22.12.0）より古い Node が入ることがある
# （実機で node 22.11.0 のとき `npm warn EBADENGINE` と共に発生を確認）。
$MinNodeVersion = [Version]'22.12.0'
if ([Version]$NodeVersion -lt $MinNodeVersion) {
  Info "Node.js が古い（$NodeVersion）ので更新します（winget upgrade OpenJS.NodeJS.LTS）…"
  winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  Update-SessionPath
  $NodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($NodeCmd) { $NodeBin = $NodeCmd.Source }
  $NodeVersion = (& $NodeBin --version).TrimStart('v')
  if ([Version]$NodeVersion -lt $MinNodeVersion) {
    Die "Node.js が $MinNodeVersion 未満のままです（現在: $NodeVersion）。`n`n  手動で次を実行してから、もう一度このスクリプトを実行してください。`n`n    winget upgrade --id OpenJS.NodeJS.LTS -e"
  }
}
Ok "Node.js: $NodeBin ($NodeVersion)"

# ------------------------------------------------------------ 3. アプリを組む

Step 'アプリを組み立てています（数分かかります）'
Set-Location $RepoDir

if (Test-Path (Join-Path $RepoDir 'package-lock.json')) {
  npm ci
} else {
  npm install
}
if ($LASTEXITCODE -ne 0) { Die 'npm install に失敗しました。上のログを確認してください。' }

# 2>&1 で結合した stderr は Windows PowerShell 上で ErrorRecord になる。
# $ErrorActionPreference = 'Stop' のままだと、npm が stderr に何か書いただけで
# （実際の失敗より前に）スクリプト全体が即座に終了してしまう
# （このため一度、下の自動リカバリに一切入らず落ちた）。
# この呼び出しの間だけ 'Continue' に戻し、直後に元へ戻す。
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npm run build 2>&1 | Tee-Object -Variable buildOutput
$buildExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$buildLog = $buildOutput -join "`n"

if ($buildExitCode -ne 0) {
  # npm の既知の不具合（optional dependencies）。
  # package-lock.json に該当プラットフォームのバイナリが記載されていても、
  # npm ci が実際にはインストールしないことがある。
  # https://github.com/npm/cli/issues/4828
  # npm 自身が案内する通り、node_modules と package-lock.json を作り直せば直る。
  if ($buildLog -match 'native binding' -or $buildLog -match 'optional dependencies') {
    Info '既知の npm の不具合（optional dependencies）を検知しました。node_modules を作り直します…'
    Remove-Item -Recurse -Force (Join-Path $RepoDir 'node_modules') -ErrorAction SilentlyContinue
    Remove-Item -Force (Join-Path $RepoDir 'package-lock.json') -ErrorAction SilentlyContinue

    npm install
    if ($LASTEXITCODE -ne 0) { Die 'npm install に失敗しました（作り直し後）。上のログを確認してください。' }

    npm run build
    if ($LASTEXITCODE -ne 0) { Die 'npm run build に失敗しました（作り直し後も）。上のログを確認してください。' }

    Info 'package-lock.json が更新されました。git で差分を確認し、問題なければコミットしてください。'
  } else {
    Die 'npm run build に失敗しました。上のログを確認してください。'
  }
}
Ok '組み立てが終わりました'

# -------------------------------------------------- 4. yt-dlp を確認する

Step 'YouTube 取得ソフト（yt-dlp）を確認しています'

$Ytdlp = Join-Path $RepoDir 'node_modules\youtube-dl-exec\bin\yt-dlp.exe'
$YtdlpReady = $false

if (Test-Path $Ytdlp) {
  $version = & $Ytdlp --version 2>$null
  if ($LASTEXITCODE -eq 0 -and $version) {
    Ok "同梱版を使います: $version"
    $YtdlpReady = $true
  }
}

if (-not $YtdlpReady) {
  Info '同梱版が使えないので winget から入れます…'
  winget install --id yt-dlp.yt-dlp -e --silent --accept-package-agreements --accept-source-agreements
  Update-SessionPath
  if (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    Ok "winget 版を使います: $(yt-dlp --version 2>$null)"
  } else {
    Die "YouTube 取得ソフト（yt-dlp）を用意できませんでした。`n  ネットワークを確認してから、もう一度このスクリプトを実行してください。`n  手動で入れる場合: winget install --id yt-dlp.yt-dlp -e"
  }
}

Step '必要なソフトの最終確認'
npm run doctor
if ($LASTEXITCODE -ne 0) { Die '足りないソフトがあります。上の「→」の手順を実行してからもう一度実行してください。' }

# ---------------------------------------------------------- 5. 置き場所を作る

Step '保存先とログの置き場所を用意しています'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
Ok "MP3 の保存先: $OutputDir"
Ok "ログ: $LogDir"

# run-server.ps1 / launcher.ps1 が読む設定。
# PORT/HOST/node の実パスをここに固定し、PATH 検索の揺れに左右されないようにする。
Set-Content -Path $EnvFile -Encoding utf8 -Value @"
`$env:PORT = '$Port'
`$env:HOST = '127.0.0.1'
`$env:MP3CONVERTER_NODE = '$NodeBin'
"@
Ok "設定を保存しました: $EnvFile"

# --------------------------------------------------- 6. アイコンとショートカット

Step 'アイコンを作っています'
try {
  & $NodeBin (Join-Path $ScriptDir 'make-icon.mjs') $IconPath | Out-Null
  Ok 'アイコンを作りました'
} catch {
  Info 'アイコンは作れませんでしたが、動作には影響しません'
}

Step 'スタートメニューのショートカットを作っています'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shortcut.Arguments = '"' + (Join-Path $ScriptDir 'launcher.vbs') + '"'
$shortcut.WorkingDirectory = $RepoDir
$shortcut.Description = $AppName
if (Test-Path $IconPath) { $shortcut.IconLocation = $IconPath }
$shortcut.Save()
Ok "ショートカット: $ShortcutPath"

# ------------------------------------------------------- 7. 自動起動の登録

Step 'パソコン起動時に自動で立ち上がるよう登録しています'

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $ScriptDir 'run-server.ps1') + '"')

$userName = $currentIdentity.Name
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userName

# 落ちても 1 分以内に起こすための「見張りトリガー」。
# サーバが動いている間は MultipleInstances=IgnoreNew により次の発火が無視されるため、
# 二重起動はしない。RepetitionDuration はカレンダー的な有効期限で、
# 一旦 10 年で作ってから空文字列に上書きして無期限にする（New-ScheduledTaskTrigger の仕様）。
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$watchdogTrigger.Repetition.Duration = ''
$watchdogTrigger.Repetition.StopAtDurationEnd = $false

$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName `
  -Action $action `
  -Trigger $logonTrigger, $watchdogTrigger `
  -Principal $principal `
  -Settings $settings `
  -Description "$AppName の常駐サーバ" | Out-Null

Ok "登録しました: タスク「$TaskName」"
Start-ScheduledTask -TaskName $TaskName

# --------------------------------------------------------------- 8. 疎通確認

Step '動き始めるのを待っています'

$started = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200) { $started = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}

if (-not $started) {
  Write-Host ''
  Write-Host '[NG] 起動を確認できませんでした。' -ForegroundColor Red
  Write-Host ''
  Write-Host '--- タスクの状態 ---'
  Get-ScheduledTaskInfo -TaskName $TaskName | Format-List LastRunTime, LastTaskResult, NextRunTime

  Write-Host ''
  Write-Host "--- $LogDir\error.log の末尾 ---"
  $errorLog = Join-Path $LogDir 'error.log'
  if (Test-Path $errorLog) {
    Get-Content $errorLog -Tail 20
  } else {
    Write-Host '  (空)'
  }

  Write-Host ''
  Write-Host '--- 手で起動して確かめる ---'
  Write-Host "  cd `"$RepoDir`"; & `"$NodeBin`" dist\server\index.js"
  Write-Host ''
  exit 1
}

Ok "動いています: http://127.0.0.1:$Port"
Start-Process "http://127.0.0.1:$Port"

# ----------------------------------------------------------------- 9. 案内

Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host ' 導入が終わりました'
Write-Host '------------------------------------------------------------'
Write-Host ''
Write-Host ' 使い方（利用者に伝えること）'
Write-Host ''
Write-Host "   1. スタートメニューで「$AppName」を検索し、タスクバーにピン留めする"
Write-Host '   2. あとはそのアイコンを押すだけ'
Write-Host "   3. できた MP3 は $OutputDir に入る"
Write-Host ''
Write-Host ' 知っておいてほしいこと'
Write-Host ''
Write-Host '   ・パソコンを起動すると自動で待機します。手順は要りません。'
Write-Host '   ・止めたいとき:   .\scripts\windows\uninstall.ps1'
Write-Host '   ・更新したいとき: git pull してから、このスクリプトを再実行'
Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host ''
