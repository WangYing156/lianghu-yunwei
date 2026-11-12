/**
 * 工单状态机（独立模块，便于单元测试与前端共用同一份流转规则）
 * pending → dispatched → processing → reviewing → completed
 * rejected / cancelled 为可终止分支，rejected 允许重新派发。
 */
export const STATUS_FLOW = {
  pending: ['dispatched', 'cancelled'],
  dispatched: ['processing', 'rejected', 'cancelled'],
  processing: ['reviewing', 'cancelled'],
  reviewing: ['completed', 'rejected'],
  completed: [],
  rejected: ['dispatched', 'cancelled'],
  cancelled: [],
}

export const STATUS_LABEL = {
  pending: '待派发',
  dispatched: '已派发',
  processing: '处理中',
  reviewing: '待验收',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消',
}

/** 终态：不再参与超时统计 */
export const TERMINAL_STATUSES = ['completed', 'cancelled']

export function isValidStatus(status) {
  return Object.hasOwn(STATUS_FLOW, status)
}

export function canTransition(from, to) {
  return (STATUS_FLOW[from] ?? []).includes(to)
}

export function allowedNext(from) {
  return STATUS_FLOW[from] ?? []
}

/** 校验流转，非法时返回中文原因，合法返回 null */
export function transitionError(from, to) {
  if (!isValidStatus(from)) return `未知的工单状态：${from}`
  if (!isValidStatus(to)) return `未知的目标状态：${to}`
  if (!canTransition(from, to)) {
    return `工单当前状态 ${STATUS_LABEL[from]} 不能流转到 ${STATUS_LABEL[to]}`
  }
  return null
}

/** 处置时效：按 slaHours 计算到期时间 */
export function computeDueAt(slaHours, from = new Date()) {
  const hours = Number(slaHours)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return new Date(from.getTime() + hours * 3600 * 1000)
}
