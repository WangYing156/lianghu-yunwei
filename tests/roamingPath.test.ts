import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  advanceRoamingProgress,
  createRoamingPath,
  nearestRoamingProgress,
  sampleRoamingPath,
} from '../src/utils/roamingPath'
import { PARTIAL_ROAMING_ROUTES } from '../src/config/partialRoamingRoutes'
import { parseModelEquipment } from '../src/utils/modelEquipment'

const line = createRoamingPath([
  [0, 0, 0],
  [10, 0, 0],
  [10, 20, 0],
])
test('路线按真实弧长插值，首末点正确', () => {
  assert.equal(line.length, 30)
  assert.deepEqual(sampleRoamingPath(line, 0).point, [0, 0, 0])
  assert.deepEqual(sampleRoamingPath(line, 0.5).point, [10, 5, 0])
  assert.deepEqual(sampleRoamingPath(line, 1).point, [10, 20, 0])
  assert.deepEqual(sampleRoamingPath(line, -1).point, [0, 0, 0])
  assert.deepEqual(sampleRoamingPath(line, 2).point, [10, 20, 0])
})
test('无效坐标被过滤，重合点不导致除零', () => {
  assert.throws(() =>
    createRoamingPath([
      [1, 1, 1],
      [1, 1, 1],
    ]),
  )
  const p = createRoamingPath([
    [NaN, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [10, 0, 0],
  ])
  assert.equal(p.length, 10)
  assert.ok(sampleRoamingPath(p, 0.5).tangent.every(Number.isFinite))
})
test('设备投影到路径线段，而不是最近顶点', () => {
  const result = nearestRoamingProgress(line, [10, 8, 3])
  assert.ok(Math.abs(result.progress - 18 / 30) < 1e-8)
  assert.equal(result.distance, 3)
})
test('米/秒播放速度在 30 / 60 / 120 fps 下一致', () => {
  for (const fps of [30, 60, 120]) {
    let progress = 0
    for (let i = 0; i < fps * 10; i++)
      progress = advanceRoamingProgress(progress, 1 / fps, 2, 100, 1)
    assert.ok(Math.abs(progress - 0.2) < 1e-8)
  }
})
test('反向、端点、后台恢复与非法输入安全', () => {
  assert.equal(advanceRoamingProgress(0.001, 0.1, 2, 10, -1), 0)
  assert.equal(advanceRoamingProgress(0.999, 0.1, 2, 10, 1), 1)
  assert.equal(advanceRoamingProgress(0, 100, 2, 100, 1), 0.002)
  assert.equal(advanceRoamingProgress(0.3, 1, 2, 0, 1), 0.3)
  assert.equal(advanceRoamingProgress(0.3, -1, 2, 100, 1), 0.3)
})
test('双层巡游路线位于实际竣工模型包围盒内，且上下层分离', () => {
  const tileset = JSON.parse(
    readFileSync(
      new URL('../public/三维数据/局部隧道竣工模型/tileset.json', import.meta.url),
      'utf8',
    ),
  )
  const box = tileset.root.boundingVolume.box
  const [lower, upper] = PARTIAL_ROAMING_ROUTES
  assert.equal(lower.points.length, upper.points.length)
  for (const route of PARTIAL_ROAMING_ROUTES) {
    const path = createRoamingPath(route.points)
    assert.ok(path.length > 400 && path.length < 500)
    for (const point of route.points)
      for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(point[axis] - box[axis]) <= box[3 + axis * 4])
  }
  lower.points.forEach((point, i) => assert.ok(upper.points[i][2] - point[2] > 5))
})
test('真实模型设备目录包含风机、摄像头和消防泵，过滤整段合并构件', () => {
  const tree = JSON.parse(
    readFileSync(
      new URL('../public/三维数据/局部隧道竣工模型/scenetree.json', import.meta.url),
      'utf8',
    ),
  )
  const equipment = parseModelEquipment(tree)
  assert.equal(equipment.filter((e) => e.category === '视频监控').length, 34)
  assert.equal(
    equipment.filter((e) => e.category === '通风设备' && e.name.includes('风机')).length,
    18,
  )
  assert.equal(equipment.filter((e) => e.category === '消防泵组').length, 5)
  assert.ok(equipment.every((e) => e.radius < 30 && e.center.every(Number.isFinite)))
  assert.equal(new Set(equipment.map((e) => e.id)).size, equipment.length)
  assert.equal(
    equipment.some((e) => e.name === 'malu' || e.name.includes('吊灯')),
    false,
  )
})
test('设备解析容忍无效节点与重复 ID', () => {
  const source = {
    scenes: [
      {
        children: [
          { id: 'a', name: '摄像头 [123]', sphere: [1, 2, 3, 1] },
          { id: 'a', name: '摄像头 [123]', sphere: [1, 2, 3, 1] },
          { id: 'b', name: '风机', sphere: [NaN, 2, 3, 1] },
          { id: 'c', name: '风机', sphere: [1, 2, 3, 100] },
        ],
      },
    ],
  }
  assert.equal(parseModelEquipment(source).length, 1)
  assert.equal(parseModelEquipment({}).length, 0)
})
