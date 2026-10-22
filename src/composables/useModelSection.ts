import { reactive } from 'vue'
import * as Cesium from 'cesium'
import { sectionLocalPlane, type SectionState } from '../utils/modelSection'

type Entry = {
  tileset: Cesium.Cesium3DTileset
  role: 'bim' | 'partial'
  box: number[]
  collection?: Cesium.ClippingPlaneCollection
}
/** 单一世界平面转换到每个 Tileset 的根局部系，施工/竣工不会因原点不同发生错切。 */
export function useModelSection(
  requestRender: () => void,
  getViewer?: () => Cesium.Viewer | null | undefined,
) {
  const state = reactive<SectionState>({
    enabled: false,
    axis: 'z',
    position: 0.55,
    reverse: false,
    target: 'all',
    ready: false,
    error: '',
  })
  const entries = new Map<Cesium.Cesium3DTileset, Entry>()
  let presentationActive = true
  let generation = 0
  let animToken = 0
  let displayPosition = state.position
  let capEntity: Cesium.Entity | null = null

  function reference() {
    const candidates = [...entries.values()].filter(
      (e) =>
        !e.tileset.isDestroyed() &&
        (state.target === 'all' || e.role === state.target),
    )
    return candidates.find((e) => e.role === 'partial') ?? candidates[0]
  }

  function applyPlanes(position: number) {
    const origin = reference()
    state.ready = !!origin
    const local = origin
      ? sectionLocalPlane(origin.box, state.axis, position, state.reverse)
      : null
    const worldPlane =
      local && origin
        ? Cesium.Plane.transform(
            new Cesium.Plane(
              new Cesium.Cartesian3(...local.normal),
              local.distance,
            ),
            origin.tileset.root.computedTransform,
          )
        : null
    entries.forEach((entry) => {
      const { tileset } = entry
      if (tileset.isDestroyed()) return
      const wanted =
        state.enabled &&
        presentationActive &&
        tileset.show &&
        !!worldPlane &&
        (state.target === 'all' || state.target === entry.role)
      if (!wanted) {
        if (entry.collection) entry.collection.enabled = false
        return
      }
      // 当前数据具有非单位根变换，剖切原点即公开 root.computedTransform，无需读 Cesium 私有字段。
      const plane = Cesium.Plane.transform(
        worldPlane!,
        Cesium.Matrix4.inverse(
          tileset.root.computedTransform,
          new Cesium.Matrix4(),
        ),
      )
      if (!entry.collection) {
        entry.collection = new Cesium.ClippingPlaneCollection({
          planes: [new Cesium.ClippingPlane(plane.normal, plane.distance)],
          edgeColor: Cesium.Color.fromCssColorString('#7EE8FF'),
          edgeWidth: 2.4,
        })
        tileset.clippingPlanes = entry.collection
      } else {
        const current = entry.collection.get(0)
        current.normal = plane.normal
        current.distance = plane.distance
      }
      entry.collection.enabled = true
    })
    syncCutFace(worldPlane, origin)
    requestRender()
  }

  function hideCutFace() {
    if (capEntity) capEntity.show = false
  }

  /** 在剖切平面上铺一层半透明网格，形成可见切割面。 */
  function syncCutFace(
    worldPlane: Cesium.Plane | null,
    origin: Entry | undefined,
  ) {
    const viewer = getViewer?.()
    if (!viewer || viewer.isDestroyed()) return
    const show =
      state.enabled && presentationActive && !!worldPlane && !!origin
    if (!show || !worldPlane || !origin) {
      hideCutFace()
      return
    }
    const sphere = origin.tileset.boundingSphere
    const normal = Cesium.Cartesian3.normalize(
      worldPlane.normal,
      new Cesium.Cartesian3(),
    )
    const signed = Cesium.Plane.getPointDistance(worldPlane, sphere.center)
    const center = Cesium.Cartesian3.subtract(
      sphere.center,
      Cesium.Cartesian3.multiplyByScalar(normal, signed, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    let axisX = Cesium.Cartesian3.cross(
      Cesium.Cartesian3.UNIT_Z,
      normal,
      new Cesium.Cartesian3(),
    )
    if (Cesium.Cartesian3.magnitudeSquared(axisX) < 1e-8)
      axisX = Cesium.Cartesian3.cross(
        Cesium.Cartesian3.UNIT_X,
        normal,
        axisX,
      )
    Cesium.Cartesian3.normalize(axisX, axisX)
    const axisY = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(normal, axisX, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    const rotation = new Cesium.Matrix3()
    Cesium.Matrix3.setColumn(rotation, 0, axisX, rotation)
    Cesium.Matrix3.setColumn(rotation, 1, axisY, rotation)
    Cesium.Matrix3.setColumn(rotation, 2, normal, rotation)
    const span = Math.max(18, Math.min(sphere.radius * 2.1, 420))
    if (!capEntity) {
      capEntity = viewer.entities.add({
        name: '剖切切割面',
        plane: {
          plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0),
          dimensions: new Cesium.Cartesian2(span, span),
          material: new Cesium.GridMaterialProperty({
            color: Cesium.Color.fromCssColorString('#7EE8FF').withAlpha(0.55),
            cellAlpha: 0.16,
            lineCount: new Cesium.Cartesian2(10, 10),
            lineThickness: new Cesium.Cartesian2(1.2, 1.2),
          }),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#D8FBFF'),
        },
      })
    }
    capEntity.position = new Cesium.ConstantPositionProperty(center)
    capEntity.orientation = new Cesium.ConstantProperty(
      Cesium.Quaternion.fromRotationMatrix(rotation),
    )
    if (capEntity.plane)
      capEntity.plane.dimensions = new Cesium.ConstantProperty(
        new Cesium.Cartesian2(span, span),
      )
    capEntity.show = true
  }

  function refresh() {
    displayPosition = state.position
    applyPlanes(displayPosition)
  }

  /** 剖切启用/切换目标时做短距位移动画，增强动态剖切感 */
  function animateTo(targetPos: number, durationMs = 520) {
    const token = ++animToken
    const from = displayPosition
    const to = targetPos
    if (Math.abs(to - from) < 0.002 || durationMs <= 0) {
      displayPosition = to
      applyPlanes(displayPosition)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      if (token !== animToken) return
      const t = Math.min(1, (now - start) / durationMs)
      const ease = 1 - Math.pow(1 - t, 3)
      displayPosition = from + (to - from) * ease
      applyPlanes(displayPosition)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  async function register(
    tileset: Cesium.Cesium3DTileset,
    role: 'bim' | 'partial',
    url: string,
  ) {
    const current = generation
    try {
      const response = await fetch(url, { cache: 'force-cache' })
      if (!response.ok) throw new Error('模型剖切范围读取失败')
      const manifest = await response.json()
      const box = manifest.root?.boundingVolume?.box as number[] | undefined
      if (!box) throw new Error('该模型未提供局部包围盒，暂不支持剖切')
      sectionLocalPlane(box, 'z', 0.5, false)
      if (current !== generation || tileset.isDestroyed()) return
      entries.set(tileset, { tileset, role, box })
      state.error = ''
      refresh()
    } catch (error) {
      if (current === generation)
        state.error =
          error instanceof Error ? error.message : '模型剖切初始化失败'
    }
  }
  function update(
    patch: Partial<
      Pick<SectionState, 'enabled' | 'axis' | 'position' | 'reverse' | 'target'>
    >,
  ) {
    const enabling = patch.enabled === true && !state.enabled
    const targetChanged =
      patch.target !== undefined && patch.target !== state.target
    const axisChanged = patch.axis !== undefined && patch.axis !== state.axis
    Object.assign(state, patch)
    if (enabling) {
      // 启用时从外侧扫入当前剖切位置
      displayPosition = state.reverse ? 1 : 0
      animateTo(state.position, 640)
      return
    }
    if (targetChanged || axisChanged) {
      animateTo(state.position, 420)
      return
    }
    if (patch.position !== undefined) {
      // 拖动滑杆跟手，不做插值
      displayPosition = state.position
      applyPlanes(displayPosition)
      return
    }
    refresh()
  }
  function setPresentationActive(active: boolean) {
    presentationActive = active
    refresh()
  }
  function reset() {
    animToken++
    update({
      enabled: false,
      axis: 'z',
      position: 0.55,
      reverse: false,
      target: 'all',
    })
  }
  function clear() {
    generation++
    animToken++
    entries.forEach(({ tileset, collection }) => {
      if (
        !tileset.isDestroyed() &&
        collection &&
        tileset.clippingPlanes === collection
      ) {
        // Setter 负责销毁其拥有的 collection；不要重复 destroy。
        tileset.clippingPlanes =
          undefined as unknown as Cesium.ClippingPlaneCollection
      }
    })
    entries.clear()
    const viewer = getViewer?.()
    if (capEntity && viewer && !viewer.isDestroyed()) {
      viewer.entities.remove(capEntity)
    }
    capEntity = null
    state.ready = false
  }
  return {
    state,
    register,
    update,
    reset,
    refresh,
    setPresentationActive,
    clear,
  }
}
