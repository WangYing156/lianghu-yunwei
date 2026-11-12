import assert from 'node:assert/strict'
import test from 'node:test'
import { TWIN_SCENARIOS } from '../src/config/twinScenarios'
import {
  clampLateralForGuides,
  resolveVehicleTraffic,
  TUNNEL_LANE_GUIDES,
  TUNNEL_MARKING_LATERALS,
  TUNNEL_ROAD_HALF_WIDTH,
  TWIN_SAFE_LANES,
  vehicleHalfWidth,
  type GuideLine,
  type StaticObstacle,
  type VehicleRequest,
} from '../src/utils/simulationClearance'

const laneGuides = (...extras: GuideLine[]) => [...TUNNEL_LANE_GUIDES, ...extras]
const car: Omit<VehicleRequest, 'id' | 'along' | 'lateral'> = { length: 4.5, width: 1.45 }
const truck: Omit<VehicleRequest, 'id' | 'along' | 'lateral'> = { length: 7.2, width: 1.65 }

test('安全车道来自竣工标线：三条走廊均不压 ±1.8 / ±4.5 标线', () => {
  assert.deepEqual([...TUNNEL_MARKING_LATERALS], [-4.5, -1.8, 1.8, 4.5])
  for (const lateral of [TWIN_SAFE_LANES.left, TWIN_SAFE_LANES.center, TWIN_SAFE_LANES.right]) {
    for (const dimensions of [car, truck]) {
      const hw = vehicleHalfWidth(dimensions.width)
      const safe = clampLateralForGuides(lateral, hw, TUNNEL_LANE_GUIDES, {
        roadHalfWidth: TUNNEL_ROAD_HALF_WIDTH,
      })
      assert.equal(safe, lateral, `lateral=${lateral}, width=${dimensions.width}`)
      for (const line of TUNNEL_MARKING_LATERALS) {
        const gap = Math.abs(lateral - line) - (hw + 0.09 + 0.18)
        assert.ok(gap >= -1e-9, `lateral=${lateral} line=${line} gap=${gap}`)
      }
    }
  }
})

test('诱导线会钳制车辆横向位置，绝不落在黄色/绿色线或锥桶线上', () => {
  const floodGuide: GuideLine = { id: 'flood-yellow-guide', lateral: -0.95, halfWidth: 0.09 }
  const coneGuide: GuideLine = { id: 'accident-cone-taper', lateral: -1.8, halfWidth: 0.2 }
  const hw = vehicleHalfWidth(car.width)
  const shifted = clampLateralForGuides(-0.95, hw, laneGuides(floodGuide))
  assert.notEqual(shifted, -0.95)
  assert.ok(shifted !== null)
  const gap = Math.abs(shifted - floodGuide.lateral) - (hw + 0.09 + 0.18)
  assert.ok(gap >= -1e-6)
  assert.equal(clampLateralForGuides(TWIN_SAFE_LANES.center, vehicleHalfWidth(truck.width), laneGuides(coneGuide)), 0)
})

test('同车道纵向冲突会自动拉开车距，不产生车辆穿模', () => {
  const solution = resolveVehicleTraffic(
    [
      { ...car, id: 'lead', along: 0, lateral: TWIN_SAFE_LANES.right, priority: 100, escape: -1 },
      { ...car, id: 'following', along: 2, lateral: TWIN_SAFE_LANES.right, priority: 20, escape: -1 },
    ],
    TUNNEL_LANE_GUIDES,
    [],
    { alongMin: -80, alongMax: 80 },
  )
  assert.equal(solution.ok, true)
  assert.deepEqual(solution.violations, [])
  assert.equal(solution.vehicles, 2)
  assert.ok(solution.minVehicleGap >= -1e-6)
  const lead = solution.placements.find((p) => p.id === 'lead')!
  const following = solution.placements.find((p) => p.id === 'following')!
  assert.ok(Math.abs(following.along - lead.along) > car.length + 0.7)
})

