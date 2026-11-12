/**
 * 页面数据装配：把后端接口数据转成各页面需要的结构，并统一处理
 *   加载中 / 接口失败 / 后端未启动 → 回落到本地示例数据（明确标注 demo）。
 *
 * 设计原则：
 *   1. 首屏不阻塞三维场景：接口在 onMounted 后异步拉取，失败不影响 BIM 渲染。
 *   2. 真实数据用 real，示例数据用 demo，页面上必须能区分（数据边界标注）。
 */
import { computed, ref, type Ref } from 'vue'
import {
  api,
  type AlertItem,
  type DashboardSummary,
  type Disease,
  type EmergencyMaterial,
  type Feedback,
  type ModuleEntry,
  type PublicNotice,
  type SceneOverview,
  type SceneOverviewPoint,
  type TrafficSegment,
  type WorkOrder,
} from '../api/client'
import { DEMO_ALERTS, type TunnelAlert } from '../config/alerts'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DataSource = 'loading' | 'api' | 'demo'

/** 一次数据请求的状态机 */
export function useAsyncData<T>(loader: () => Promise<T>, fallback?: T) {
  const data = ref(fallback) as Ref<T | undefined>
  const source = ref<DataSource>('loading')
  const error = ref<string>('')
  let seq = 0

  async function load() {
    const current = ++seq
    source.value = 'loading'
    error.value = ''
    try {
      const result = await loader()
      if (current !== seq) return
      data.value = result
      source.value = 'api'
    } catch (err) {
      if (current !== seq) return
      error.value = (err as Error)?.message ?? '接口调用失败'
      source.value = 'demo'
    }
  }

  return { data, source, error, load }
}

/** 数据来源角标文案 */
export function sourceLabel(source: DataSource) {
  return source === 'api' ? '接口实时' : source === 'loading' ? '加载中' : '示例数据'
}

export function sourceTagType(source: DataSource): 'success' | 'info' | 'warning' {
  return source === 'api' ? 'success' : source === 'loading' ? 'info' : 'warning'
}

/* ------------------------------------------------------------------ *
 * 示例数据（后端不可用时的回落，与页面原有示例保持一致）
 * ------------------------------------------------------------------ */

export const DEMO_FEEDBACK: Feedback[] = [
  { id: -1, code: 'FK-DEMO-01', channel: 'miniapp', content: '南口 K4+200 路面有积水，车辆通过溅水', stake: 'K4+200', status: 'pending', createdAt: new Date().toISOString() },
  { id: -2, code: 'FK-DEMO-02', channel: 'hotline', content: 'K3+300 顶部渗水，滴落到挡风玻璃', stake: 'K3+300', status: 'converted', createdAt: new Date().toISOString() },
  { id: -3, code: 'FK-DEMO-03', channel: 'miniapp', content: 'K2+500 照明灯不亮，光线昏暗', stake: 'K2+500', status: 'converted', createdAt: new Date().toISOString() },
  { id: -4, code: 'FK-DEMO-04', channel: 'miniapp', content: '北口诱导屏显示模糊', stake: 'K2+100', status: 'reviewed', createdAt: new Date().toISOString() },
  { id: -5, code: 'FK-DEMO-05', channel: 'hotline', content: '建议增加雨天限速提醒', stake: null, status: 'closed', createdAt: new Date().toISOString() },
]

