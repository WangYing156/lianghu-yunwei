import type { PointGroup, PointKind } from '../types/scene'
import type { ModelEquipment } from './modelEquipment'

export const BIM_MARKER_NEAR_DISTANCE = 45
export const BIM_MARKER_REAPPEAR_DISTANCE = 65
export const MARKER_CLUSTER_PIXELS = 46
export function equipmentPointType(e: ModelEquipment): {
  group: PointGroup
  kind: PointKind
} {
  switch (e.category) {
    case '视频监控':
      return { group: 'traffic', kind: 'camera' }
    case '通风设备':
      return {
        group: 'mep',
        kind: /风机/.test(e.name)
          ? 'fan'
          : /风阀/.test(e.name)
            ? 'damper'
            : 'vent',
      }
    case '消防泵组':
      return { group: 'mep', kind: 'firePump' }
    case '消防探测':
      return {
        group: 'env',
        kind: /烟感/.test(e.name)
          ? 'smokeSensor'
          : /感温/.test(e.name)
            ? 'heatSensor'
            : 'flame',
      }
    case '应急广播':
      return { group: 'traffic', kind: 'speaker' }
    case '照明设备':
      return { group: 'mep', kind: 'lamp' }
    default:
      return { group: 'structure', kind: 'passage' }
  }
}
export function isPriorityMarker(
  status: string,
  alarm?: string,
  selected = false,
): boolean {
  return selected || !!alarm || status === 'alarm' || status === 'warn'
}
/** 45/65m 滞回避免临界距离抖动；近景构件只保留实体模型而不是满屏图标。 */
export function hideBimMarkers(
  distance: number,
  previouslyHidden: boolean,
): boolean {
  return (
    distance <
    (previouslyHidden ? BIM_MARKER_REAPPEAR_DISTANCE : BIM_MARKER_NEAR_DISTANCE)
  )
}
/** 与设施设备图标清单一致。清单未单列的点位归到同组图标。 */
const deviceIcons: Record<string, string> = {
  fan: '🌀',
  vent: '🌀',
  damper: '🌀',
  pump: '⚙️',
  lamp: '💡',
  illum: '☀️',
  covi: '🌫️',
  wind: '🌬️',
  water: '💧',
  waterLevel: '💧',
  flame: '📡',
  heatSensor: '📡',
  smokeSensor: '📡',
  laneInd: '🚹',
  infoBoard: '🖥️',
  speaker: '🖥️',
  phone: '🖥️',
  camera: '📹',
  dome: '📹',
  vehicleDet: '📹',
  stress: '📏',
  corrosion: '📏',
  bolt: '📏',
  pressure: '📏',
  waterpress: '📏',
  disease: '📏',
  firePump: '🚒',
  fireValve: '🚒',
  fireStation: '🚒',
  structureUp: '🧱',
  structureDown: '🧱',
  structure: '🧱',
  pipe: '🔩',
  passage: '🟢',
  opsCenter: '🏢',
  rainPump: '🌧️',
  wastePump: '🚰',
  substation: '⚡',
  complaint: '📡',
}
function deviceIcon(kind: string): string {
  if (deviceIcons[kind]) return deviceIcons[kind]
  if (/fan|vent|damper/.test(kind)) return '🌀'
  if (/^pump$|waterPump|drain/.test(kind)) return '⚙️'
  if (/firePump|fireValve|fireStation|Pump|Valve/.test(kind)) return '🚒'
  if (/waterLevel|water/.test(kind)) return '💧'
  if (kind === 'illum') return '☀️'
  if (/lamp/.test(kind)) return '💡'
  if (/covi/.test(kind)) return '🌫️'
  if (/wind/.test(kind)) return '🌬️'
  if (/infoBoard|speaker|phone/.test(kind)) return '🖥️'
  if (/laneInd/.test(kind)) return '🚹'
  if (/camera|dome|vehicleDet/.test(kind)) return '📹'
  if (/stress|corrosion|bolt|pressure|waterpress|disease/.test(kind)) return '📏'
  if (/Sensor|flame|smoke|heat|complaint/.test(kind)) return '📡'
  return '🧱'
}
function pinFill(kind: string, status: string, selected: boolean): string {
  if (selected) return '#FF7702'
  if (status === 'alarm') return '#FF4D5E'
  if (status === 'warn') return '#FF9F1A'
  if (status === 'offline') return '#7C8B99'
  if (/camera|dome|infoBoard|laneInd|speaker|vehicleDet/.test(kind)) return '#2F9BFF'
  if (/fan|vent|damper|pump|lamp|firePump|fireValve/.test(kind)) return '#14C8B8'
  if (/water|covi|wind|illum|smoke|heat|flame|Sensor/.test(kind)) return '#3DCC78'
  if (/stress|corrosion|bolt|pressure|waterpress|disease|complaint/.test(kind))
    return '#F0A202'
  return '#7C93FF'
}
const cache = new Map<string, string>()

