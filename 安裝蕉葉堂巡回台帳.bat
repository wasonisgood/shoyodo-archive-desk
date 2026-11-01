@echo off
chcp 65001 >nul
title 蕉葉堂 巡回台帳 安裝程序
cd /d "%~dp0"
if exist "蕉葉堂巡回台帳_安裝程式.exe" (
  start "" "蕉葉堂巡回台帳_安裝程式.exe"
) else if exist "installer\蕉葉堂巡回台帳_安裝程式.exe" (
  start "" "installer\蕉葉堂巡回台帳_安裝程式.exe"
)
exit
