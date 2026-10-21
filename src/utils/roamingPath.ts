/** 与渲染引擎无关的弧长路径运算。播放速度按米/秒计算，不随帧率变化。 */
export type Point3 = readonly [number, number, number]
export interface RoamingPath {
  points: Point3[]
  cumulative: number[]
  length: number
}
const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))

export function createRoamingPath(input: readonly Point3[]): RoamingPath {
  const points = input
    .filter((p) => p.length === 3 && p.every(Number.isFinite))
    .filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 0.001)
  if (points.length < 2) throw new Error('巡游路线至少需要两个不同的有效坐标')
  const cumulative = [0]
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]))
  return { points, cumulative, length: cumulative[cumulative.length - 1] }
}

export function sampleRoamingPath(
  path: RoamingPath,
  progress: number,
): { point: Point3; tangent: Point3 } {
  const d = clamp01(progress) * path.length
  let i = path.cumulative.findIndex((v, idx) => idx > 0 && v >= d)
  if (i < 1) i = path.points.length - 1
  const a = path.points[i - 1],
    b = path.points[i]
  const segment = path.cumulative[i] - path.cumulative[i - 1]
  const t = clamp01((d - path.cumulative[i - 1]) / segment)
  // 相邻切线混合，避免采样段交界处相机突然转头。
  const before = path.points[Math.max(0, i - 2)]
  const after = path.points[Math.min(path.points.length - 1, i + 1)]
  const da = distance(before, b),
    db = distance(a, after)
  const tangent = [0, 1, 2].map(
    (k) => ((b[k] - before[k]) / da) * (1 - t) + ((after[k] - a[k]) / db) * t,
  ) as [number, number, number]
  const magnitude = Math.hypot(...tangent) || 1
  return {
    point: [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t) as [number, number, number],
    tangent: tangent.map((v) => v / magnitude) as [number, number, number],
  }
}

export function nearestRoamingProgress(
  path: RoamingPath,
  point: Point3,
): { progress: number; distance: number } {
  let best = { progress: 0, distance: Infinity }
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1],
      b = path.points[i]
    const v = b.map((n, k) => n - a[k])
    const squared = v.reduce((sum, n) => sum + n * n, 0)
    const t = clamp01(v.reduce((sum, n, k) => sum + n * (point[k] - a[k]), 0) / squared)
    const p = a.map((n, k) => n + v[k] * t) as [number, number, number]
    const dist = distance(p, point)
    if (dist < best.distance)
      best = {
        progress: (path.cumulative[i - 1] + Math.sqrt(squared) * t) / path.length,
        distance: dist,
      }
  }
  return best
}

export function advanceRoamingProgress(
  progress: number,
  elapsedSeconds: number,
  speed: number,
  length: number,
  direction: 1 | -1,
): number {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(speed)) return clamp01(progress)
  // 标签页切回时不跨越大段路线。
  const delta = Math.max(0, Math.min(0.1, elapsedSeconds))
  return clamp01(progress + (delta * Math.max(0, speed) * direction) / length)
}