function markerSvg(kind: string, status: string, selected: boolean): string {
  const fill = pinFill(kind, status, selected)
  const emoji = deviceIcon(kind)
  const badge =
    status === 'alarm'
      ? `<circle cx="40" cy="10" r="6" fill="#FF4D5E" stroke="#fff" stroke-width="1.4"/><text x="40" y="12.2" text-anchor="middle" fill="#fff" font-size="9" font-family="Arial" font-weight="700">!</text>`
      : status === 'warn'
        ? `<circle cx="40" cy="10" r="6" fill="#FF9F1A" stroke="#fff" stroke-width="1.4"/><text x="40" y="12.2" text-anchor="middle" fill="#1a1200" font-size="9" font-family="Arial" font-weight="700">!</text>`
        : status === 'offline'
          ? `<circle cx="40" cy="10" r="5" fill="#9AA8B5" stroke="#fff" stroke-width="1.2"/>`
          : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80"><ellipse cx="32" cy="74" rx="10" ry="3" fill="#021018" fill-opacity=".45"/><circle cx="32" cy="30" r="24" fill="${fill}" stroke="#fff" stroke-width="2"/><path d="M32 76 22 44h20z" fill="${fill}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="30" r="18" fill="#fff"/><text x="32" y="37" text-anchor="middle" font-size="26">${emoji}</text>${badge}</svg>`
}

function markerCanvas(kind: string, status: string, selected: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return `data:image/svg+xml,${encodeURIComponent(markerSvg(kind, status, selected))}`
  const fill = pinFill(kind, status, selected)
  ctx.clearRect(0, 0, 128, 160)
  ctx.fillStyle = 'rgba(2, 8, 16, 0.4)'
  ctx.beginPath()
  ctx.ellipse(64, 148, 22, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  if (status === 'alarm' || status === 'warn' || selected) {
    ctx.fillStyle = fill
    ctx.globalAlpha = 0.2
    ctx.beginPath()
    ctx.arc(64, 52, 48, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.beginPath()
  ctx.arc(64, 58, 46, 0, Math.PI * 2)
  ctx.moveTo(64, 150)
  ctx.lineTo(48, 90)
  ctx.lineTo(80, 90)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(64, 58, 38, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.font = '72px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(deviceIcon(kind), 64, 62)
  if (status === 'alarm' || status === 'warn' || status === 'offline') {
    ctx.beginPath()
    ctx.arc(98, 22, 14, 0, Math.PI * 2)
    ctx.fillStyle = status === 'alarm' ? '#FF4D5E' : status === 'warn' ? '#FF9F1A' : '#9AA8B5'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    if (status !== 'offline') {
      ctx.fillStyle = status === 'alarm' ? '#ffffff' : '#1a1200'
      ctx.font = '700 18px sans-serif'
      ctx.fillText('!', 98, 23)
    }
  }
  return canvas.toDataURL('image/png')
}

/** 设备钉：分类色水滴 + 清单内彩色图标 + 状态角标。 */
export function markerSymbolUrl(
  kind: string,
  status = 'bim',
  selected = false,
): string {
  const key = `${kind}|${status}|${selected}`
  if (cache.has(key)) return cache.get(key)!
  const url =
    typeof document === 'undefined'
      ? `data:image/svg+xml,${encodeURIComponent(markerSvg(kind, status, selected))}`
      : markerCanvas(kind, status, selected)
  cache.set(key, url)
  return url
}
export function clusterSymbolUrl(count: number): string {
  const key = `cluster|${count}`
  if (cache.has(key)) return cache.get(key)!
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 48 48"><defs><radialGradient id="g" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#1a3d56"/><stop offset="100%" stop-color="#0b1f2e"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="#123549" fill-opacity=".4" stroke="#76aec6" stroke-opacity=".28"/><circle cx="24" cy="24" r="16.5" fill="url(#g)" stroke="#9fd0e4" stroke-width="1.4"/><text x="24" y="28.2" fill="#e7f6fb" font-size="${count > 99 ? 11 : 13}" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">${count}</text></svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  cache.set(key, url)
  return url
}
