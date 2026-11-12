import assert from 'node:assert/strict'
import test from 'node:test'
import { PARTIAL_AIR_VENTS, PARTIAL_FAN_RIGS } from '../src/config/partialFanRig'
import {
  buildFanFragmentShader,
  buildFanVertexShader,
  fanUniformRef,
  fanUniformSlots,
  glslFloat,
} from '../src/utils/fanRigShader'
import {
  fireVentilationPlan,
  piecewise,
  TWIN_DATA_NOTE,
  TWIN_SCENARIO_LIST,
  TWIN_SCENARIOS,
} from '../src/config/twinScenarios'
import {
  scenarioDuration,
  solveFloodExtent,
  walkAlongAtStep,
} from '../src/utils/simulationPhysics'
import { BASE_SCENE_POINTS } from '../src/config/scenePoints'

test('风机几何来自竣工模型：16 台叶轮独立 feature，轴向单位化，双层分布', () => {
  assert.equal(PARTIAL_FAN_RIGS.length, 16)
  assert.equal(new Set(PARTIAL_FAN_RIGS.map((r) => r.featureId)).size, 16)
  for (const rig of PARTIAL_FAN_RIGS) {
    assert.ok(Math.abs(Math.hypot(...rig.axis) - 1) < 1e-3, rig.name)
    assert.ok(rig.length > 3 && rig.length < 5)
    assert.ok(rig.radius > 0.3 && rig.radius < 0.8)
  }
  const lower = PARTIAL_FAN_RIGS.filter((r) => r.deck === 'lower')
  const upper = PARTIAL_FAN_RIGS.filter((r) => r.deck === 'upper')
  assert.ok(lower.length > 0 && upper.length > 0)
  assert.ok(PARTIAL_AIR_VENTS.length >= 1)
})

test('叶轮旋转 GLSL 覆盖每台风机且 uniform 槽位一致', () => {
  const vs = buildFanVertexShader(PARTIAL_FAN_RIGS)
  for (const rig of PARTIAL_FAN_RIGS) assert.ok(vs.includes(`fid == ${rig.featureId})`), rig.name)
  assert.equal(fanUniformSlots(16), 4)
  assert.equal(fanUniformSlots(17), 5)
  assert.equal(fanUniformSlots(0), 1)
  assert.equal(fanUniformRef('u_fanAngle', 5), 'u_fanAngle1.y')
  assert.ok(vs.includes('u_fanAngle3.w'))
  assert.ok(!vs.includes('u_fanAngle4'))
  assert.ok(vs.includes('vsOutput.positionMC ='))
  // 空列表也要能编译通过（不出现悬空 else）
  assert.ok(buildFanVertexShader([]).includes('if (false) {}'))
})

test('GLSL 浮点字面量始终带小数点，非有限值安全', () => {
  assert.equal(glslFloat(2), '2.00000')
  assert.equal(glslFloat(-0.5, 2), '-0.50')
  assert.equal(glslFloat(Number.NaN), '0.0')
  assert.equal(glslFloat(Number.POSITIVE_INFINITY), '0.0')
})

test('片元阶段旋转法线；选中态拼接 Fresnel 片段', () => {
  const plain = buildFanFragmentShader()
  assert.ok(plain.includes('material.normalEC = normalize(nf)'))
  const selected = buildFanFragmentShader('  material.alpha = 0.5;')
  assert.ok(selected.includes('material.alpha = 0.5;'))
})

test('四类仿真脚本：步骤完整、热点为原始方案点位、遥测随步骤演化且有界', () => {
  assert.equal(TWIN_SCENARIO_LIST.length, 4)
  const ids = new Set(BASE_SCENE_POINTS.map((p) => p.id))
  for (const s of TWIN_SCENARIO_LIST) {
    assert.equal(s.steps.length, 4, s.id)
    assert.ok(['fire1', 'fan1', 'w2', 'm1'].includes(s.hotspot) || ids.has(s.hotspot))
    for (let step = 0; step < s.steps.length; step++)
      for (const k of [0, 0.5, 1]) {
        const tel = s.telemetry(step, k)
        assert.ok(tel.length >= 3)
        for (const t of tel) {
          assert.ok(t.ratio >= 0 && t.ratio <= 1, `${s.id}/${t.key}`)
          assert.ok(['ok', 'warn', 'alarm'].includes(t.level))
          assert.ok(!t.value.includes('NaN'))
        }
        assert.ok(s.devices(step, k).length >= 3)
      }
  }
})

test('积水液位与原始告警一致：第一步末达到 26.8cm 红色预警，最终回落到安全线', () => {
  const flood = TWIN_SCENARIOS.flood
  const end0 = flood.telemetry(0, 1).find((t) => t.key === 'level')!
  assert.equal(end0.value, '26.8cm')
  assert.equal(end0.level, 'alarm')
  const final = flood.telemetry(3, 1).find((t) => t.key === 'level')!
  assert.equal(final.level, 'ok')
})

