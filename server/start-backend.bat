@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

rem =====================================================================
rem  两湖隧道（南湖段）智能运维管理平台 · 后端一键启动（Windows）
rem  用法：双击本文件，或在命令行执行 start-backend.bat
rem  流程：环境检查 → 依赖安装 → 数据库自检 → 启动服务 → 接口自检
rem =====================================================================

cd /d "%~dp0"
title 两湖隧道智能运维后端 - 一键启动

set "SERVER_DIR=%~dp0"
if "%SERVER_DIR:~-1%"=="\" set "SERVER_DIR=%SERVER_DIR:~0,-1%"
set "ROOT_DIR=%SERVER_DIR%\.."
set "EXIT_CODE=0"
set "SKIP_SMOKE=0"
set "SKIP_DB_CHECK=0"
set "PORT_VALUE=8080"

if /i "%~1"=="--no-smoke" set "SKIP_SMOKE=1"
if /i "%~1"=="--no-db-check" set "SKIP_DB_CHECK=1"
if /i "%~1"=="--help" goto :usage

echo.
echo =====================================================================
echo   两湖隧道（南湖段）智能运维管理平台 · 后端服务
echo   一键启动脚本（Windows）
echo =====================================================================
echo.

rem ------------------------------ 1. Node.js ------------------------------
echo [1/6] 检查 Node.js 运行环境...
where node >nul 2>nul
if errorlevel 1 goto :no_node
for /f "tokens=* usebackq" %%v in (`node -p "process.versions.node"`) do set "NODE_VERSION=%%v"
for /f "tokens=1 delims=." %%a in ("!NODE_VERSION!") do set "NODE_MAJOR=%%a"
if !NODE_MAJOR! LSS 20 goto :old_node
echo       Node.js v!NODE_VERSION!  OK
where npm >nul 2>nul
if errorlevel 1 goto :no_npm

rem ------------------------------ 2. 依赖 ------------------------------
echo.
echo [2/6] 检查后端依赖...
if not exist "%SERVER_DIR%\node_modules\fastify\package.json" (
  echo       未检测到依赖，正在执行 npm install（首次约 1-3 分钟）...
  call npm install --prefix "%SERVER_DIR%" --no-audit --no-fund
  if errorlevel 1 goto :npm_failed
) else (
  echo       依赖已安装，跳过
)

