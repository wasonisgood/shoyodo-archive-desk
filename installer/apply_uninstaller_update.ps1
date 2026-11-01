$targetDir = "$env:LocalAppData\Programs\ShoyodoArchiveDesk"
$exePath = "$targetDir\蕉葉堂巡回台帳.exe"
$uninstallerPath = "$targetDir\uninstall.exe"
$iconPath = "$targetDir\app.ico"

if (-not (Test-Path $targetDir)) {
    New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
}

# 1. 複製 uninstall.exe 與 app.ico 到安裝目錄
Copy-Item "C:\Users\user\code\old-thing-search\installer\uninstall.exe" $uninstallerPath -Force
Copy-Item "C:\Users\user\code\old-thing-search\app.ico" $iconPath -Force

# 2. 登錄註冊表
$regKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk'
if (Test-Path $regKey) {
    Set-ItemProperty -Path $regKey -Name 'UninstallString' -Value "`"$uninstallerPath`""
    Set-ItemProperty -Path $regKey -Name 'QuietUninstallString' -Value "`"$uninstallerPath`" /quiet"
    Set-ItemProperty -Path $regKey -Name 'DisplayIcon' -Value "$iconPath,0"
}

# 3. 更新桌面與開始功能表捷徑 Icon
$wsh = New-Object -ComObject WScript.Shell

$desk = [Environment]::GetFolderPath('Desktop')
$deskLnk = "$desk\蕉葉堂 巡回台帳.lnk"
if (Test-Path $deskLnk) {
    $sDesk = $wsh.CreateShortcut($deskLnk)
    $sDesk.IconLocation = "$iconPath,0"
    $sDesk.Save()
}

$progDir = [Environment]::GetFolderPath('Programs')
$progLnk = "$progDir\蕉葉堂 巡回台帳.lnk"
if (Test-Path $progLnk) {
    $sProg = $wsh.CreateShortcut($progLnk)
    $sProg.IconLocation = "$iconPath,0"
    $sProg.Save()
}

$groupLnk = "$progDir\蕉葉堂\蕉葉堂 巡回台帳.lnk"
if (Test-Path $groupLnk) {
    $sGroup = $wsh.CreateShortcut($groupLnk)
    $sGroup.IconLocation = "$iconPath,0"
    $sGroup.Save()
}

# 4. 通知 Shell 刷新
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RefreshShell {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);
}
'@
[RefreshShell]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Updated uninstall.exe and app.ico successfully!"
