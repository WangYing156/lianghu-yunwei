/**
 * 服务入口：校验数据库 → 自动迁移 → 幂等种子 → 启动 HTTP。
 * 启动失败时打印可执行的排错建议（Windows 脚本会据此给出提示）。
 */
import config from './config.js'
import { buildApp } from './app.js'
import { pool, ping } from './db/pool.js'
import { runMigrations } from './db/migrator.js'
import { seedDatabase, isDatabaseEmpty } from './db/seed/index.js'

async function bootstrap() {
  const app = await buildApp()
  const log = app.log

  log.info(
    `数据库目标 ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`,
  )

  try {
    await ping()
    log.info('数据库连接成功')
  } catch (error) {
    log.error(`数据库连接失败：${error.message}`)
    log.error('请检查 PostgreSQL 是否可访问、数据库 lhsd_app 是否已创建（server/.env 中的 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE）')
    await app.close().catch(() => {})
    process.exitCode = 1
    return
  }

  if (config.autoMigrate) {
    const applied = await runMigrations({ silent: false })
    log.info(applied.length ? `迁移完成：${applied.join(', ')}` : '数据库结构已是最新')
  }

  if (config.autoSeed) {
    const empty = await isDatabaseEmpty()
    await seedDatabase({ silent: false })
    if (empty) log.info('检测到空库，已写入演示数据')
  }

  try {
    await app.listen({ host: config.host, port: config.port })
    const base = `http://127.0.0.1:${config.port}`
    log.info(`接口文档：${base}${config.apiPrefix}/docs`)
    log.info(`健康检查：${base}${config.apiPrefix}/health`)
    log.info(`演示账号：admin / manager / engineer / operator / viewer，初始口令 Lhsd@2026`)
  } catch (error) {
    log.error(`监听 ${config.host}:${config.port} 失败：${error.message}（端口被占用请修改 server/.env 的 PORT）`)
    process.exitCode = 1
  }
}

const shutdown = async (signal) => {
  console.log(`[server] 收到 ${signal}，正在优雅退出…`)
  await pool.end().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

bootstrap().catch((error) => {
  console.error('[server] 启动失败:', error)
  process.exit(1)
})
