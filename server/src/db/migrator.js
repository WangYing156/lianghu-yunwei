/**
 * 迁移执行器：按文件名顺序执行 sql/*.sql，已执行的记录在 schema_migration 中。
 * 可用 npm run db:migrate 单独执行，服务启动时也会自动执行（AUTO_MIGRATE=true）。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serverRoot } from '../config.js'
import { pool } from './pool.js'

const sqlDir = join(serverRoot, 'sql')

async function ensureMigrationTable() {
  await pool.query(`
    create table if not exists schema_migration (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `)
}

export async function runMigrations({ silent = false } = {}) {
  await ensureMigrationTable()
  const files = (await readdir(sqlDir))
    .filter((name) => name.endsWith('.sql') && !name.includes('seed'))
    .sort()
  const applied = new Set(
    (await pool.query('select filename from schema_migration')).rows.map((row) => row.filename),
  )
  const executed = []
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(sqlDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('insert into schema_migration (filename) values ($1)', [file])
      await client.query('COMMIT')
      executed.push(file)
      if (!silent) console.log(`[migrate] 已应用 ${file}`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`迁移 ${file} 执行失败: ${error.message}`)
    } finally {
      client.release()
    }
  }
  return executed
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runMigrations()
    .then(async (files) => {
      console.log(files.length ? `[migrate] 完成，共 ${files.length} 个脚本` : '[migrate] 数据库已是最新')
      await pool.end()
    })
    .catch(async (error) => {
      console.error('[migrate] 失败:', error.message)
      await pool.end().catch(() => {})
      process.exit(1)
    })
}
