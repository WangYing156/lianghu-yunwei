/** 绝对米制二维定位窗口：不依赖上一相机高度/缩放，不受重复点击或图层筛选影响。 */
export function pointFocusRectangle(
  lng: number,
  lat: number,
  aspect = 1.6,
  span = 560,
): [number, number, number, number] {
  const ratio = Number.isFinite(aspect)
    ? Math.max(0.5, Math.min(4, aspect))
    : 1.6
  span = Number.isFinite(span) ? Math.max(80, span) : 560
  const minimumHeight = Math.min(360, span * 0.64)
  const width = Math.max(span, minimumHeight * ratio)
  const height = width / ratio
  const halfLat = height / 2 / 111_320
  const halfLng =
    width / 2 / (111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))
  return [lng - halfLng, lat - halfLat, lng + halfLng, lat + halfLat]
}
