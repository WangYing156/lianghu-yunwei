/**
 * 后端接口客户端：统一 envelop 解析、错误提示、鉴权令牌与数据源降级。
 *
 * 约定（与 server 端一致）：
 *   成功 { code: 0, message: 'ok', data, traceId }
 *   失败 { code: <业务码>, message, details?, traceId }
 *
 * 数据边界：
 *   - 真实数据：后端返回的接口数据（BIM 构件、设备台账、告警、工单、病害、监测读数等）。
 *   - 演示数据：后端不可用时页面回落到本地示例（DEMO_*），页面上会明确标注「示例数据」。
 */

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: number
  readonly traceId?: string
  constructor(message: string, status: number, code: number, traceId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.traceId = traceId
  }
}

/** 令牌存储：localStorage 中保留，刷新页面免重复登录 */
const TOKEN_KEY = 'lhsd.token'
const USER_KEY = 'lhsd.user'

export interface AuthUser {
  id: number
  username: string
  displayName: string
  role: string
  roleLabel: string
  dept?: string | null
  phone?: string | null
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function setSession(token: string, user?: AuthUser) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* 隐私模式下 localStorage 不可写，忽略即可 */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

/** 接口根路径：默认走同源 /api/v1（由 Vite 代理或反向代理转发到后端） */
const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})
export const API_BASE = ENV.VITE_API_BASE || '/api/v1'

/** 后端未启动 / 网络不可达时置为 true，页面据此显示「示例数据」角标 */
let backendOffline = false
export function isBackendOffline() {
  return backendOffline
}

type QueryValue = string | number | boolean | null | undefined

function buildQuery(query?: Record<string, QueryValue | QueryValue[]>) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) if (item != null && item !== '') params.append(key, String(item))
    } else {
      params.append(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, QueryValue | QueryValue[]>
  /** 超时毫秒，默认 10s；大屏页面不希望长时间空白 */
  timeout?: number
  /** 不弹全局错误提示（用于可选数据） */
  silent?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeout = 10_000, signal } = options
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  const token = getToken()
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    backendOffline = true
    window.clearTimeout(timer)
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('请求超时，请检查后端服务', 0, -1)
    }
    throw new ApiError('无法连接后端服务', 0, -1)
  }
  window.clearTimeout(timer)
  backendOffline = false

  const text = await response.text()
  let payload: ApiEnvelope<T> | undefined
  try {
    payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const message = payload?.message ?? `请求失败（HTTP ${response.status}）`
    if (response.status === 401) clearSession()
    throw new ApiError(message, response.status, payload?.code ?? response.status, payload?.traceId)
  }
  if (!payload) throw new ApiError('后端返回格式异常', response.status, -2)
  if (payload.code !== 0) {
    throw new ApiError(payload.message || '业务处理失败', response.status, payload.code, payload.traceId)
  }
  return payload.data
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], options: Omit<RequestOptions, 'query'> = {}) =>
    request<T>(path, { ...options, query }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options: RequestOptions = {}) => request<T>(path, { ...options, method: 'DELETE' }),
  request,
}

/* ------------------------------------------------------------------ *
 * 通用类型：与后端 camelCase 输出保持一致
 * ------------------------------------------------------------------ */

export type AlertLevel = 'critical' | 'warning' | 'info' | 'notice'
export type AlertStatus = 'open' | 'acknowledged' | 'closed'

export interface AlertItem {
  id: number
  code: string
  level: AlertLevel
  status: AlertStatus
  source: string
  title: string
  description?: string | null
  stake?: string | null
  pointId?: string | null
  group?: string | null
  kind?: string | null
  deviceId?: number | null
  deviceName?: string | null
  occurredAt: string
  ackedAt?: string | null
  ackedByName?: string | null
  closedAt?: string | null
  elapsedMinutes?: number | null
}

export interface AlertStats {
  hours: number
  total: number
  open: number
  acknowledged: number
  closed: number
  meanAckMinutes: number | null
  byLevel: { level: AlertLevel; label: string; count: number }[]
  bySource: { source: string; count: number }[]
  trend: { bucket: string; count: number }[]
}

