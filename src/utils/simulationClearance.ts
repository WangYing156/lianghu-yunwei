/**
 * 孪生工况车辆空间校核（与 Cesium 解耦，单位：米）。
 *
 * 竣工道路的纵向标线约在路线横向 ±1.8 / ±4.5；仿真车辆按三条安全走廊
 * 左 -3.25 / 中 0 / 右 2.95 行驶，并在每一帧对车位做二维包络求解。
 * 车辆后视镜、保险杠、引导线/锥桶、积水/泵站/标牌立柱和相邻车辆都参与净距检查；
 * 无法安全落位的车辆会被隐藏，不会穿模或压线。
 */
export interface VehicleRequest {
  id: string
  /** 相对事件点的路线弧长，正方向为水流/行车方向 */
  along: number
  /** 相对路线中心的横向偏移 */
  lateral: number
  length: number
  width: number
  visible?: boolean
  /** 数值大的先占位；消防车/事故车优先于社会车辆 */
  priority?: number
  /** 拥挤时优先避让方向：-1 上游，+1 下游 */
  escape?: number
}

export interface GuideLine {
  id: string
  lateral: number
  /** 物理半宽；缺省按 0.09m 标线 */
  halfWidth?: number
}

export interface StaticObstacle {
  id: string
  along: number
  lateral: number
  length: number
  width: number
}

export interface VehiclePlacement {
  id: string
  along: number
  lateral: number
  length: number
  width: number
  halfLength: number
  halfWidth: number
  visible: boolean
  adjusted: boolean
}

export interface ClearanceAudit {
  ok: boolean
  vehicles: number
  guides: number
  obstacles: number
  suppressed: number
  minVehicleGap: number
  minGuideGap: number
  minObstacleGap: number
  violations: string[]
}

export interface ClearanceSolution extends ClearanceAudit {
  placements: VehiclePlacement[]
}

export interface ClearanceOptions {
  roadHalfWidth?: number
  lineHalfWidth?: number
  lateralMargin?: number
  longitudinalMargin?: number
  alongMin?: number
  alongMax?: number
}

/** 由竣工 BIM 道路断面标线校准得到；外围为实线，内侧为车道分界线。 */
export const TUNNEL_ROAD_HALF_WIDTH = 4.5
export const TUNNEL_MARKING_LATERALS = [-4.5, -1.8, 1.8, 4.5] as const
export const TWIN_SAFE_LANES = {
  left: -3.25,
  center: 0,
  right: 3.05,
  shoulder: 4.1,
} as const

export const TUNNEL_LANE_GUIDES: readonly GuideLine[] = TUNNEL_MARKING_LATERALS.map(
  (lateral, i) => ({ id: `bim-lane-${i}`, lateral }),
)

const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback)
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const NO_GAP = 99

/** 车辆包络：后视镜比车身更宽，保险杠比车身更长，再留一层安全裕量。 */
export function vehicleHalfWidth(width: number): number {
  return Math.max(width / 2, width * 0.52 + 0.035) + 0.06
}
export function vehicleHalfLength(length: number): number {
  return length / 2 + 0.08
}

export function emptyClearanceAudit(): ClearanceAudit {
  return {
    ok: true,
    vehicles: 0,
    guides: 0,
    obstacles: 0,
    suppressed: 0,
    minVehicleGap: NO_GAP,
    minGuideGap: NO_GAP,
    minObstacleGap: NO_GAP,
    violations: [],
  }
}

function subtractRanges(
  ranges: readonly (readonly [number, number])[],
  blocked: readonly (readonly [number, number])[],
): [number, number][] {
  let current = ranges.map(([a, b]) => [a, b] as [number, number])
  for (const [lo, hi] of blocked) {
    const next: [number, number][] = []
    for (const [a, b] of current) {
      if (hi <= a || lo >= b) {
        next.push([a, b])
        continue
      }
      if (lo > a) next.push([a, Math.min(lo, b)])
      if (hi < b) next.push([Math.max(hi, a), b])
    }
    current = next.filter(([a, b]) => b - a > 1e-6)
  }
  return current
}

/**
 * 把期望横向位置钳制到不压任何标线/诱导线的安全走廊；无解时返回 null。
 */
