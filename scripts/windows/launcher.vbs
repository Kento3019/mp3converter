' Runs behind the Start Menu / taskbar icon.
' Launches launcher.ps1 hidden (no console flash), no window of its own either.
Dim fso, scriptDir, ps1
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = scriptDir & "\launcher.ps1"

CreateObject("WScript.Shell").Run _
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", _
  0, False
