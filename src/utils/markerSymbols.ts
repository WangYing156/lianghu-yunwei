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
const paths: Record<string, string> = {
  camera:
    '<rect x="5" y="8" width="10" height="8" rx="2"/><path d="m15 10 4-2v8l-4-2M9 18h4"/>',
  dome: '<path d="M5 9h14M7 9a5 5 0 0 1 10 0M6 10v3a6 6 0 0 0 12 0v-3M10 18v2h4v-2"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10C5 2 4 14 10 13M14 12c11-2 1-11-1-3M11 14c-3 10 10 5 3-1"/>',
  pump: '<path d="M3 7h4v10H3M17 7h4v10h-4M7 10h10v7H7zM9 10V6h6v4M10 20h5"/><circle cx="12" cy="13.5" r="1.5"/>',
  sensor:
    '<circle cx="12" cy="13" r="4"/><path d="M9 5a11 11 0 0 1 6 0M6 3a15 15 0 0 1 12 0M10 19h4M12 11v2l1 1"/>',
  water:
    '<path d="M12 3c-2 4-7 7-7 11a7 7 0 0 0 14 0c0-4-5-7-7-11ZM9 14a3 3 0 0 0 3 3"/>',
  lamp: '<path d="M8 14a6 6 0 1 1 8 0l-1 3H9zM10 20h4M12 2v1M3 9h1M20 9h1"/>',
  board:
    '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M8 16v4M16 16v4M7 9h10M7 12h6"/>',
  speaker: '<path d="M4 10h4l7-5v14l-7-5H4zM18 8a7 7 0 0 1 0 8"/>',
  passage: '<path d="M5 20V4h14v16M9 12h9m-3-3 3 3-3 3M9 20h10"/>',
  structure:
    '<path d="M4 20v-9a8 8 0 0 1 16 0v9M8 20v-9a4 4 0 0 1 8 0v9M3 20h18M12 16v4"/>',
  monitor:
    '<path d="M3 12h4l3-7 4 14 3-7h4"/><rect x="2" y="3" width="20" height="18" rx="3"/>',
}
function symbol(kind: string): string {
  if (paths[kind]) return paths[kind]
  if (/Pump|pump|Valve/.test(kind)) return paths.pump
  if (/Sensor|covi|wind|illum/.test(kind))
    return kind === 'illum' ? paths.lamp : paths.sensor
  if (/infoBoard|laneInd/.test(kind)) return paths.board
  if (/fan|vent|damper/.test(kind)) return paths.fan
  if (/waterLevel/.test(kind)) return paths.water
  if (
    /corrosion|bolt|pressure|stress|waterpress|disease|complaint|vehicleDet/.test(
      kind,
    )
  )
    return paths.monitor
  return paths.structure
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
/** 设备总览钉：分类色水滴 + 白图标 + 状态角标，告警/预警带光晕。 */
export function markerSymbolUrl(
  kind: string,
  status = 'bim',
  selected = false,
): string {
  const key = `${kind}|${status}|${selected}`
  if (cache.has(key)) return cache.get(key)!
  const fill = pinFill(kind, status, selected)
  const halo =
    status === 'alarm'
      ? `<circle cx="24" cy="22" r="20" fill="${fill}" fill-opacity=".16"/><circle cx="24" cy="22" r="17" fill="none" stroke="${fill}" stroke-opacity=".45" stroke-width="1.2"/>`
      : status === 'warn' || selected
        ? `<circle cx="24" cy="22" r="18" fill="${fill}" fill-opacity=".12"/>`
        : ''
  const badge =
    status === 'alarm'
      ? `<circle cx="36" cy="8" r="6" fill="#FF4D5E" stroke="#fff" stroke-width="1.2"/><text x="36" y="10.2" text-anchor="middle" fill="#fff" font-size="8" font-family="Arial,sans-serif" font-weight="700">!</text>`
      : status === 'warn'
        ? `<circle cx="36" cy="8" r="6" fill="#FF9F1A" stroke="#fff" stroke-width="1.2"/><text x="36" y="10.2" text-anchor="middle" fill="#1a1200" font-size="8" font-family="Arial,sans-serif" font-weight="700">!</text>`
        : status === 'offline'
          ? `<circle cx="36" cy="8" r="5" fill="#9AA8B5" stroke="#fff" stroke-width="1"/>`
          : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="60" viewBox="0 0 48 60">${halo}<ellipse cx="24" cy="55" rx="7" ry="2.4" fill="#041018" fill-opacity=".35"/><path d="M24 2.5c-9.6 0-17.4 7.5-17.4 16.8C6.6 30.2 24 50.5 24 50.5S41.4 30.2 41.4 19.3C41.4 10 33.6 2.5 24 2.5z" fill="${fill}" stroke="#ffffff" stroke-opacity=".88" stroke-width="1.3"/><circle cx="24" cy="19.2" r="10.2" fill="#062033" fill-opacity=".28"/><g transform="translate(12 7.2)" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${symbol(kind)}</g>${badge}</svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
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