export function clampLateralForGuides(
  preferred: number,
  halfWidth: number,
  guides: readonly GuideLine[],
  options: ClearanceOptions = {},
): number | null {
  const road = Math.max(halfWidth + 0.2, finite(options.roadHalfWidth, TUNNEL_ROAD_HALF_WIDTH))
  const lineHalf = Math.max(0.01, finite(options.lineHalfWidth, 0.09))
  const margin = Math.max(0, finite(options.lateralMargin, 0.18))
  const low = -road + margin + halfWidth
  const high = road - margin - halfWidth
  if (high < low) return null
  const blocked = guides.map((g) => {
    const h = Math.max(0.01, finite(g.halfWidth, lineHalf))
    return [g.lateral - h - margin - halfWidth, g.lateral + h + margin + halfWidth] as const
  })
  const ranges = subtractRanges([[low, high]], blocked)
  if (!ranges.length) return null
  let best = clamp(preferred, ranges[0][0], ranges[0][1])
  let distance = Math.abs(best - preferred)
  for (const [a, b] of ranges.slice(1)) {
    const candidate = clamp(preferred, a, b)
    const d = Math.abs(candidate - preferred)
    if (d < distance - 1e-9) {
      best = candidate
      distance = d
    }
  }
  return best
}

/** 沿路线方向找最近的空位；被占用区间按两台车的包络 + 安全裕量扣除。 */
function nearestFreeAlong(
  preferred: number,
  halfLength: number,
  blocked: readonly (readonly [number, number])[],
  alongMin: number,
  alongMax: number,
  preferredEscape: number,
): number | null {
  const escape: -1 | 1 = preferredEscape < 0 ? -1 : 1
  const ranges = subtractRanges([[alongMin + halfLength, alongMax - halfLength]], blocked)
  if (!ranges.length) return null
  let best = clamp(preferred, ranges[0][0], ranges[0][1])
  let distance = Math.abs(best - preferred)
  let bias = (best - preferred) * escape
  for (const [a, b] of ranges.slice(1)) {
    const candidate = clamp(preferred, a, b)
    const d = Math.abs(candidate - preferred)
    const b2 = (candidate - preferred) * escape
    if (d < distance - 1e-9 || (Math.abs(d - distance) < 1e-9 && b2 > bias)) {
      best = candidate
      distance = d
      bias = b2
    }
  }
  return best
}

const lateralGap = (a: { lateral: number; halfWidth: number }, b: { lateral: number; halfWidth: number }) =>
  Math.abs(a.lateral - b.lateral) - (a.halfWidth + b.halfWidth)

/**
 * 逐帧求解车辆落位：先避开所有横向标线/诱导线，再在纵向找与静态设施、
 * 已占位车辆都不重叠的最近位置；仍无解则隐藏该车并记入 suppressed。
 */
