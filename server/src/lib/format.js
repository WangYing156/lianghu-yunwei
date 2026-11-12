/** 数据行 snake_case → API camelCase，并把 Date 转 ISO 字符串（前端无需再处理时区） */
const cache = new Map()

function camelKey(key) {
  let cached = cache.get(key)
  if (cached) return cached
  cached = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())
  cache.set(key, cached)
  return cached
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object' && value.constructor === Object) return camelize(value)
  return value
}

/** 把一行数据库记录转成 API 输出对象 */
export function camelize(row) {
  if (row == null) return row
  if (Array.isArray(row)) return row.map(camelize)
  const out = {}
  for (const [key, value] of Object.entries(row)) out[camelKey(key)] = normalizeValue(value)
  return out
}

/** 分页参数：page 从 1 开始，pageSize 上限 200 */
export function pagination(query = {}, { defaultSize = 20, maxSize = 200 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize ?? String(defaultSize), 10) || defaultSize))
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize }
}

/** 组装列表分页 meta */
export function pageMeta(total, page, pageSize) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  }
}

/** 桩号 K3+050 → 3050（用于排序与区间筛选） */
export function stakeToNumber(stake) {
  if (!stake) return null
  const match = /K(\d+)\+(\d{1,3})/i.exec(String(stake))
  if (!match) return null
  return Number(match[1]) * 1000 + Number(match[2])
}

/** 日期区间参数解析：默认最近 N 小时 */
export function timeWindow({ from, to, hours }, defaultHours = 24) {
  const now = new Date()
  const end = to ? new Date(to) : now
  let start
  if (from) start = new Date(from)
  else {
    const span = Number(hours)
    const h = Number.isFinite(span) && span > 0 ? span : defaultHours
    start = new Date(end.getTime() - h * 3600 * 1000)
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new Error('时间区间参数不合法')
  return { start, end }
}

/** 生成业务编号：前缀 + 日期 + 序号（如 YH-20261112-01） */
export function makeCode(prefix, date = new Date(), seq = 1) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(2, '0')}`
}
