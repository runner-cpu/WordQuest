@echo off
chcp 65001 >nul
title 单词勇者 WordQuest
cd /d "%~dp0"

echo.
echo   单词勇者 WordQuest
echo   ----------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   没有找到 Node.js。
  echo.
  echo   请先安装 Node.js 18 或更高版本：https://nodejs.org
  echo   安装后重新双击本文件。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   首次运行，正在安装依赖（约 1 分钟）...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo   依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo   正在构建应用...
  call npm run build
  if errorlevel 1 (
    echo   构建失败。
    pause
    exit /b 1
  )
)

echo   启动中，浏览器会自动打开...
node scripts\serve.mjs

pause
