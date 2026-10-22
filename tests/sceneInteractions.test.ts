import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Cartesian3, Cesium3DTileStyle, Color, Matrix4, Plane } from 'cesium'
import { pointFocusRectangle } from '../src/utils/sceneCamera'
import { sectionLocalPlane } from '../src/utils/modelSection'
import { modelColorConditions } from '../src/utils/modelMaterials'
import {
  equipmentPointType,
  hideBimMarkers,
  isPriorityMarker,
  markerSymbolUrl,
  clusterSymbolUrl,
} from '../src/utils/markerSymbols'
import {
  loadModelEquipment,
  parseModelEquipment,
} from '../src/utils/modelEquipment'
import {
  createRoamingEntry,
  advanceRoamingProgress,
} from '../src/utils/roamingPath'
import { defaultPointGroups, mergeScenePoints } from '../src/config/scenePoints'
import { DEMO_ALERTS } from '../src/config/alerts'
import { CCTV_CAMERAS, cameraForPoint } from '../src/config/cctvGallery'
import {
  geoForPointOnRoute,
  type TunnelRouteData,
} from '../src/utils/tunnelRouteLoader'
import {
  sceneFocusRequest,
  requestSceneFocus,
  consumeSceneFocus,
} from '../src/composables/useSceneNavigation'