rem ------------------------------ 3. 配置 ------------------------------
echo.
echo [3/6] 检查环境配置 server\.env ...
if not exist "%SERVER_DIR%\.env" (
  if exist "%SERVER_DIR%\.env.example" (
    copy /y "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
    echo       已从 .env.example 生成 server\.env（默认指向 172.28.12.194:5432/lhsd_app）
  ) else (
    echo       警告：缺少 .env 与 .env.example，将使用内置默认配置
  )
) else (
  echo       server\.env 已存在，保留现场配置
)
rem 读取端口，避免健康检查打到错误的端口
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /i "PORT=" "%SERVER_DIR%\.env" 2^>nul`) do set "PORT_VALUE=%%b"
if "!PORT_VALUE!"=="" set "PORT_VALUE=8080"

rem ------------------------------ 4. 数据库自检 ------------------------------
echo.
echo [4/6] 数据库连通性自检...
if "%SKIP_DB_CHECK%"=="1" (
  echo       已按参数跳过
) else (
  pushd "%SERVER_DIR%"
  call node scripts\db-check.js
  set "DB_CHECK=!errorlevel!"
  popd
  if not "!DB_CHECK!"=="0" (
    echo.
    echo   [失败] 数据库自检未通过，服务无法正常启动。
    echo   1. 确认 PostgreSQL 已启动且 172.28.12.194 可访问（可试 ping 172.28.12.194）
    echo   2. 确认数据库 lhsd_app 已创建：createdb -h 172.28.12.194 -U postgres lhsd_app
    echo   3. 核对 server\.env 中的 PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE
    echo   如需仅调试启动流程，可用：start-backend.bat --no-db-check
    goto :fail
  )
)

rem ------------------------------ 5. 启动服务 ------------------------------
echo.
echo [5/6] 启动后端服务（http://localhost:!PORT_VALUE!）...
echo       首次启动会自动建表并写入演示数据，请稍候...
start "两湖智能运维后端服务" /D "%SERVER_DIR%" cmd /k "node src\server.js"

set "HEALTH_URL=http://127.0.0.1:!PORT_VALUE!/api/v1/health"
set "READY=0"
for /l %%i in (1,1,40) do (
  if "!READY!"=="0" (
    timeout /t 1 /nobreak >nul
    call :probe_health
  )
)
if not "!READY!"=="1" goto :not_ready
echo       服务已就绪，健康检查通过

rem ------------------------------ 6. 接口自检 ------------------------------
echo.
echo [6/6] 接口自检（只读接口 + 写链路 + 鉴权）...
if "%SKIP_SMOKE%"=="1" (
  echo       已按参数跳过
) else (
  pushd "%SERVER_DIR%"
  call node scripts\smoke-api.js
  set "SMOKE_CODE=!errorlevel!"
  popd
  if not "!SMOKE_CODE!"=="0" (
    echo.
    echo   [失败] 接口自检未通过，请查看上方失败项与服务窗口日志。
    goto :fail
  )
)

echo.
echo =====================================================================
echo   启动完成
echo ---------------------------------------------------------------------
echo   接口文档   http://localhost:!PORT_VALUE!/api/v1/docs
echo   OpenAPI    http://localhost:!PORT_VALUE!/api/v1/docs/json
echo   健康检查   http://localhost:!PORT_VALUE!/api/v1/health
echo   平台元数据 http://localhost:!PORT_VALUE!/api/v1/meta
echo   演示账号   admin / manager / engineer / operator / viewer
echo              初始口令 Lhsd@2026
echo ---------------------------------------------------------------------
echo   服务运行在单独的“两湖智能运维后端服务”窗口，关闭该窗口即停止服务。
echo =====================================================================
echo.
start "" "http://localhost:!PORT_VALUE!/api/v1/docs"
pause
exit /b 0

rem ============================== 子过程 ==============================
:probe_health
rem 用 node 做健康探测，避免依赖 curl（Win10 1803 以前没有 curl）
node -e "fetch('!HEALTH_URL!').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 1 (set "READY=0") else (set "READY=1")
exit /b 0

:usage
echo 用法：start-backend.bat [--no-db-check] [--no-smoke]
echo   --no-db-check  跳过数据库连通性自检（仅用于排查启动流程）
echo   --no-smoke     跳过接口自检
exit /b 0

:no_node
echo.
echo   [失败] 未找到 Node.js。
echo   请安装 Node.js 22 LTS（https://nodejs.org/zh-cn/download）后重新运行。
echo   安装时勾选 “Add to PATH”。
goto :fail

:old_node
echo.
echo   [失败] 当前 Node.js 版本为 v!NODE_VERSION!，至少需要 v20（推荐 v22 LTS）。
goto :fail

:no_npm
echo.
echo   [失败] 未找到 npm，请重新安装 Node.js（npm 随 Node.js 一起安装）。
goto :fail

:npm_failed
echo.
echo   [失败] npm install 执行失败。
echo   1. 检查网络或配置国内镜像：npm config set registry https://registry.npmmirror.com
echo   2. 删除 server\node_modules 后重试
goto :fail

:not_ready
echo.
echo   [失败] 服务在 40 秒内未通过健康检查。
echo   请查看“两湖智能运维后端服务”窗口的错误信息，常见原因：
echo   - 端口 !PORT_VALUE! 被占用：修改 server\.env 的 PORT
echo   - 数据库不可达：确认 PostgreSQL 已启动、防火墙放通 5432
goto :fail

:fail
echo.
echo 启动失败，请按上面的提示处理后重新运行本脚本。
pause
exit /b 1
