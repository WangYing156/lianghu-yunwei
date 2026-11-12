/**
 * PostgreSQL 连接池与通用查询封装。
 * 统一把 numeric / int8 转成 JS number，避免前端拿到字符串。
 */
import pg from 'pg'
import config from '../config.js'

const { Pool, types } = pg

types.setTypeParser(1700, (value) => (value === null ? null : Number.parseFloat(value))) // numeric
types.setTypeParser(20, (value) => (value === null ? null : Number.parseInt(value, 10))) // int8

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  application_name: 'lhsd-om-api',
})

pool.on('error', (error) => {
  // 空闲连接异常不应导致进程退出，交给上层请求重试
  console.error('[db] 连接池异常:', error.message)
})

/** 执行 SQL，返回 pg.Result */
export function query(text, params = []) {
  return pool.query(text, params)
}

/** 返回第一行，没有则为 null */
export async function one(text, params = []) {
  const result = await pool.query(text, params)
  return result.rows[0] ?? null
}

/** 返回全部行 */
export async function many(text, params = []) {
  const result = await pool.query(text, params)
  return result.rows
}

/** 事务封装：fn 接收一个带 query/one 的执行器 */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const runner = {
      query: (text, params = []) => client.query(text, params),
      one: async (text, params = []) => {
        const result = await client.query(text, params)
        return result.rows[0] ?? null
      },
    }
    const result = await fn(runner)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function ping() {
  const result = await pool.query('select 1 as ok')
  return result.rows[0]?.ok === 1
}

export async function closePool() {
  await pool.end()
}

export default { pool, query, one, many, withTransaction, ping, closePool }
