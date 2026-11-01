@echo off
chcp 65001 > nul
title 蕉葉堂 巡回台帳 — Windows Desktop App
echo ===================================================================
echo   蕉葉堂 巡回台帳 — 古物・戦前資料定期収集機 (Windows Desktop)
echo   目標站點: 日本の古本屋 / Yahoo! 拍賣 / メルカリ
echo ===================================================================
echo.
cd /d "%~dp0"
echo 正在開啟原生 Windows 桌面端...
call npx electron .
pause
