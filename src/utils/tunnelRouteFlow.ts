import type { LngLat, TunnelRouteData } from './tunnelRouteLoader'

/** 线路切线方位角：0° 北，顺时针 */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0
  const rad = Math.atan2(dx, dy)
  let deg = (rad * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

/**
 * PictureMarkerSymbol.angle：相对图标默认朝向逆时针旋转（°）。
 * SVG 箭头默认指北，与「顺时针方位角」对齐需转换。
 */
export function pictureMarkerAngleDeg(a: LngLat, b: LngLat): number {
  return (360 - bearingDeg(a, b)) % 360
}

export const ARROW_SVG_URL =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" stroke="#059669" stroke-width="1.2" d="M12 2 L21 20 L12 16 L3 20 Z"/></svg>'
  )

export function sampleRoute(route: TunnelRouteData, t: number, epsilon = 0.002): {
  point: LngLat
  angle: number
} {
  const t0 = Math.max(0, t)
  const t1 = Math.min(1, t0 + epsilon)
  const p0 = route.pointAt(t0)
  const p1 = route.pointAt(t1)
  return { point: p0, angle: pictureMarkerAngleDeg(p0, p1) }
}

/** 沿路线截取一段折线（用于流动高亮段） */
export function sliceRoute(route: TunnelRouteData, tStart: number, tEnd: number, steps = 10): LngLat[] {
  const a = Math.max(0, Math.min(1, tStart))
  const b = Math.max(0, Math.min(1, tEnd))
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  const pts: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(route.pointAt(from + ((to - from) * i) / steps))
  }
  return pts
}
