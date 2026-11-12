/**
 * 孪生工况中与 Cesium 解耦的物理表达。
 *
 * 这里只处理可解释、可单测的计算：积水用水平水面与真实路面纵坡求交，
 * 不再用固定直径圆盘悬在坡道路面上。输入坐标单位均为米、z 向上。
 */
import type { Point3 } from './roamingPath'

export interface FloodExtent {
  /** 水面绝对高程（tileset 局部 z） */
  surfaceZ: number
  /** 沿路线弧长的淹没起止位置，单位米；direction=-1 时 start 可能大于 end */
  startMeters: number
  endMeters: number
  centerMeters: number
  /** 水平投影长度，用作水面图元沿路线方向的尺寸 */
  horizontalLength: number
}

export interface FloodExtentOptions {
  /** 低点向下游保留的可见水面长度，避免把模型切口外的水面也算进来 */
  startMargin?: number
  /** 向上游最多搜索的距离 */
  maxLookahead?: number
  /** 路线弧长增大方向上，路面升高为 1；相反为 -1 */
  direction?: 1 | -1
  /** 水面与路面相交的容差；小于此深度视为岸线 */
  minDepth?: number
  /** 扫描步长，单位米 */
  sampleStep?: number
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))

/**
 * 给定按弧长采样的路面函数与低点液位，求一段水平水面覆盖的路面范围。
 * 典型隧道纵坡下，水位越高、向上游延伸越长；水面本身保持水平。
 */
export function solveFloodExtent(
  sampleAt: (meters: number) => Point3,
  routeLength: number,
  lowPointMeters: number,
  waterDepth: number,
  options: FloodExtentOptions = {},
): FloodExtent {
  const length = Math.max(1, Number.isFinite(routeLength) ? routeLength : 1)
  const origin = clamp(lowPointMeters, 1, length - 1)
  const depth = Math.max(0, Number.isFinite(waterDepth) ? waterDepth : 0)
  const direction: 1 | -1 = options.direction === -1 ? -1 : 1
  const startMargin = Math.max(0.5, options.startMargin ?? 8)
  const maxLookahead = Math.max(startMargin + 2, options.maxLookahead ?? 70)
  const minDepth = Math.max(0.001, options.minDepth ?? 0.004)
  const step = clamp(options.sampleStep ?? 0.75, 0.1, 5)
  const surfaceZ = sampleAt(origin)[2] + depth
  const shore = surfaceZ - minDepth
  // 下游从低点反向留一段模型内水面，再沿上坡方向寻找路面与水平水面的交点。
  const startMeters = clamp(origin - direction * startMargin, 1, length - 1)
  const maxMeters = clamp(origin + direction * maxLookahead, 1, length - 0.5)
  const span = Math.abs(maxMeters - startMeters)
  const low = Math.min(startMeters, maxMeters)
  const high = Math.max(startMeters, maxMeters)

  let endMeters = startMeters
  let previous = startMeters
  let previousZ = sampleAt(previous)[2]
  for (let offset = step; offset <= span + step; offset += step) {
    const travel = Math.min(offset, span)
    const at = startMeters + direction * travel
    const z = sampleAt(at)[2]
    if (z <= shore) {
      previous = at
      previousZ = z
      endMeters = at
      if (travel >= span) break
      continue
    }
    // 线性插值求路面与水平水面的交点；坡道路面采样点之间足够平滑。
    const denominator = z - previousZ
    const ratio = denominator > 0 ? clamp((shore - previousZ) / denominator, 0, 1) : 0
    endMeters = previous + (at - previous) * ratio
    break
  }
  // 极低水位或采样异常时仍保留一小片可见水面，避免图元退化。
  const bounded = clamp(endMeters, low, high)
  endMeters = Math.abs(bounded - startMeters) < 0.6
    ? clamp(startMeters + direction * 0.6, low, high)
    : bounded

  const a = sampleAt(startMeters)
  const b = sampleAt(endMeters)
  return {
    surfaceZ,
    startMeters,
    endMeters,
    centerMeters: (startMeters + endMeters) / 2,
    horizontalLength: Math.max(0.6, Math.hypot(b[0] - a[0], b[1] - a[1])),
  }
}

/** 自动推演总时长；0 表示由第一人称行进进度驱动，而不是时间步。 */
export function scenarioDuration(durations: readonly number[]): number {
  return durations.reduce((sum, n) => sum + Math.max(0, Number.isFinite(n) ? n : 0), 0)
}

/** 由步骤进度换算到第一人称路线的起点，保证切视角不会跳回入口。 */
export function walkAlongAtStep(from: number, to: number, step: number, k: number, steps: number): number {
  const progress = clamp((step + clamp(k, 0, 1)) / Math.max(1, steps), 0, 1)
  return from + (to - from) * progress
}
