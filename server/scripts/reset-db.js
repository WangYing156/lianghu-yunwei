#!/usr/bin/env node
/**
 * 数据库重建：删除并重建 lhsd_app（需显式 --yes），随后执行迁移与种子。
 * 仅用于演示环境快速回到干净数据；生产库请勿使用。
 * 用法：npm run db:reset -- --yes
 */
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'
import config from '../src/config.js'

const confirmed = process.argv.includes('--yes')

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`数据库名不合法：${name}`)
  return `"${name}"`
}

async function main() {
  const dbName = config.db.database
  if (!confirmed) {
    console.log(`该操作会删除并重建数据库 ${dbName}。`)
    console.log('确认请执行：npm run db:reset -- --yes')
    process.exit(0)
  }
  const admin = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
    connectionTimeoutMillis: 8000,
  })
  await admin.connect()
  console.log(`[reset] 正在重建 ${dbName} …`)
  await admin.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [dbName],
  )
  await admin.query(`drop database if exists ${quoteIdent(dbName)}`)
  await admin.query(`create database ${quoteIdent(dbName)}`)
  await admin.end()

  for (const script of ['db:migrate', 'db:seed']) {
    console.log(`[reset] 执行 npm run ${script} …`)
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    })
    if (result.status !== 0) throw new Error(`${script} 执行失败`)
  }
  console.log('[reset] 完成，数据库已回到演示初始状态。')
}

main().catch((error) => {
  console.error('[reset] 失败:', error.message)
  process.exit(1)
})
