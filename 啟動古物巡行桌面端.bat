@echo off
chcp 65001 > nul
title 蕉葉堂 巡回台帳 — Windows 桌面端
echo ===================================================================
echo   蕉葉堂 巡回台帳 — 古物・戦前資料定期収集機 (Windows Desktop)
echo   正在啟動原生視窗應用程序...
echo ===================================================================
echo.
cd /d "%~dp0"

REM 檢查是否已有 dist，若無則建構
if not exist "dist\index.html" (
    echo [1/2] 正在進行初次編譯...
    call npm run build
)

echo [2/2] 啟動 Electron 原生視窗...
call npx electron .
