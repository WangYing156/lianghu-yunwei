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
export function useModelSection(requestRender: () => void) {
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

  function reference() {
    const candidates = [...entries.values()].filter(
      (e) =>
        !e.tileset.isDestroyed() &&
        (state.target === 'all' || e.role === state.target),
    )
    return candidates.find((e) => e.role === 'partial') ?? candidates[0]
  }
  function refresh() {
    const origin = reference()
    state.ready = !!origin
    const local = origin
      ? sectionLocalPlane(origin.box, state.axis, state.position, state.reverse)
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
          edgeColor: Cesium.Color.fromCssColorString('#8bc9be'),
          edgeWidth: 1,
        })
        tileset.clippingPlanes = entry.collection
      } else {
        const current = entry.collection.get(0)
        current.normal = plane.normal
        current.distance = plane.distance
      }
      entry.collection.enabled = true
    })
    requestRender()
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
    Object.assign(state, patch)
    refresh()
  }
  function setPresentationActive(active: boolean) {
    presentationActive = active
    refresh()
  }
  function reset() {
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