const readModel = (file: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../public/三维数据/局部隧道竣工模型/${file}`, import.meta.url),
      'utf8',
    ),
  )
const equipment = parseModelEquipment(readModel('scenetree.json'))

function evaluatedColor(
  options: Parameters<typeof modelColorConditions>[0],
  properties: Record<string, unknown>,
) {
  const style = new Cesium3DTileStyle({
    color: { conditions: modelColorConditions(options) },
  })
  return style.color.evaluateColor(
    { getPropertyInherited: (key: string) => properties[key] } as never,
    new Color(),
  )
}
test('二维聚焦窗口以米为单位居中，重复点击与已有缩放无关', () => {
  const rect = pointFocusRectangle(114.36, 30.5, 1.6)
  assert.ok(Math.abs((rect[0] + rect[2]) / 2 - 114.36) < 1e-10)
  assert.ok(Math.abs((rect[1] + rect[3]) / 2 - 30.5) < 1e-10)
  const width = (rect[2] - rect[0]) * 111_320 * Math.cos((30.5 * Math.PI) / 180)
  assert.ok(width > 559 && width < 600)
  for (let i = 0; i < 20; i++)
    assert.deepEqual(pointFocusRectangle(114.36, 30.5, 1.6), rect)
})
test('二维聚焦覆盖窄屏、超宽场景和异常宽高比，不产生无效视锥', () => {
  for (const aspect of [0, 0.3, 1, 4, 20, Infinity, NaN]) {
    const rect = pointFocusRectangle(114.36, 30.5, aspect)
    assert.ok(rect.every(Number.isFinite))
    assert.ok(rect[2] > rect[0] && rect[3] > rect[1])
    assert.ok(rect[2] - rect[0] < 0.05)
  }
})
test('业务点的坐标使用全量目录，图层显隐不改变无桩号设施位置', () => {
  const all = mergeScenePoints([])
  const point = all.find((p) => !/K\d\+\d{3}/.test(p.stake))!
  const route = {
    pointAt: (t: number) => [114.35 + t * 0.02, 30.49 + t * 0.02],
  } as TunnelRouteData
  const location = geoForPointOnRoute(route, point, all)
  for (let i = 0; i < 10; i++)
    assert.deepEqual(geoForPointOnRoute(route, point, all), location)
})
test('六个业务模块严格使用要求的默认分组，开启的图层都有共享点位', () => {
  const expected = {
    traffic: ['structure', 'traffic'],
    maintenance: ['structure', 'monitor'],
    monitoring: ['structure', 'env', 'monitor'],
    emergency: ['structure', 'env', 'mep'],
    service: ['structure'],
    asset: ['structure', 'env', 'traffic', 'monitor', 'mep'],
  }
  const points = mergeScenePoints([])
  for (const [module, groups] of Object.entries(expected)) {
    assert.deepEqual(defaultPointGroups(`/${module}`), groups)
    for (const group of groups)
      assert.ok(
        points.some((p) => p.group === group),
        `${module}/${group} 不能是空图层`,
      )
  }
})
test('页面业务点覆盖共享同 ID/类型桩号，同时保留独立告警和摄像机锚点', () => {
  const base = mergeScenePoints([]).find((p) => p.group === 'monitor')!
  const override = { ...base, name: '页面专用监测点' }
  const points = mergeScenePoints([override])
  assert.equal(points.filter((p) => p.id === base.id).length, 1)
  assert.equal(points.find((p) => p.id === base.id)?.name, '页面专用监测点')
  assert.equal(new Set(points.map((p) => p.id)).size, points.length)
})
test('每条告警精确链接独立模拟点、桩号和类型，全部使用动态优先标注', () => {
  const points = mergeScenePoints([])
  for (const alert of DEMO_ALERTS) {
    const point = points.find((p) => p.id === alert.pointId)!
    assert.ok(point, alert.id)
    assert.equal(point.stake, alert.stake)
    assert.equal(point.group, alert.group)
    assert.equal(point.kind, alert.kind)
    assert.equal(point.simulated, true)
    assert.equal(point.alertId, alert.id)
    assert.match(point.alarm!, /模拟/)
    assert.ok(isPriorityMarker(point.status, point.alarm))
  }
  assert.ok(isPriorityMarker('offline', '离线告警'))
  assert.ok(isPriorityMarker('ok', undefined, true))
  assert.equal(isPriorityMarker('ok'), false)
})
test('重点监控的 ID、桩号和地图锚点一一匹配；示例画面不冒充实时流', () => {
  const points = mergeScenePoints([])
  for (const camera of CCTV_CAMERAS) {
    const point = points.find((p) => p.id === camera.pointId)!
    assert.equal(point.stake, camera.stake)
    assert.equal(point.videoId, camera.id)
    assert.equal(cameraForPoint(point), camera)
    assert.equal(camera.streamUrl, undefined)
  }
  const custom = { id: 'bim:真实设备-23', name: 'BIM 摄像机', stake: '构件 23' }
  assert.deepEqual(cameraForPoint(custom), cameraForPoint(custom))
  assert.equal(cameraForPoint(custom).pointId, custom.id)
})
test('导航是单次命令，重复定位有新序号，旧请求不能消费新请求', () => {
  requestSceneFocus('a')
  const old = sceneFocusRequest.value!.sequence
  requestSceneFocus('a')
  const current = sceneFocusRequest.value!.sequence
  assert.ok(current > old)
  consumeSceneFocus(old)
  assert.equal(sceneFocusRequest.value?.sequence, current)
  consumeSceneFocus(current)
  assert.equal(sceneFocusRequest.value, null)
})
test('默认入场是当前路线终点，面向内部，首个播放步进离开终点而非停止', () => {
  const entry = createRoamingEntry()
  assert.deepEqual(entry, { progress: 1, direction: -1 })
  assert.ok(
    advanceRoamingProgress(entry.progress, 0.1, 2, 440, entry.direction) < 1,
  )
  assert.deepEqual(createRoamingEntry(), entry)
})
test('路面默认保留原材质与不透明度，结构透视/施工透明不会误改道路', () => {
  for (const name of ['malu', 'ROAD_01', '混凝土路面', '道路', '行车道']) {
    const color = evaluatedColor(
      { alpha: 0.38, dimStructure: true },
      { name, id: 'road' },
    )
    assert.deepEqual(color, Color.WHITE)
  }
  assert.equal(
    evaluatedColor({ dimStructure: true }, { name: '结构', id: 'shell' }).alpha,
    0.025,
  )
  assert.equal(
    evaluatedColor({ alpha: 0.38 }, { name: '结构', id: 'shell' }).alpha,
    0.38,
  )
  assert.deepEqual(evaluatedColor({}, { name: '风机', id: 'e' }), Color.WHITE)
})
test('只有显式路面透视使道路透明，选择构件为暖色高亮，其他设备保留原色', () => {
  assert.equal(
    evaluatedColor({ roadXray: true }, { name: 'malu', id: 'road' }).alpha,
    0.16,
  )
  const options = {
    selectedEquipmentId: 'e1',
    equipmentIds: ['e1', 'e2'],
    dimStructure: true,
  }
  assert.deepEqual(
    evaluatedColor(options, { name: '摄像机', id: 'e1' }),
    Color.fromCssColorString('#ffdfa3'),
  )
  assert.deepEqual(
    evaluatedColor(options, { name: '风机', id: 'e2' }),
    Color.WHITE,
  )
  assert.deepEqual(
    evaluatedColor(options, { name: 'malu', id: 'road' }),
    Color.WHITE,
  )
  assert.ok(Number.isFinite(evaluatedColor({}, { id: 'no-name' }).alpha))
})
test('构件名称/ID 有特殊字符时，样式表达式仍正确匹配', () => {
  const id = '构件"A\\B'
  const color = evaluatedColor(
    { selectedEquipmentId: id },
    { id, name: '摄像机' },
  )
  assert.deepEqual(color, Color.fromCssColorString('#ffdfa3'))
})
test('138 个真实构件均映射到独立类别/分组，不把合并的灯带/道路伪装为独立设备', () => {
  assert.equal(equipment.length, 138)
  for (const item of equipment) {
    const { group, kind } = equipmentPointType(item)
    assert.ok(['structure', 'env', 'traffic', 'monitor', 'mep'].includes(group))
    assert.ok(kind)
    if (item.category === '视频监控')
      assert.deepEqual({ group, kind }, { group: 'traffic', kind: 'camera' })
    if (item.category === '消防泵组') assert.equal(kind, 'firePump')
  }
  assert.notEqual(markerSymbolUrl('camera'), markerSymbolUrl('fan'))
  assert.notEqual(clusterSymbolUrl(3), clusterSymbolUrl(138))
})
test('BIM 图标远显近隐带 45/65m 滞回，选中和告警独立于普通聚合', () => {
  assert.equal(hideBimMarkers(100, false), false)
  assert.equal(hideBimMarkers(44, false), true)
  assert.equal(hideBimMarkers(55, true), true)
  assert.equal(hideBimMarkers(66, true), false)
  assert.equal(hideBimMarkers(Infinity, true), false)
})
test('剖切首末位置精确覆盖真实 OBB 三轴范围，反向保持同一物理平面', () => {
  const box = readModel('tileset.json').root.boundingVolume.box
  for (const axis of ['x', 'y', 'z'] as const) {
    const index = { x: 0, y: 1, z: 2 }[axis]
    const start = sectionLocalPlane(box, axis, 0, false)
    const end = sectionLocalPlane(box, axis, 1, false)
    assert.ok(Math.abs(start.coordinate - (box[index] - start.extent)) < 1e-8)
    assert.ok(Math.abs(end.coordinate - (box[index] + end.extent)) < 1e-8)
    const forward = sectionLocalPlane(box, axis, 0.7, false)
    const reverse = sectionLocalPlane(box, axis, 0.7, true)
    assert.equal(forward.distance, -reverse.distance)
    assert.equal(forward.coordinate, reverse.coordinate)
  }
})
test('单一剖切平面跨不同模型根坐标系转换后仍落在相同世界位置', () => {
  const manifest = readModel('tileset.json')
  const transformA = Matrix4.fromArray(manifest.root.transform)
  const transformB = Matrix4.multiplyByTranslation(
    transformA,
    new Cartesian3(60, -80, 20),
    new Matrix4(),
  )
  const local = sectionLocalPlane(
    manifest.root.boundingVolume.box,
    'z',
    0.63,
    false,
  )
  const world = Plane.transform(
    new Plane(new Cartesian3(...local.normal), local.distance),
    transformA,
  )
  const inB = Plane.transform(world, Matrix4.inverse(transformB, new Matrix4()))
  const localPoint = new Cartesian3(0, 0, local.coordinate)
  const worldPoint = Matrix4.multiplyByPoint(
    transformA,
    localPoint,
    new Cartesian3(),
  )
  const pointB = Matrix4.multiplyByPoint(
    Matrix4.inverse(transformB, new Matrix4()),
    worldPoint,
    new Cartesian3(),
  )
  assert.ok(Math.abs(Plane.getPointDistance(world, worldPoint)) < 1e-6)
  assert.ok(Math.abs(Plane.getPointDistance(inB, pointB)) < 1e-6)
})
test('剖切兼容旋转 OBB 投影、越界进度和无效数据', () => {
  const box = [0, 0, 0, 3, 4, 0, -4, 3, 0, 0, 0, 8]
  assert.equal(sectionLocalPlane(box, 'x', 1, false).extent, 7)
  assert.equal(sectionLocalPlane(box, 'x', 2, false).coordinate, 7)
  assert.equal(sectionLocalPlane(box, 'z', NaN, false).coordinate, 0)
  assert.throws(() => sectionLocalPlane([NaN], 'z', 0.5, false))
})
test('设备目录共享并发加载，单个调用退出不取消其他场景；失败后可重试', async () => {
  const original = globalThis.fetch
  let calls = 0
  const raw = {
    scenes: [{ id: '1', name: '摄像机 [1]', sphere: [1, 2, 3, 1] }],
  }
  try {
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify(raw), { status: 200 })
    }) as typeof fetch
    const abort = new AbortController()
    const abandoned = loadModelEquipment(
      'http://test.invalid/shared-catalog.json',
      abort.signal,
    )
    const active = loadModelEquipment('http://test.invalid/shared-catalog.json')
    abort.abort()
    await assert.rejects(abandoned, { name: 'AbortError' })
    assert.equal((await active).length, 1)
    assert.equal(calls, 1)
    let failures = 0
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(raw), {
        status: ++failures === 1 ? 503 : 200,
      })) as typeof fetch
    await assert.rejects(
      loadModelEquipment('http://test.invalid/retry-catalog.json'),
    )
    assert.equal(
      (await loadModelEquipment('http://test.invalid/retry-catalog.json'))
        .length,
      1,
    )
    assert.equal(failures, 2)
  } finally {
    globalThis.fetch = original
  }
})
