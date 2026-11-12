@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem =====================================================================
rem  两湖隧道（南湖段）智能运维管理平台 · 停止后端服务（Windows）
rem  按端口精确停止，不会影响机器上其它 Node 程序
rem =====================================================================

cd /d "%~dp0"
title 两湖隧道智能运维后端 - 停止服务

set "PORT_VALUE=8080"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "PORT=" "%~dp0.env" 2^>nul`) do set "PORT_VALUE=%%b"
if "%PORT_VALUE%"=="" set "PORT_VALUE=8080"

echo.
echo 正在查找监听端口 %PORT_VALUE% 的后端进程...
set "FOUND=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr /c:":%PORT_VALUE% "') do (
  set "FOUND=1"
  echo   结束进程 PID %%p
  taskkill /f /pid %%p >nul 2>nul
)

if "%FOUND%"=="0" (
  echo   未发现监听 %PORT_VALUE% 的进程，服务可能已停止。
) else (
  echo   后端服务已停止。
)
echo.
pause
exit /b 0
