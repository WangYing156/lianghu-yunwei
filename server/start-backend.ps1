<#
  两湖隧道（南湖段）智能运维管理平台 · 后端一键启动（PowerShell）
  用法（在 server 目录）：
    powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
  可选参数：
    -NoDbCheck   跳过数据库自检
    -NoSmoke     跳过接口自检
    -NoBrowser   启动后不打开文档页
  说明：功能与 start-backend.bat 一致，适合已启用 PowerShell 策略或需要脚本化部署的现场。
#>
[CmdletBinding()]
param(
  [switch]$NoDbCheck,
  [switch]$NoSmoke,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $serverDir

function Write-Step([string]$text) { Write-Host "`n$text" -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host "  $text" -ForegroundColor Green }
function Write-Warn([string]$text) { Write-Host "  $text" -ForegroundColor Yellow }
function Write-Err([string]$text) { Write-Host "  $text" -ForegroundColor Red }

Write-Host @"
=====================================================================
  两湖隧道（南湖段）智能运维管理平台 · 后端服务
  一键启动脚本（PowerShell）
=====================================================================
"@ -ForegroundColor Cyan

# 1. Node.js
Write-Step '[1/6] 检查 Node.js 运行环境...'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Err '未找到 Node.js，请安装 Node.js 22 LTS（https://nodejs.org/zh-cn/download）后重试。'
  exit 1
}
$nodeVersion = (& node -p 'process.versions.node').Trim()
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
  Write-Err "当前 Node.js 版本 v$nodeVersion，至少需要 v20（推荐 v22 LTS）。"
  exit 1
}
Write-Ok "Node.js v$nodeVersion"

# 2. 依赖
Write-Step '[2/6] 检查后端依赖...'
if (-not (Test-Path (Join-Path $serverDir 'node_modules\fastify\package.json'))) {
  Write-Warn '未检测到依赖，正在执行 npm install（首次约 1-3 分钟）...'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Write-Err 'npm install 失败。可尝试：npm config set registry https://registry.npmmirror.com 后重试。'
    exit 1
  }
} else {
  Write-Ok '依赖已安装'
}

# 3. 配置
Write-Step '[3/6] 检查环境配置 server\.env ...'
$envFile = Join-Path $serverDir '.env'
if (-not (Test-Path $envFile)) {
  $example = Join-Path $serverDir '.env.example'
  if (Test-Path $example) {
    Copy-Item $example $envFile
    Write-Ok '已从 .env.example 生成 server\.env（默认 172.28.12.194:5432/lhsd_app）'
  } else {
    Write-Warn '缺少 .env，将使用内置默认配置'
  }
} else {
  Write-Ok 'server\.env 已存在'
}
$port = '8080'
$portLine = Select-String -Path $envFile -Pattern '^PORT=' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portLine) { $port = ($portLine.Line -split '=', 2)[1].Trim() }

# 4. 数据库自检
Write-Step '[4/6] 数据库连通性自检...'
if ($NoDbCheck) {
  Write-Warn '已按参数跳过'
} else {
  & node scripts\db-check.js
  if ($LASTEXITCODE -ne 0) {
    Write-Err '数据库自检未通过，服务无法正常启动。请检查：'
    Write-Host '    1. PostgreSQL 已启动且 172.28.12.194 可访问'
    Write-Host '    2. 数据库 lhsd_app 已创建：createdb -h 172.28.12.194 -U postgres lhsd_app'
    Write-Host '    3. server\.env 中的 PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE'
    exit 1
  }
}

# 5. 启动服务
Write-Step "[5/6] 启动后端服务（http://localhost:$port）..."
$logFile = Join-Path $serverDir 'server.log'
$proc = Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory $serverDir `
  -RedirectStandardOutput $logFile -RedirectStandardError (Join-Path $serverDir 'server.err.log') -PassThru
Write-Ok "进程 PID $($proc.Id)，日志 server\server.log、server\server.err.log"

$healthUrl = "http://127.0.0.1:$port/api/v1/health"
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if ($proc.HasExited) { break }
  try {
    $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Err '服务在 40 秒内未通过健康检查。请查看 server\server.log、server\server.err.log。'
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  exit 1
}
Write-Ok '服务已就绪，健康检查通过'

# 6. 接口自检
Write-Step '[6/6] 接口自检（只读接口 + 写链路 + 鉴权）...'
if ($NoSmoke) {
  Write-Warn '已按参数跳过'
} else {
  & node scripts\smoke-api.js
  if ($LASTEXITCODE -ne 0) {
    Write-Err '接口自检未通过，请查看上方失败项与 server\server.log。'
    exit 1
  }
}

$docs = "http://localhost:$port/api/v1/docs"
Write-Host @"

=====================================================================
  启动完成
---------------------------------------------------------------------
  接口文档   $docs
  OpenAPI    http://localhost:$port/api/v1/docs/json
  健康检查   $healthUrl
  平台元数据 http://localhost:$port/api/v1/meta
  演示账号   admin / manager / engineer / operator / viewer
             初始口令 Lhsd@2026
---------------------------------------------------------------------
  停止服务   Stop-Process -Id $($proc.Id)
=====================================================================
"@ -ForegroundColor Green

if (-not $NoBrowser) { Start-Process $docs }
