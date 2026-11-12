/** 领域对象的 TypeBox 定义，直接用于 OpenAPI 响应文档与序列化 */
import { Type } from '@sinclair/typebox'

const Iso = (description) => Type.String({ format: 'date-time', description })

export const AlertLevel = Type.Union(
  ['critical', 'warning', 'info', 'notice'].map((value) => Type.Literal(value)),
  { description: '告警等级：critical 紧急 / warning 重要 / info 一般 / notice 提示' },
)

export const AlertStatus = Type.Union(['open', 'acknowledged', 'closed'].map((v) => Type.Literal(v)), {
  description: '告警状态：open 未确认 / acknowledged 已确认 / closed 已关闭',
})

export const DeviceStatus = Type.Union(['ok', 'warn', 'alarm', 'offline'].map((v) => Type.Literal(v)), {
  description: '设备状态',
})

export const PointGroupCode = Type.Union(
  ['structure', 'env', 'traffic', 'monitor', 'mep'].map((v) => Type.Literal(v)),
  { description: '点位分组：主体结构 / 环控 / 交通 / 结构监测 / 机电' },
)

export const Alert = Type.Object({
  id: Type.Integer(),
  code: Type.String({ example: 'AL-20261018-0001' }),
  level: AlertLevel,
  status: AlertStatus,
  source: Type.String({ example: '数字应急' }),
  title: Type.String(),
  description: Type.String(),
  stake: Type.Union([Type.String(), Type.Null()]),
  pointId: Type.Union([Type.String(), Type.Null()], { description: '三维场景点位 ID，可直接用于场景定位' }),
  group: Type.Union([Type.String(), Type.Null()]),
  kind: Type.Union([Type.String(), Type.Null()]),
  deviceId: Type.Union([Type.Integer(), Type.Null()]),
  deviceName: Type.Union([Type.String(), Type.Null()]),
  occurredAt: Iso(),
  ackedAt: Type.Union([Iso(), Type.Null()]),
  ackedByName: Type.Union([Type.String(), Type.Null()]),
  closedAt: Type.Union([Iso(), Type.Null()]),
  elapsedMinutes: Type.Integer({ description: '自发生至今的分钟数' }),
})

export const Device = Type.Object({
  id: Type.Integer(),
  code: Type.String({ example: 'SYS-JF-0001' }),
  name: Type.String(),
  categoryCode: Type.String(),
  categoryName: Type.String(),
  group: Type.String(),
  stake: Type.String(),
  positionDesc: Type.Union([Type.String(), Type.Null()]),
  systemName: Type.Union([Type.String(), Type.Null()]),
  model: Type.Union([Type.String(), Type.Null()]),
  vendor: Type.Union([Type.String(), Type.Null()]),
  installDate: Type.Union([Type.String(), Type.Null()]),
  status: DeviceStatus,
  cardGroup: Type.Union([Type.String(), Type.Null()], { description: '总览设备状态卡片分组' }),
  runState: Type.Union([Type.String(), Type.Null()]),
  ip: Type.Union([Type.String(), Type.Null()]),
  pointId: Type.Union([Type.String(), Type.Null()]),
  lastSeenAt: Type.Union([Iso(), Type.Null()]),
  openAlertCount: Type.Optional(Type.Integer()),
})

export const ScenePoint = Type.Object({
  id: Type.String(),
  moduleCode: Type.String(),
  name: Type.String(),
  kind: Type.String(),
  group: PointGroupCode,
  status: DeviceStatus,
  left: Type.String({ description: '二维定位百分比，如 46%' }),
  top: Type.String(),
  leftNum: Type.Number(),
  scale: Type.Number(),
  stake: Type.String(),
  value: Type.Union([Type.String(), Type.Null()]),
  alarm: Type.Union([Type.String(), Type.Null()]),
  inspect: Type.Union([Type.String(), Type.Null()]),
  deviceId: Type.Union([Type.Integer(), Type.Null()]),
})

