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
  piecewise,
  TWIN_SCENARIO_LIST,
  TWIN_SCENARIOS,
} from '../src/config/twinScenarios'
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