export interface DashboardSummary {
  generatedAt: string
  alerts: {
    total: number
    open: number
    byLevel: { key: string; label: string; value: number }[]
    latest: AlertItem[]
  }
  devices: {
    total: number
    online: number
    fault: number
    offline: number
    onlineRate: number
    cards: { group: string; label: string; icon: string; ok: number; total: number; fault: number }[]
    byStatus: { key: string; label: string; value: number }[]
  }
  workOrders: {
    byStatus: { key: string; label: string; value: number }[]
    total: number
    overdue: number
    last7Days: { date: string; created: number; completed: number }[]
  }
  traffic: {
    flowVph: number
    congestion: string
    segments: { code: string; name: string; flow: number; congestion: string }[]
    hourly: { hour: string; north: number; south: number }[]
    events24h: number
    pendingEvents: number
  }
  publicService: {
    feedbackToday: number
    feedbackPending: number
    satisfactionRate: number
    activeNotices: number
    reach24h: number
  }
  environment: {
    co: number
    no2: number
    illuminance: number
    humidity: number
    maxWaterLevelCm: number
  }
  structure: {
    healthIndex: number
    sections: { code: string; name: string; score: number; level: string }[]
    watchSections: string[]
  }
  dataBoundary: string[]
}

export interface ModuleEntry {
  code: string
  name: string
  path: string
  icon: string
  badge: number
  badgeReason: string
}

export interface TrafficSegment {
  code: string
  name: string
  stakeStart: string
  stakeEnd: string
  flowVph: number
  speedKmh: number
  occupancy: number
  congestion: 'smooth' | 'slow' | 'congested'
  recordedAt: string
}

export interface TrafficEvent {
  id: number
  code: string
  type: string
  level: string
  stake?: string | null
  confidence: number
  status: string
  cameraId?: number | null
  cameraName?: string | null
  detectedAt: string
  handledAt?: string | null
  remark?: string | null
}

export interface MonitoringReading {
  deviceId: number
  deviceCode: string
  deviceName: string
  stake?: string | null
  group?: string | null
  metric: string
  metricLabel: string
  unit?: string | null
  value: number
  recordedAt: string
  level: 'normal' | 'warn' | 'alarm'
  threshold?: { warn: number | null; alarm: number | null }
}

export interface StructuralHealth {
  latest: { sectionCode: string; sectionName: string; score: number; level: string; evaluatedAt: string }[]
  trend: { sectionCode: string; points: { time: string; score: number }[] }[]
  overallIndex: number
  watchSections: string[]
}

export interface CameraItem {
  id: number
  code: string
  name: string
  type: string
  stake?: string | null
  status: string
  streamUrl?: string | null
  previewUrl?: string | null
  pointId?: string | null
  aiEnabled: boolean
  lastOnlineAt?: string | null
  live: boolean
}

export interface InfoBoardItem {
  id: number
  code: string
  name: string
  type: string
  stake?: string | null
  status: string
  content?: string | null
  pointId?: string | null
}

export interface PublishTask {
  id: number
  taskNo: string
  title: string
  content: string
  level: string
  channels: string[]
  status: string
  scheduledStart?: string | null
  scheduledEnd?: string | null
  boardIds: number[]
  boardNames: string[]
  publishedAt?: string | null
  reachCount?: number | null
  createdAt: string
}

export interface WorkOrder {
  id: number
  code: string
  type: string
  title: string
  description?: string | null
  status: string
  priority: string
  source: string
  stake?: string | null
  diseaseId?: number | null
  alertId?: number | null
  assigneeId?: number | null
  assigneeName?: string | null
  slaHours?: number | null
  dueAt?: string | null
  dispatchedAt?: string | null
  completedAt?: string | null
  overdue: boolean
  createdAt: string
  updatedAt: string
}

export interface Disease {
  id: number
  code: string
  type: string
  severity: string
  stake?: string | null
  sectionCode?: string | null
  description?: string | null
  source: string
  status: string
  pointId?: string | null
  foundAt: string
  repairedAt?: string | null
  elapsedHours?: number | null
}

export interface DiseaseStats {
  funnel: { status: string; label: string; count: number }[]
  byType: { type: string; label: string; count: number }[]
  bySource: { source: string; label: string; count: number }[]
  bySeverity: { severity: string; label: string; count: number }[]
  trend: { month: string; created: number; closed: number }[]
  health: { sectionCode: string; sectionName: string; score: number; level: string }[]
}