export const WorkOrder = Type.Object({
  id: Type.Integer(),
  code: Type.String({ example: 'GD-20261016-01' }),
  type: Type.String(),
  title: Type.String(),
  description: Type.String(),
  status: Type.String({ description: 'pending/dispatched/processing/reviewing/completed/rejected/cancelled' }),
  priority: Type.String(),
  source: Type.String(),
  stake: Type.Union([Type.String(), Type.Null()]),
  diseaseId: Type.Union([Type.Integer(), Type.Null()]),
  alertId: Type.Union([Type.Integer(), Type.Null()]),
  assigneeId: Type.Union([Type.Integer(), Type.Null()]),
  assigneeName: Type.Union([Type.String(), Type.Null()]),
  slaHours: Type.Integer(),
  dueAt: Type.Union([Iso(), Type.Null()]),
  dispatchedAt: Type.Union([Iso(), Type.Null()]),
  completedAt: Type.Union([Iso(), Type.Null()]),
  overdue: Type.Boolean({ description: '是否已超时（未完成且超过 dueAt）' }),
  createdAt: Iso(),
  updatedAt: Iso(),
})

export const WorkOrderLog = Type.Object({
  id: Type.Integer(),
  action: Type.String(),
  fromStatus: Type.Union([Type.String(), Type.Null()]),
  toStatus: Type.Union([Type.String(), Type.Null()]),
  operatorName: Type.Union([Type.String(), Type.Null()]),
  remark: Type.Union([Type.String(), Type.Null()]),
  createdAt: Iso(),
})

export const Disease = Type.Object({
  id: Type.Integer(),
  code: Type.String(),
  type: Type.String(),
  severity: Type.String(),
  stake: Type.String(),
  sectionCode: Type.Union([Type.String(), Type.Null()]),
  description: Type.String(),
  source: Type.String(),
  status: Type.String(),
  pointId: Type.Union([Type.String(), Type.Null()]),
  foundAt: Iso(),
  repairedAt: Type.Union([Iso(), Type.Null()]),
  elapsedHours: Type.Number(),
})

export const TrafficEvent = Type.Object({
  id: Type.Integer(),
  code: Type.String(),
  type: Type.String(),
  level: Type.String(),
  stake: Type.String(),
  confidence: Type.Number(),
  status: Type.String(),
  cameraId: Type.Union([Type.Integer(), Type.Null()]),
  cameraName: Type.Union([Type.String(), Type.Null()]),
  detectedAt: Iso(),
  handledAt: Type.Union([Iso(), Type.Null()]),
  remark: Type.Union([Type.String(), Type.Null()]),
})

export const TimeSeries = Type.Object({
  deviceId: Type.Integer(),
  deviceCode: Type.String(),
  deviceName: Type.String(),
  metric: Type.String(),
  unit: Type.Union([Type.String(), Type.Null()]),
  points: Type.Array(
    Type.Object({
      time: Iso(),
      value: Type.Number(),
    }),
  ),
})
 
export const PublishTask = Type.Object({
  id: Type.Integer(),
  taskNo: Type.String(),
  title: Type.String(),
  content: Type.String(),
  level: Type.String(),
  channels: Type.Array(Type.String()),
  status: Type.String(),
  scheduledStart: Type.Union([Iso(), Type.Null()]),
  scheduledEnd: Type.Union([Iso(), Type.Null()]),
  boardIds: Type.Array(Type.Integer()),
  boardNames: Type.Array(Type.String()),
  publishedAt: Type.Union([Iso(), Type.Null()]),
  reachCount: Type.Integer(),
  createdAt: Iso(),
})

export const Feedback = Type.Object({
  id: Type.Integer(),
  code: Type.String(),
  channel: Type.String(),
  content: Type.String(),
  stake: Type.Union([Type.String(), Type.Null()]),
  pointId: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  workOrderId: Type.Union([Type.Integer(), Type.Null()]),
  createdAt: Iso(),
  handledAt: Type.Union([Iso(), Type.Null()]),
})

export const User = Type.Object({
  id: Type.Integer(),
  username: Type.String(),
  displayName: Type.String(),
  role: Type.String(),
  phone: Type.Union([Type.String(), Type.Null()]),
  dept: Type.Union([Type.String(), Type.Null()]),
  isActive: Type.Boolean(),
  lastLoginAt: Type.Union([Iso(), Type.Null()]),
})