export const DEMO_WORK_ORDERS: WorkOrder[] = [
  { id: -1, code: 'YH-DEMO-01', type: 'repair', title: '裂缝处置 K3+200', description: '贯穿裂缝，待派发', status: 'pending', priority: 'high', source: 'ai', stake: 'K3+200', slaHours: 24, overdue: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: -2, code: 'YH-DEMO-02', type: 'repair', title: '渗漏水处置 K3+350', description: '顶板渗漏，处理中', status: 'processing', priority: 'urgent', source: 'public', stake: 'K3+350', slaHours: 12, overdue: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: -3, code: 'YH-DEMO-03', type: 'inspection', title: '剥落巡检 K2+700', description: '轻微剥落，待验收', status: 'reviewing', priority: 'normal', source: 'manual', stake: 'K2+700', overdue: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

export const DEMO_DISEASES: Disease[] = [
  { id: -1, code: 'BH-DEMO-01', type: 'crack', severity: 'severe', stake: 'K3+200', sectionCode: 'SEC-03', description: '裂缝 K3+200', source: 'ai', status: 'found', foundAt: new Date().toISOString() },
  { id: -2, code: 'BH-DEMO-02', type: 'seepage', severity: 'severe', stake: 'K3+350', sectionCode: 'SEC-03', description: '渗漏水 K3+350', source: 'manual', status: 'repairing', foundAt: new Date().toISOString() },
  { id: -3, code: 'BH-DEMO-03', type: 'spalling', severity: 'slight', stake: 'K2+700', sectionCode: 'SEC-02', description: '剥落 K2+700', source: 'manual', status: 'reviewing', foundAt: new Date().toISOString() },
  { id: -4, code: 'BH-DEMO-04', type: 'joint', severity: 'medium', stake: 'K3+800', sectionCode: 'SEC-04', description: '变形缝 K3+800', source: 'ai', status: 'completed', foundAt: new Date().toISOString(), repairedAt: new Date().toISOString() },
]

export const DEMO_SEGMENTS: TrafficSegment[] = [
  { code: 'SEG-01', name: 'K2+100~K2+600', stakeStart: 'K2+100', stakeEnd: 'K2+600', flowVph: 1420, speedKmh: 62, occupancy: 12, congestion: 'smooth', recordedAt: new Date().toISOString() },
  { code: 'SEG-02', name: 'K2+600~K3+100', stakeStart: 'K2+600', stakeEnd: 'K3+100', flowVph: 1380, speedKmh: 60, occupancy: 14, congestion: 'smooth', recordedAt: new Date().toISOString() },
  { code: 'SEG-03', name: 'K3+100~K3+600', stakeStart: 'K3+100', stakeEnd: 'K3+600', flowVph: 1860, speedKmh: 48, occupancy: 22, congestion: 'slow', recordedAt: new Date().toISOString() },
  { code: 'SEG-04', name: 'K3+600~K4+100', stakeStart: 'K3+600', stakeEnd: 'K4+100', flowVph: 2100, speedKmh: 32, occupancy: 34, congestion: 'congested', recordedAt: new Date().toISOString() },
  { code: 'SEG-05', name: 'K4+100~K4+300', stakeStart: 'K4+100', stakeEnd: 'K4+300', flowVph: 1150, speedKmh: 58, occupancy: 15, congestion: 'smooth', recordedAt: new Date().toISOString() },
]

export const DEMO_MATERIALS: EmergencyMaterial[] = [
  { id: -1, name: '防汛沙袋', site: '物资间 A', stake: 'K2+400', quantity: 660, unit: '袋', sufficient: true },
  { id: -2, name: '移动泵车 M1', site: '北口值守点', stake: 'K2+100', quantity: 1, unit: '台', sufficient: true },
  { id: -3, name: '锥桶 / 警示牌', site: '物资间 B', stake: 'K3+800', quantity: 120, unit: '件', sufficient: true },
  { id: -4, name: '消防水带', site: '消防救援口', stake: 'K3+100', quantity: 8, unit: '盘', sufficient: false },
]

export const DEMO_NOTICES: PublicNotice[] = [
  { id: -1, title: 'K3 段积水处置，请减速慢行', level: 'red', channels: ['App推送', '诱导屏', '广播'], status: 'published', publishedAt: new Date().toISOString(), reachCount: 126000 },
  { id: -2, title: '今日有暴雨，请注意通道积水提示', level: 'yellow', channels: ['App推送', '诱导屏'], status: 'published', publishedAt: new Date().toISOString(), reachCount: 98000 },
  { id: -3, title: 'K2+600 夜间养护施工，临时占用左道', level: 'blue', channels: ['App推送', '诱导屏'], status: 'published', publishedAt: new Date().toISOString(), reachCount: 72000 },
]

/* ------------------------------------------------------------------ *
 * 各页面数据装配
 * ------------------------------------------------------------------ */

export interface OverviewData {
  summary?: DashboardSummary
  alerts: AlertItem[]
  /** 告警点位（后端 pointId 或按桩号就近匹配到的点位） */
  alertPoints: SceneOverviewPoint[]
}

/** 总览：驾驶舱聚合 + 未关闭告警 + 场景点位 */
export function useOverviewData() {
  const summary = useAsyncData<DashboardSummary>(() => api.get('/dashboard/summary'))
  const activeAlerts = useAsyncData<AlertItem[]>(() => api.get('/alerts/active'))
  const scene = useAsyncData<SceneOverview>(() => api.get('/scene/overview'))
  const modules = useAsyncData<ModuleEntry[]>(() => api.get('/dashboard/modules', undefined, { silent: true }))

  const alerts = computed<AlertItem[]>(() => activeAlerts.data.value ?? [])
  const points = computed<SceneOverviewPoint[]>(() => scene.data.value?.points ?? [])

  /** 场景点位 + 未关闭告警点位合并（告警按桩号就近落图） */
  const mergedPoints = computed(() => points.value)

  /** 告警 → 便于定位的点位 ID */
  function pointIdOf(alert: AlertItem): string | null {
    if (alert.pointId && points.value.some((p) => p.id === alert.pointId)) return alert.pointId
    const target = stakeValue(alert.stake)
    if (target == null) return null
    let best: { id: string; distance: number } | null = null
    for (const point of points.value) {
      const value = stakeValue(point.stake)
      if (value == null) continue
      const distance = Math.abs(value - target)
      if (!best || distance < best.distance) best = { id: point.id, distance }
    }
    return best?.id ?? null
  }

  const source = computed<DataSource>(() => {
    if (scene.source.value === 'api' && summary.source.value === 'api') return 'api'
    if (scene.source.value === 'loading' && summary.source.value === 'loading') return 'loading'
    return 'demo'
  })

  async function load() {
    await Promise.all([summary.load(), activeAlerts.load(), scene.load(), modules.load()])
  }

  return { summary, activeAlerts, scene, modules, alerts, points, mergedPoints, pointIdOf, source, load }
}

/** 把告警数组转为 AlertPanel 需要的 TunnelAlert（保持原有组件契约） */
export function alertToPanelAlert(alert: AlertItem): TunnelAlert {
  return {
    id: alert.code || String(alert.id),
    level: alert.level,
    time: formatClock(alert.occurredAt),
    source: alert.source,
    title: alert.title,
    description: alert.description ?? alert.title,
    stake: alert.stake ?? '—',
    pointId: alert.pointId ?? '',
    group: (alert.group as TunnelAlert['group']) ?? 'env',
    kind: (alert.kind as TunnelAlert['kind']) ?? 'illum',
  }
}

export function demoPanelAlerts(): TunnelAlert[] {
  return DEMO_ALERTS.map((alert) => ({ ...alert }))
}

/* ------------------------------ 工具函数 ------------------------------ */

export function formatClock(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function stakeValue(stake?: string | null): number | null {
  if (!stake) return null
  const match = /K(\d+)\+(\d{1,4})/i.exec(stake)
  return match ? Number(match[1]) * 1000 + Number(match[2]) : null
}

export const LEVEL_LABEL: Record<string, string> = {
  critical: '紧急',
  warning: '重要',
  info: '一般',
  notice: '提示',
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待派发',
  dispatched: '已派发',
  processing: '处理中',
  reviewing: '待验收',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消',
}

export const ORDER_STATUS_TYPE: Record<string, 'warning' | 'primary' | 'success' | 'info' | 'danger'> = {
  pending: 'warning',
  dispatched: 'warning',
  processing: 'primary',
  reviewing: 'warning',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'info',
}

export const DISEASE_TYPE_LABEL: Record<string, string> = {
  crack: '裂缝',
  seepage: '渗漏水',
  spalling: '剥落',
  joint: '变形缝',
}

export const DISEASE_STATUS_LABEL: Record<string, string> = {
  found: '病害发现',
  dispatched: '审核派发',
  repairing: '维修处置',
  reviewing: '现场验收',
  completed: '闭环归档',
  rejected: '已驳回',
}

export const SEVERITY_LABEL: Record<string, string> = {
  slight: '轻微',
  medium: '中等',
  severe: '严重',
}

export const SOURCE_LABEL: Record<string, string> = {
  ai: 'AI 识别',
  public: '公众反馈',
  manual: '人工巡检',
  patrol: '人工巡检',
  system: '系统自检',
}

export const CONGESTION_COLOR: Record<string, string> = {
  smooth: '#00b42a',
  slow: '#ff7d00',
  congested: '#f53f3f',
}

/* ------------------------------------------------------------------ *
 * 桩号 → 画面坐标
 * ------------------------------------------------------------------ */

const STAKE_MIN = 2100
const STAKE_MAX = 4300

/** 桩号在画面上的横向百分比：左口 K2+100 → 6%，右口 K4+300 → 94% */
export function stakeToLeft(stake?: string | null, fallback = 50): number {
  const value = stakeValue(stake)
  if (value == null) return fallback
  const ratio = (value - STAKE_MIN) / (STAKE_MAX - STAKE_MIN)
  const clamped = Math.min(1, Math.max(0, ratio))
  return Math.round((6 + clamped * 88) * 10) / 10
}
