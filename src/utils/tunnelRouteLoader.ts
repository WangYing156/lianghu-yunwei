import { stakeToProgress as stakeToProgressRaw, TUNNEL_STATION_INVERT } from '../config/mapBasemap'

function stakeToProgress(stake: string): number | null {
  const t = stakeToProgressRaw(stake)
  if (t == null) return null
  return TUNNEL_STATION_INVERT ? 1 - t : t
}

export const TUNNEL_GEOJSON_URL = `${import.meta.env.BASE_URL || '/'}geojson/两湖隧道.geojson`

export type LngLat = [number, number]

export interface TunnelRouteData {
  coordinates: LngLat[]
  center: LngLat
  /** 折线累计长度（经纬度平面近似，仅用于桩号插值） */
  totalLength: number
  pointAt: (t: number) => LngLat
  toScreenPercentRoute: () => { x: number; y: number }[]
}

let cache: Promise<TunnelRouteData> | null = null

function segmentLengths(coords: LngLat[]): number[] {
  return coords.slice(1).map((p, i) => {
    const a = coords[i]
    return Math.hypot(p[0] - a[0], p[1] - a[1])
  })
}

function interpolateAt(coords: LngLat[], t: number): LngLat {
  if (coords.length === 0) return [114.36, 30.49]
  if (coords.length === 1) return coords[0]
  const segLens = segmentLengths(coords)
  const total = segLens.reduce((a, b) => a + b, 0)
  if (total <= 0) return coords[0]

  let d = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]
    if (d <= len || i === segLens.length - 1) {
      const r = len > 0 ? Math.min(d / len, 1) : 0
      const a = coords[i]
      const b = coords[i + 1]
      return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]
    }
    d -= len
  }
  return coords[coords.length - 1]
}

function lngLatToScreenPercent(coords: LngLat[]): { x: number; y: number }[] {
  if (!coords.length) return [{ x: 50, y: 50 }]
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const pad = 6
  const spanX = maxLng - minLng || 1e-6
  const spanY = maxLat - minLat || 1e-6
  const inner = 100 - pad * 2
  return coords.map(([lng, lat]) => ({
    x: pad + ((lng - minLng) / spanX) * inner,
    y: pad + (1 - (lat - minLat) / spanY) * inner
  }))
}

function buildFromGeoJson(raw: {
  features?: Array<{
    geometry?: { type?: string; coordinates?: number[] }
  }>
}): TunnelRouteData {
  const coordinates: LngLat[] = (raw.features ?? [])
    .filter(f => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map(f => [f.geometry!.coordinates![0], f.geometry!.coordinates![1]] as LngLat)

  if (!coordinates.length) {
    throw new Error('两湖隧道 GeoJSON 未包含有效 Point 要素')
  }

  const segLens = segmentLengths(coordinates)
  const totalLength = segLens.reduce((a, b) => a + b, 0)
  const mid = coordinates[Math.floor(coordinates.length / 2)]

  return {
    coordinates,
    center: mid,
    totalLength,
    pointAt: (t: number) => interpolateAt(coordinates, t),
    toScreenPercentRoute: () => lngLatToScreenPercent(coordinates)
  }
}

export function loadTunnelRoute(): Promise<TunnelRouteData> {
  if (!cache) {
    cache = fetch(TUNNEL_GEOJSON_URL)
      .then(res => {
        if (!res.ok) throw new Error(`加载隧道路线失败: ${res.status}`)
        return res.json()
      })
      .then(buildFromGeoJson)
      .catch(error => { cache = null; throw error })
  }
  return cache
}

export function resetTunnelRouteCache(): void {
  cache = null
}

export interface TunnelMapPoint {
  id: string
  stake: string
}

function hashId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

function hashProgress(id: string): number {
  return (hashId(id) % 997) / 996
}

/** 按桩号顺序将设备点映射到 GeoJSON 折线（保证落在线上） */
export function progressOnRoute(p: TunnelMapPoint, all: TunnelMapPoint[]): number {
  const parsed = all
    .map(item => ({
      id: item.id,
      t: stakeToProgress(item.stake)
    }))
    .filter(x => x.t != null) as { id: string; t: number }[]

  const direct = stakeToProgress(p.stake)
  if (direct != null) return direct

  const unparsed = all.filter(item => stakeToProgress(item.stake) == null)
  const uidx = unparsed.findIndex(item => item.id === p.id)
  if (uidx >= 0 && unparsed.length > 1) {
    return 0.05 + (uidx / (unparsed.length - 1)) * 0.9
  }
  if (parsed.length >= 2) {
    const sorted = [...parsed].sort((a, b) => a.t - b.t)
    const idx = sorted.findIndex(x => x.id === p.id)
    if (idx >= 0) return sorted[idx].t
  }
  return hashProgress(p.id)
}

export function geoForPointOnRoute(route: TunnelRouteData, p: TunnelMapPoint, all: TunnelMapPoint[]): LngLat {
  const t = progressOnRoute(p, all)
  const [lng, lat] = route.pointAt(t)
  const jitter = ((hashId(p.id) % 5) - 2) * 0.000012
  return [lng + jitter, lat + jitter * 0.6]
}
