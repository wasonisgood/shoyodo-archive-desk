$targetDir = "$env:LocalAppData\Programs\ShoyodoArchiveDesk"
$exePath = "$targetDir\蕉葉堂巡回台帳.exe"
$uninstallerPath = "$targetDir\uninstall.bat"

if (Test-Path $exePath) {
    # 1. 建立解除安裝腳本
    $scriptContent = @'
@echo off
chcp 65001 >nul
title 解除安裝 蕉葉堂 巡回台帳
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\蕉葉堂巡回台帳.exe" /f >nul 2>&1
del "%USERPROFILE%\Desktop\蕉葉堂 巡回台帳.lnk" >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\蕉葉堂 巡回台帳.lnk" >nul 2>&1
rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\蕉葉堂" >nul 2>&1
echo 蕉葉堂 巡回台帳 已順利從您的電腦中移除。
timeout /t 2 /nobreak >nul
(goto) 2>nul & rd /s /q "%~dp0"
'@
    Set-Content -Path $uninstallerPath -Value $scriptContent -Encoding UTF8

    # 2. 註冊至 Windows "設定 -> 應用程式 -> 已安裝的應用程式"
    $regKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk'
    if (-not (Test-Path $regKey)) {
        New-Item -Path $regKey -Force | Out-Null
    }
    Set-ItemProperty -Path $regKey -Name 'DisplayName' -Value '蕉葉堂 巡回台帳'
    Set-ItemProperty -Path $regKey -Name 'DisplayVersion' -Value '1.0.0'
    Set-ItemProperty -Path $regKey -Name 'Publisher' -Value '蕉葉堂 / 蕉葉文庫 (Shoyodo Archive Desk)'
    Set-ItemProperty -Path $regKey -Name 'DisplayIcon' -Value "$exePath,0"
    Set-ItemProperty -Path $regKey -Name 'InstallLocation' -Value $targetDir
    Set-ItemProperty -Path $regKey -Name 'UninstallString' -Value "`"$uninstallerPath`""
    Set-ItemProperty -Path $regKey -Name 'EstimatedSize' -Value 419430 -Type DWord
    Set-ItemProperty -Path $regKey -Name 'NoModify' -Value 1 -Type DWord
    Set-ItemProperty -Path $regKey -Name 'NoRepair' -Value 1 -Type DWord
    Set-ItemProperty -Path $regKey -Name 'Comments' -Value '戰前古書・近代文獻定期巡回收集台帳'

    # 3. 註冊至 Windows 搜尋與執行 (App Paths)
    $appPathKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\蕉葉堂巡回台帳.exe'
    if (-not (Test-Path $appPathKey)) {
        New-Item -Path $appPathKey -Force | Out-Null
    }
    Set-ItemProperty -Path $appPathKey -Name '(Default)' -Value $exePath
    Set-ItemProperty -Path $appPathKey -Name 'Path' -Value $targetDir

    # 4. 開始功能表捷徑
    $progDir = [Environment]::GetFolderPath('Programs')
    $wsh = New-Object -ComObject WScript.Shell
    $sc1 = $wsh.CreateShortcut("$progDir\蕉葉堂 巡回台帳.lnk")
    $sc1.TargetPath = $exePath
    $sc1.WorkingDirectory = $targetDir
    $sc1.Description = "蕉葉堂 巡回台帳 — 戦前資料定期収集機"
    $sc1.IconLocation = "$exePath,0"
    $sc1.Save()

    $groupDir = "$progDir\蕉葉堂"
    if (-not (Test-Path $groupDir)) {
        New-Item -Path $groupDir -ItemType Directory -Force | Out-Null
    }
    $sc2 = $wsh.CreateShortcut("$groupDir\蕉葉堂 巡回台帳.lnk")
    $sc2.TargetPath = $exePath
    $sc2.WorkingDirectory = $targetDir
    $sc2.Description = "蕉葉堂 巡回台帳 — 戦前資料定期収集機"
    $sc2.IconLocation = "$exePath,0"
    $sc2.Save()

    # 5. 桌面捷徑
    $deskDir = [Environment]::GetFolderPath('Desktop')
    $scDesk = $wsh.CreateShortcut("$deskDir\蕉葉堂 巡回台帳.lnk")
    $scDesk.TargetPath = $exePath
    $scDesk.WorkingDirectory = $targetDir
    $scDesk.Description = "蕉葉堂 巡回台帳 — 戦前資料定期収集機"
    $scDesk.IconLocation = "$exePath,0"
    $scDesk.Save()

    # 6. 通知 Windows Shell 立即刷新
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ShellRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
    [ShellRefresh]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

    Write-Host "成功註冊至 Windows 應用程式清單與開始功能表！"
} else {
    Write-Host "找不到執行檔：$exePath"
}