test('分段曲线按步内进度插值并钳制越界', () => {
  const seg = [[0, 10], [10, 4]] as const
  assert.equal(piecewise(seg, 0, 0.5), 5)
  assert.equal(piecewise(seg, 1, 1), 4)
  assert.equal(piecewise(seg, 9, 0), 10)
  assert.equal(piecewise(seg, -1, 2), 10)
})

test('火灾排烟状态机与设备表、烟气方向一致：复盘阶段才回落常规通风', () => {
  const normal = fireVentilationPlan(0, 0)
  assert.equal(normal.mode, 'normal')
  assert.equal(normal.lower, 0.72)
  assert.equal(normal.upper, 0.72)
  assert.equal(normal.vent, false)
  const exhaust = fireVentilationPlan(1, 0.5)
  assert.equal(exhaust.mode, 'exhaust')
  assert.equal(exhaust.lower, 1)
  assert.equal(exhaust.upper, 0.72)
  assert.equal(exhaust.vent, true)
  assert.equal(fireVentilationPlan(3, 0.54).mode, 'exhaust')
  const recovered = fireVentilationPlan(3, 0.55)
  assert.equal(recovered.mode, 'normal')
  assert.equal(recovered.lower, 0.72)
  assert.equal(recovered.vent, false)
  assert.match(TWIN_SCENARIOS.fire.devices(3, 0)[0].value, /排烟/)
  assert.match(TWIN_SCENARIOS.fire.devices(3, 0.8)[0].value, /常规/)
  assert.match(TWIN_DATA_NOTE, /非实时测点/)
})

test('联动设备读数按步内进度演化，水位回落阶段仍保持抽排', () => {
  assert.match(TWIN_SCENARIOS.flood.devices(1, 0.05)[1].value, /启动建压/)
  assert.match(TWIN_SCENARIOS.flood.devices(1, 0.8)[1].value, /运行/)
  assert.match(TWIN_SCENARIOS.flood.devices(3, 0.9)[1].value, /运行 \d+m³\/h/)
  assert.match(TWIN_SCENARIOS.flood.devices(3, 1)[1].value, /运行 210m³\/h/)
  assert.match(TWIN_SCENARIOS.accident.devices(2, 0.8)[0].value, /逐步放行/)
  assert.match(TWIN_SCENARIOS.accident.devices(3, 0.8)[0].value, /恢复通行/)
  assert.match(TWIN_SCENARIOS.patrol.devices(3, 0)[0].value, /推演/)
})

test('水平水面按真实纵坡求交：水位越高淹没越长，水面高程恒定', () => {
  const grade = 0.047
  const sample = (m: number) => [m, 0, grade * m] as const
  const shallow = solveFloodExtent(sample, 200, 18, 0.08, {
    startMargin: 9,
    maxLookahead: 70,
    direction: 1,
  })
  const deep = solveFloodExtent(sample, 200, 18, 0.268, {
    startMargin: 9,
    maxLookahead: 70,
    direction: 1,
  })
  assert.ok(deep.endMeters > shallow.endMeters)
  assert.ok(deep.horizontalLength > shallow.horizontalLength + 3)
  assert.ok(Math.abs(deep.surfaceZ - (grade * 18 + 0.268)) < 1e-9)
  assert.ok(deep.startMeters >= 1 && deep.endMeters < 200)
  assert.ok(deep.centerMeters > deep.startMeters && deep.centerMeters < deep.endMeters)
  assert.ok(Math.abs(sample(deep.endMeters)[2] - (deep.surfaceZ - 0.004)) < 0.004)
})

test('反向纵坡也能求出水平水面范围，起止点方向不写死', () => {
  const grade = 0.047
  const sample = (m: number) => [m, 0, grade * (200 - m)] as const
  const extent = solveFloodExtent(sample, 200, 18, 0.268, {
    startMargin: 9,
    maxLookahead: 70,
    direction: -1,
  })
  assert.ok(extent.endMeters < extent.startMeters)
  assert.ok(extent.horizontalLength > 8)
  assert.ok(Math.abs(sample(extent.endMeters)[2] - (extent.surfaceZ - 0.004)) < 0.004)
})

test('推演时长与第一人称起点按步骤进度换算，不随帧率或视角切换跳回入口', () => {
  assert.equal(scenarioDuration([14, 16, 0, 10]), 40)
  assert.equal(walkAlongAtStep(100, 20, 0, 0, 4), 100)
  assert.equal(walkAlongAtStep(100, 20, 1, 0.5, 4), 70)
  assert.equal(walkAlongAtStep(100, 20, 9, 1, 4), 20)
})
