#Requires -Version 5.1
<#
  スタートメニュー/タスクバーのアイコンを押したときに走る中身。
  利用者はターミナルを見ない前提なので、失敗はすべてネイティブのダイアログで伝える。
#>

$TaskName = 'MP3Converter'
$AppName = 'MP3コンバーター'

$ScriptDir = $PSScriptRoot
$RepoDir = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$AppDataDir = Join-Path $env:LOCALAPPDATA 'mp3converter'
$LogDir = Join-Path $AppDataDir 'logs'
$EnvFile = Join-Path $AppDataDir 'env.ps1'

$Port = '5487'
if (Test-Path $EnvFile) {
  . $EnvFile
  if ($env:PORT) { $Port = $env:PORT }
}
$Url = "http://127.0.0.1:$Port"

Add-Type -AssemblyName System.Windows.Forms

function Show-Alert([string]$Message) {
  [System.Windows.Forms.MessageBox]::Show(
    $Message, $AppName,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Test-Alive {
  try {
    $response = Invoke-WebRequest -Uri "$Url/api/health" -TimeoutSec 2 -UseBasicParsing
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

# 動いていればそのまま開く。
if (Test-Alive) {
  Start-Process $Url
  exit 0
}

# 自動起動が登録されていない＝セットアップが最後まで終わっていない。
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Show-Alert "セットアップが終わっていません。`n`n導入した人に、次を実行してもらってください。`n`ncd `"$RepoDir`"`n.\scripts\windows\setup.ps1"
  exit 1
}

# 登録はされている。止まっているだけなので起こす。
Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Alive) {
    Start-Process $Url
    exit 0
  }
}

# ここまで来たら本当に起動できていない。原因の手がかりを一緒に見せる。
$errorLog = Join-Path $LogDir 'error.log'
$lastError = if (Test-Path $errorLog) { (Get-Content $errorLog -Tail 3) -join ' ' } else { '' }
if (-not $lastError) { $lastError = '(ログはまだありません)' }

Show-Alert "アプリを起動できませんでした。`n`n導入した人に、次を実行してもらってください。`n`ncd `"$RepoDir`"`n.\scripts\windows\setup.ps1`n`n--- 直前のエラー ---`n$lastError"
exit 1
