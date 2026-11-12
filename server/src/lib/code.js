/**
 * 业务编号生成：<前缀>-<YYYYMMDD>-<序号>，按目标表自身的当日最大序号递增。
 * 并发下可能撞号，unique 冲突时由调用方重试（见 withCodeRetry）。
 */
const TABLE_ALLOWLIST = new Set([
  'work_order',
  'disease',
  'traffic_event',
  'feedback',
  'publish_task',
  'inspection_task',
])

export async function nextBizCode(runner, { table, prefix, date = new Date() }) {
  if (!TABLE_ALLOWLIST.has(table)) throw new Error(`不允许的编号表：${table}`)
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  // publish_task 的编号列是 task_no，其余表统一 code
  const column = table === 'publish_task' ? 'task_no' : 'code'
  const { last } = await runner.one(
    `select coalesce(max(nullif(regexp_replace(${column}, '^.*-', ''), '')::int), 0) as last
       from ${table} where ${column} like $1`,
    [`${prefix}-${stamp}-%`],
  )
  return `${prefix}-${stamp}-${String(Number(last) + 1).padStart(2, '0')}`
}

/** 唯一键冲突（23505）时重试整个写事务 */
export async function withCodeRetry(fn, attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (error?.code !== '23505') throw error
    }
  }
  throw lastError
}