export function resolveVehicleTraffic(
  requests: readonly VehicleRequest[],
  guides: readonly GuideLine[],
  obstacles: readonly StaticObstacle[],
  options: ClearanceOptions = {},
): ClearanceSolution {
  const lateralMargin = Math.max(0, finite(options.lateralMargin, 0.18))
  const longitudinalMargin = Math.max(0, finite(options.longitudinalMargin, 0.7))
  const alongMin = finite(options.alongMin, -260)
  const alongMax = Math.max(alongMin + 1, finite(options.alongMax, 260))
  const lineHalf = Math.max(0.01, finite(options.lineHalfWidth, 0.09))
  const solved = new Map<string, VehiclePlacement>()
  const order = requests
    .map((r, index) => ({ r, index }))
    .sort((a, b) =>
      (finite(b.r.priority, 0) - finite(a.r.priority, 0)) || a.index - b.index,
    )
  let suppressed = 0

  for (const { r } of order) {
    const hw = vehicleHalfWidth(Math.max(0.3, finite(r.width, 1.4)))
    const hl = vehicleHalfLength(Math.max(0.3, finite(r.length, 4.5)))
    const preferredAlong = finite(r.along, 0)
    const preferredLateral = finite(r.lateral, 0)
    const hidden = (adjusted = false): VehiclePlacement => ({
      id: r.id,
      along: preferredAlong,
      lateral: preferredLateral,
      length: Math.max(0.3, finite(r.length, 4.5)),
      width: Math.max(0.3, finite(r.width, 1.4)),
      halfLength: hl,
      halfWidth: hw,
      visible: false,
      adjusted,
    })
    if (r.visible === false) {
      solved.set(r.id, hidden())
      continue
    }
    const lateral = clampLateralForGuides(preferredLateral, hw, guides, options)
    if (lateral === null) {
      solved.set(r.id, hidden(true))
      suppressed++
      continue
    }
    const lateralOverlaps = (other: { lateral: number; halfWidth: number }) =>
      Math.abs(lateral - other.lateral) < hw + other.halfWidth + lateralMargin
    const blocked: [number, number][] = []
    for (const o of obstacles) {
      const zone = {
        lateral: finite(o.lateral, 0),
        halfWidth: Math.max(0.02, finite(o.width, 0.2) / 2),
      }
      if (!lateralOverlaps(zone)) continue
      const reach = hl + Math.max(0.02, finite(o.length, 0.2) / 2) + longitudinalMargin
      const center = finite(o.along, 0)
      blocked.push([center - reach, center + reach])
    }
    for (const other of solved.values()) {
      if (!other.visible || !lateralOverlaps(other)) continue
      const reach = hl + other.halfLength + longitudinalMargin
      blocked.push([other.along - reach, other.along + reach])
    }
    const along = nearestFreeAlong(preferredAlong, hl, blocked, alongMin, alongMax, r.escape ?? -1)
    if (along === null) {
      solved.set(r.id, hidden(true))
      suppressed++
      continue
    }
    const candidate: VehiclePlacement = {
      id: r.id,
      along,
      lateral,
      length: Math.max(0.3, finite(r.length, 4.5)),
      width: Math.max(0.3, finite(r.width, 1.4)),
      halfLength: hl,
      halfWidth: hw,
      visible: true,
      adjusted: Math.abs(along - preferredAlong) > 1e-4 || Math.abs(lateral - preferredLateral) > 1e-4,
    }
    const conflicts = [...obstacles].some((o) => {
      const zone = {
        lateral: finite(o.lateral, 0),
        halfWidth: Math.max(0.02, finite(o.width, 0.2) / 2),
        along: finite(o.along, 0),
        halfLength: Math.max(0.02, finite(o.length, 0.2) / 2),
      }
      return (
        lateralGap(candidate, zone) < lateralMargin &&
        Math.abs(candidate.along - zone.along) < candidate.halfLength + zone.halfLength + longitudinalMargin
      )
    }) || [...solved.values()].some((other) => {
      if (!other.visible) return false
      return (
        lateralGap(candidate, other) < lateralMargin &&
        Math.abs(candidate.along - other.along) < candidate.halfLength + other.halfLength + longitudinalMargin
      )
    })
    if (conflicts) {
      solved.set(r.id, hidden(true))
      suppressed++
    } else solved.set(r.id, candidate)
  }

  const placements = requests.map((r) => solved.get(r.id)!).filter(Boolean)
  const visible = placements.filter((p) => p.visible)
  const violations: string[] = []
  let minVehicleGap = NO_GAP
  let minGuideGap = NO_GAP
  let minObstacleGap = NO_GAP
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i]
    for (const g of guides) {
      const gap = Math.abs(a.lateral - g.lateral) -
        (a.halfWidth + Math.max(0.01, finite(g.halfWidth, lineHalf)) + lateralMargin)
      minGuideGap = Math.min(minGuideGap, gap)
      if (gap < -1e-6) violations.push(`${a.id} 压到 ${g.id}`)
    }
    for (const o of obstacles) {
      const lat = Math.abs(a.lateral - finite(o.lateral, 0)) -
        (a.halfWidth + Math.max(0.02, finite(o.width, 0.2) / 2) + lateralMargin)
      const lon = Math.abs(a.along - finite(o.along, 0)) -
        (a.halfLength + Math.max(0.02, finite(o.length, 0.2) / 2) + longitudinalMargin)
      const gap = Math.max(lat, lon)
      minObstacleGap = Math.min(minObstacleGap, gap)
      if (gap < -1e-6) violations.push(`${a.id} 与 ${o.id} 穿模`)
    }
    for (let j = i + 1; j < visible.length; j++) {
      const b = visible[j]
      const lat = Math.abs(a.lateral - b.lateral) - (a.halfWidth + b.halfWidth + lateralMargin)
      const lon = Math.abs(a.along - b.along) - (a.halfLength + b.halfLength + longitudinalMargin)
      const gap = Math.max(lat, lon)
      minVehicleGap = Math.min(minVehicleGap, gap)
      if (gap < -1e-6) violations.push(`${a.id} 与 ${b.id} 穿模`)
    }
  }
  const ok = violations.length === 0
  return {
    ok,
    vehicles: visible.length,
    guides: guides.length,
    obstacles: obstacles.length,
    suppressed,
    minVehicleGap,
    minGuideGap,
    minObstacleGap,
    violations: [...new Set(violations)],
    placements,
  }
}