test('积水/泵站静态设施参与净距求解，车辆不会进入水面或泵体', () => {
  const obstacles: StaticObstacle[] = [
    { id: 'flood-water', along: 0, lateral: -2.65, length: 30, width: 3 },
    { id: 'flood-pump', along: 8, lateral: -3.55, length: 2.2, width: 1.4 },
  ]
  const solution = resolveVehicleTraffic(
    [
      { ...car, id: 'dry-lane', along: 0, lateral: TWIN_SAFE_LANES.right, priority: 30, escape: -1 },
      { ...car, id: 'would-enter-water', along: 0, lateral: -2.65, priority: 20, escape: -1 },
    ],
    laneGuides({ id: 'flood-yellow-guide', lateral: -0.95, halfWidth: 0.09 }),
    obstacles,
    { alongMin: -80, alongMax: 80 },
  )
  assert.equal(solution.ok, true)
  assert.deepEqual(solution.violations, [])
  assert.ok(solution.minObstacleGap >= -1e-6)
  assert.ok(solution.placements.find((p) => p.id === 'dry-lane')?.visible)
  const wet = solution.placements.find((p) => p.id === 'would-enter-water')!
  if (wet.visible) {
    const water = obstacles[0]
    const lateralGap = Math.abs(wet.lateral - water.lateral) - (wet.halfWidth + water.width / 2 + 0.18)
    const alongGap = Math.abs(wet.along - water.along) - (wet.halfLength + water.length / 2 + 0.7)
    assert.ok(Math.max(lateralGap, alongGap) >= -1e-6)
  }
})

test('事故三车道：事故车/清障/救援/过车与锥桶、碎片同时落位无穿模', () => {
  const coneSpots = [-40, -34, -28, -22, -16.5, -15.2, -13.8, -12.6].map((along, i) => ({
    id: `cone-${i}`,
    along,
    lateral: i < 4 ? -1.9 : -1.85 + (i - 4) * 0.1,
    length: 0.34,
    width: 0.34,
  }))
  const debris = Array.from({ length: 5 }, (_, i) => ({
    id: `debris-${i}`,
    along: -3.6 - i * 0.55,
    lateral: TWIN_SAFE_LANES.left + (i % 2 ? 0.35 : -0.35),
    length: 0.55,
    width: 0.16,
  }))
  const solution = resolveVehicleTraffic(
    [
      { ...car, id: 'hit-a', along: 0, lateral: TWIN_SAFE_LANES.left, priority: 100, escape: 1 },
      { ...truck, id: 'tow', along: 14, lateral: TWIN_SAFE_LANES.left, priority: 95, escape: 1 },
      { ...truck, id: 'rescue', along: -18, lateral: TWIN_SAFE_LANES.center, priority: 90, escape: 1 },
      { ...car, id: 'queue', along: -22, lateral: TWIN_SAFE_LANES.left, priority: 60, escape: 1 },
      { ...car, id: 'passing', along: 10, lateral: TWIN_SAFE_LANES.right, priority: 30, escape: 1 },
    ],
    laneGuides({ id: 'accident-cone-taper', lateral: -1.8, halfWidth: 0.2 }),
    [...coneSpots, ...debris],
    { alongMin: -120, alongMax: 120 },
  )
  assert.equal(solution.ok, true, JSON.stringify(solution.violations))
  assert.equal(solution.vehicles, 5)
  assert.ok(solution.minVehicleGap >= -1e-6)
  assert.ok(solution.minGuideGap >= -1e-6)
  assert.ok(solution.minObstacleGap >= -1e-6)
})

test('工况脚本与设备表覆盖消防车、泵站叶轮、清障车和分道过车', () => {
  assert.match(TWIN_SCENARIOS.fire.desc, /消防车.*分道撤离/)
  assert.match(TWIN_SCENARIOS.fire.steps[2].detail, /分道撤离/)
  assert.match(TWIN_SCENARIOS.fire.devices(1, 0.5).slice(-1)[0].value, /消防车进场/)
  assert.match(TWIN_SCENARIOS.flood.desc, /泵站叶轮.*绕行/)
  assert.match(TWIN_SCENARIOS.flood.steps[2].detail, /不压线、不涉水/)
  assert.match(TWIN_SCENARIOS.flood.devices(2, 0.5).slice(-1)[0].value, /叶轮 \d+m³\/h/)
  assert.match(TWIN_SCENARIOS.accident.desc, /清障车.*管制解除/)
  assert.match(TWIN_SCENARIOS.accident.steps[2].detail, /清障车沿事故道拖离/)
  assert.match(TWIN_SCENARIOS.accident.devices(3, 0.8).slice(-1)[0].value, /恢复通行|依次放行/)
})
