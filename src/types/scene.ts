export type PointKind =
  // 隧道主体
  | 'structureUp'
  | 'structureDown'
  | 'pipe'
  | 'passage'
  | 'opsCenter'
  | 'rainPump'
  | 'fireStation'
  | 'wastePump'
  | 'substation'
  // 环控系统
  | 'covi'
  | 'wind'
  | 'illum'
  | 'flame'
  | 'heatSensor'
  | 'smokeSensor'
  | 'waterLevel'
  // 交通管控
  | 'laneInd'
  | 'infoBoard'
  | 'vehicleDet'
  | 'camera'
  | 'dome'
  | 'phone'
  | 'speaker'
  // 结构监测
  | 'corrosion'
  | 'bolt'
  | 'pressure'
  | 'stress'
  | 'waterpress'
  // 隧道机电
  | 'fan'
  | 'damper'
  | 'vent'
  | 'firePump'
  | 'fireValve'
  | 'lamp'
  | 'pump'
  // 功能点位（病害/投诉）
  | 'disease'
  | 'complaint'

export type PointGroup = 'structure' | 'env' | 'traffic' | 'monitor' | 'mep'

export interface ScenePoint {
  id: string
  name: string
  kind: PointKind
  group: PointGroup
  status: 'ok' | 'warn' | 'alarm' | 'offline'
  left: string
  top: string
  leftNum: number
  scale: number
  stake: string
  value?: string
  inspect?: string
  alarm?: string
  icon?: string
  videoId?: string
  simulated?: boolean
  alertId?: string
  unit?: string
  history?: { time: string; value: number }[]
}