export interface InspectionTask {
  id: number
  code: string
  name: string
  cycle: string
  planDate: string
  status: string
  assigneeName?: string | null
  coverage: number
}

export interface MaintenancePlan {
  id: number
  name: string
  cycle: string
  nextDate: string
  lastDate?: string | null
  ownerDept?: string | null
  status: string
  daysToDue: number
}

export interface Feedback {
  id: number
  code: string
  channel: string
  content: string
  stake?: string | null
  status: string
  contact?: string | null
  createdAt: string
  reviewedAt?: string | null
  workOrderId?: number | null
}

export interface PublicNotice {
  id: number
  title: string
  level: string
  channels: string[]
  status: string
  publishedAt?: string | null
  reachCount?: number | null
  content?: string | null
}

export interface SafetyArticle {
  id: number
  title: string
  summary?: string | null
  category?: string | null
  icon?: string | null
  content?: string | null
  views: number
  publishedAt?: string | null
}

export interface EmergencyMaterial {
  id: number
  name: string
  site?: string | null
  stake?: string | null
  unit: string
  quantity: number
  /** 是否充足（后端缺少该字段时按 quantity > 0 兜底） */
  sufficient?: boolean
  category?: string | null
  threshold?: number | null
  updatedAt?: string | null
}

export interface SimulationRun {
  id: number
  scenario: string
  stepReached: number
  totalSteps: number
  note?: string | null
  operatorName?: string | null
  createdAt: string
}

export interface AssetItem {
  id: number
  code: string
  name: string
  categoryCode?: string | null
  categoryName?: string | null
  systemName?: string | null
  stake?: string | null
  positionDesc?: string | null
  pointId?: string | null
  model?: string | null
  vendor?: string | null
  installDate?: string | null
  status?: string | null
  documentCount?: number
  alertCount?: number
}

export interface DeviceItem {
  id: number
  code: string
  name: string
  categoryCode: string
  categoryName: string
  group?: string | null
  stake?: string | null
  positionDesc?: string | null
  systemName?: string | null
  model?: string | null
  vendor?: string | null
  installDate?: string | null
  status: string
  cardGroup?: string | null
  runState?: string | null
  ip?: string | null
  pointId?: string | null
  lastSeenAt?: string | null
  openAlertCount: number
}

export interface DeviceCategory {
  code: string
  name: string
  group: string
  total: number
  byStatus: { key: string; label: string; value: number }[]
}

export interface WaterLevelItem {
  deviceCode: string
  deviceName: string
  stake?: string | null
  value: number
  level: 'normal' | 'yellow' | 'red'
  yellow: number
  red: number
}

export interface PumpItem {
  code: string
  name: string
  runState: string
  status: string
}

export interface EmergencyOverview {
  waterLevels: WaterLevelItem[]
  pumps: PumpItem[]
  activeAlerts: AlertItem[]
  materials?: { total: number; insufficient: number }
  simulation?: { total: number; lastRunAt?: string | null; lastScenario?: string | null }
}

export interface ScenePointItem {
  id: string
  name: string
  kind: string
  group: string
  status: string
  stake?: string | null
  groupLabel?: string | null
  devices?: DeviceItem[]
  alerts?: AlertItem[]
}

export interface AssetDetail extends AssetItem {
  asset?: AssetItem
  structure?: { key: string; value: string }[]
  params?: { key: string; value: string }[]
  parameters?: { key: string; value: string }[]
  materials?: { key: string; value: string }[]
  guides?: { title: string; detail?: string | null }[]
  documents?: { name: string; type: string; size?: string | null; date?: string | null; version?: string | null; url?: string | null }[]
  workOrders?: WorkOrder[]
}

/** /scene/overview 返回的带告警叠加的点位 */
export interface SceneOverviewPoint {
  id: string
  name: string
  kind: string
  group: string
  status: 'ok' | 'warn' | 'alarm' | 'offline'
  left: string
  top: string
  leftNum: number
  scale: number
  stake?: string | null
  value?: string | null
  inspect?: string | null
  alarm?: string | null
  alertCode?: string | null
  alarmLevel?: string | null
  alarmCount: number
  deviceId?: number | null
  unit?: string | null
}

export interface SceneOverview {
  module: string
  generatedAt: string
  total: number
  alarmCount: number
  groups: { key: string; label: string; count: number }[]
  points: SceneOverviewPoint[]
}
