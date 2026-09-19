#Requires -Version 5.1
<#
  MP3コンバーター の常駐とショートカットを取り除く。
  変換した MP3 は消さない。
#>
$ErrorActionPreference = 'Stop'

$AppName = 'MP3コンバーター'
$TaskName = 'MP3Converter'
$ScriptDir = $PSScriptRoot
$RepoDir = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$OutputDir = Join-Path ([Environment]::GetFolderPath('MyMusic')) $AppName
$AppDataDir = Join-Path $env:LOCALAPPDATA 'mp3converter'
$LogDir = Join-Path $AppDataDir 'logs'
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ShortcutPath = Join-Path $StartMenuDir "$AppName.lnk"

function Ok([string]$Message) { Write-Host "   [OK] $Message" -ForegroundColor Green }

Write-Host ''
Write-Host '>> 常駐を止めています' -ForegroundColor Magenta
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Ok '自動起動を解除しました'

if (Test-Path $ShortcutPath) {
  Remove-Item $ShortcutPath -Force
  Ok "ショートカットを削除しました: $ShortcutPath"
}

Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host ' 取り外しが終わりました'
Write-Host '------------------------------------------------------------'
Write-Host ''
Write-Host ' 残してあるもの（必要なら手で消してください）'
Write-Host ''
Write-Host "   変換した MP3   : $OutputDir"
Write-Host "   ログ           : $LogDir"
Write-Host "   プログラム本体 : $RepoDir"
Write-Host ''
Write-Host '------------------------------------------------------------'
Write-Host ''
