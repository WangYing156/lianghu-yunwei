/**
 * 运行时配置：全部来自环境变量，默认值对齐现场交付环境。
 * 现场 PostgreSQL：172.28.12.194:5432 / lhsd_app
 */
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const serverRoot = resolve(here, '..')

// 优先读取 server/.env，其次是仓库根目录 .env
for (const candidate of [resolve(serverRoot, '.env'), resolve(serverRoot, '..', '.env')]) {
  if (existsSync(candidate)) loadEnv({ path: candidate })
}

function num(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(value, fallback) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: num(process.env.PORT, 8080),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  version: process.env.APP_VERSION ?? '1.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  db: {
    host: process.env.PGHOST ?? process.env.DB_HOST ?? '172.28.12.194',
    port: num(process.env.PGPORT ?? process.env.DB_PORT, 5432),
    user: process.env.PGUSER ?? process.env.DB_USER ?? 'postgres',
    password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '123456',
    database: process.env.PGDATABASE ?? process.env.DB_NAME ?? 'lhsd_app',
    ssl: bool(process.env.PGSSL, false),
    max: num(process.env.PGPOOL_MAX, 10),
    idleTimeoutMillis: num(process.env.PG_IDLE_TIMEOUT, 30_000),
    connectionTimeoutMillis: num(process.env.PG_CONNECT_TIMEOUT, 8_000),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'lhsd-om-platform-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },
  autoMigrate: bool(process.env.AUTO_MIGRATE, true),
  autoSeed: bool(process.env.AUTO_SEED, true),
  /** 演示环境允许匿名访问只读接口；生产可置为 true 强制全量鉴权 */
  requireAuthForRead: bool(process.env.REQUIRE_AUTH_FOR_READ, false),
}

export default config
