export type AlertLevel = 'critical' | 'warning' | 'info' | 'notice'
export interface TunnelAlert {
  id: string
  level: AlertLevel
  time: string
  source: string
  title: string
  description: string
  stake: string
  pointId: string
}
export const ALERT_LEVELS: Record<AlertLevel, { label: string; color: string }> = {
  critical: { label: '紧急', color: '#f08d91' },
  warning: { label: '重要', color: '#e6b779' },
  info: { label: '一般', color: '#7fb7db' },
  notice: { label: '提示', color: '#879cb0' },
}
/** 沿用原页面的示例告警；轮播只是展示效果，不制造实时告警或假装轮询接口。 */
export const DEMO_ALERTS: readonly TunnelAlert[] = [
  {
    id: 'flood-3050',
    level: 'critical',
    time: '14:12',
    source: '数字应急',
    title: '积水液位快速上升',
    description: 'K3+050 积水监测点触发预警，请加强巡查并预置排涝设备。',
    stake: 'K3+050',
    pointId: 'w1',
  },
  {
    id: 'traffic-3050',
    level: 'warning',
    time: '13:48',
    source: '智能交通',
    title: '违停事件待确认',
    description: 'K3+050 AI 识别违停事件，尚未确认，请调取对应视频核实。',
    stake: 'K3+050',
    pointId: 'c2',
  },
  {
    id: 'board-3400',
    level: 'warning',
    time: '13:20',
    source: '智慧养护',
    title: '交通诱导屏离线',
    description: 'K3+400 诱导屏离线超过 30 分钟，建议检查供电与通信链路。',
    stake: 'K3+400',
    pointId: 'sc2',
  },
  {
    id: 'light-3200',
    level: 'info',
    time: '12:55',
    source: '智慧监测',
    title: '环境照度偏低',
    description: 'K3+200 照度偏低，建议检查照明回路及灯具运行状态。',
    stake: 'K3+200',
    pointId: 's2',
  },
  {
    id: 'flow-2800',
    level: 'info',
    time: '11:30',
    source: '智能交通',
    title: '断面流量异常下降',
    description: '断面流量骤降 40%，疑似拥堵，请结合现场视频核查。',
    stake: 'K2+800',
    pointId: 'vd1',
  },
]
