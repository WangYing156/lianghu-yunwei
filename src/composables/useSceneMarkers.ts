import { reactive, shallowRef } from 'vue'
import * as Cesium from 'cesium'
import type { MapDevicePoint } from './useCesiumTunnelMap'
import {
  geoForPointOnRoute,
  type TunnelRouteData,
} from '../utils/tunnelRouteLoader'
import {
  loadModelEquipment,
  type ModelEquipment,
} from '../utils/modelEquipment'
import {
  BIM_MARKER_NEAR_DISTANCE,
  MARKER_CLUSTER_PIXELS,
  clusterSymbolUrl,
  equipmentPointType,
  hideBimMarkers,
  isPriorityMarker,
  markerSymbolUrl,
} from '../utils/markerSymbols'

export type SceneMarkerEntity = Cesium.Entity & {
  __deviceId?: string
  __equipmentId?: string
}
export interface ClusterMarkerPick {
  __clusterMembers: SceneMarkerEntity[]
}
interface MarkerOptions {
  getViewer: () => Cesium.Viewer | null
  getRoute: () => TunnelRouteData | null
  getDevices: () => MapDevicePoint[]
  getAllDevices: () => MapDevicePoint[]
  getSelectedId: () => string | null
  getSelectedEquipmentId: () => string
  isKindVisible: (group: string, kind: string) => boolean
  is3d: () => boolean
  isRoaming: () => boolean
  getPartial: () => Cesium.Cesium3DTileset | null
  catalogUrl: string
}
/** 原生屏幕空间聚合 + 告警/选中独立优先层 + BIM 近景退场，避免逐帧 N² 碰撞检测。 */
export function useSceneMarkers(options: MarkerOptions) {
  const equipment = shallowRef<ModelEquipment[]>([])
  const stats = reactive({
    businessCount: 0,
    modelCount: 0,
    nearHidden: false,
    loading: false,
    error: '',
  })
  let normal: Cesium.CustomDataSource | null = null
  let priority: Cesium.CustomDataSource | null = null
  const business = new Map<string, SceneMarkerEntity>()
  const model = new Map<string, SceneMarkerEntity>()
  let removeUpdate: (() => void) | null = null
  let removeCluster: (() => void) | null = null
  let catalogSequence = 0
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const clusterHistory: { members: string[]; position: number[] }[] = []

  async function initialize(v: Cesium.Viewer) {
    normal = new Cesium.CustomDataSource('设施与 BIM 构件（自动聚合）')
    priority = new Cesium.CustomDataSource('告警与选中点位（独立显示）')
    normal.clustering.enabled = true
    normal.clustering.pixelRange = MARKER_CLUSTER_PIXELS
    normal.clustering.minimumClusterSize = 2
    normal.clustering.clusterLabels = false
    normal.clustering.clusterPoints = false
    removeCluster = normal.clustering.clusterEvent.addEventListener(
      (
        entities: SceneMarkerEntity[],
        cluster: {
          billboard: Cesium.Billboard
          label: Cesium.Label
          point: Cesium.PointPrimitive
        },
      ) => {
        cluster.label.show = false
        cluster.point.show = false
        cluster.billboard.show = true
        cluster.billboard.image = clusterSymbolUrl(entities.length)
        cluster.billboard.width = 40
        cluster.billboard.height = 40
        cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER
        cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY
        cluster.billboard.id = {
          __clusterMembers: entities,
        } satisfies ClusterMarkerPick
        // 数字聚合与告警/选中图标之间留出屏幕空间，不用隐藏高优先级点位来换取整洁。
        const center = Cesium.SceneTransforms.worldToWindowCoordinates(
          v.scene,
          cluster.billboard.position,
        )
        const priorityPixels =
          priority?.entities.values
            .map((e) => {
              const position = e.show
                ? e.position?.getValue(v.clock.currentTime)
                : undefined
              return position
                ? Cesium.SceneTransforms.worldToWindowCoordinates(
                    v.scene,
                    position,
                  )
                : undefined
            })
            .filter((p): p is Cesium.Cartesian2 => !!p) ?? []
        const offsets = [
          [0, 0],
          [0, -48],
          [48, -36],
          [-48, -36],
          [0, 48],
        ]
        const free = center
          ? offsets.find(([x, y]) => {
              const sx = center.x + x,
                sy = center.y + y
              return (
                sx >= 22 &&
                sx <= v.canvas.clientWidth - 22 &&
                sy >= 22 &&
                sy <= v.canvas.clientHeight - 22 &&
                priorityPixels.every(
                  (p) => Math.hypot(p.x - sx, p.y - sy) >= 46,
                )
              )
            })
          : undefined
        cluster.billboard.pixelOffset = new Cesium.Cartesian2(
          ...(free ?? [0, -48]),
        )
        if (import.meta.env.DEV) {
          const p = cluster.billboard.position
          clusterHistory.push({
            members: entities.map((e) =>
              e.__equipmentId ? `bim:${e.__equipmentId}` : e.__deviceId!,
            ),
            position: [p.x, p.y, p.z],
          })
          if (clusterHistory.length > 100)
            clusterHistory.splice(0, clusterHistory.length - 100)
        }
      },
    )
    await Promise.all([v.dataSources.add(normal), v.dataSources.add(priority)])
    if (v.isDestroyed() || options.getViewer() !== v) return
    removeUpdate = v.scene.preUpdate.addEventListener(updateNearVisibility)
  }
  function place(entity: SceneMarkerEntity, urgent: boolean) {
    if (!normal || !priority) return
    const source = urgent ? priority : normal
    const other = urgent ? normal : priority
    other.entities.remove(entity)
    if (!source.entities.contains(entity)) source.entities.add(entity)
  }
  function remove(entity: SceneMarkerEntity) {
    normal?.entities.remove(entity)
    priority?.entities.remove(entity)
  }
  function syncBusiness() {
    const v = options.getViewer()
    const route = options.getRoute()
    if (!v || v.isDestroyed() || !route || !normal || !priority) return
    const devices = options.getDevices()
    const all = options.getAllDevices()
    const ids = new Set(devices.map((p) => p.id))
    business.forEach((entity, id) => {
      if (!ids.has(id)) {
        remove(entity)
        business.delete(id)
      }
    })
    devices.forEach((point) => {
      let entity = business.get(point.id)
      if (!entity) {
        entity = new Cesium.Entity({
          id: `device-${point.id}`,
          name: point.name,
        }) as SceneMarkerEntity
        entity.__deviceId = point.id
        business.set(point.id, entity)
      }
      const [lng, lat] = geoForPointOnRoute(route, point, all)
      entity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(lng, lat, 3.6),
      )
      entity.show = !options.isRoaming()
      const selected = point.id === options.getSelectedId()
      const urgent = isPriorityMarker(point.status, point.alarm)
      const pulse = () =>
        motion.matches ? 1 : 1 + (Math.sin(performance.now() / 650) + 1) * 0.08
      entity.billboard = new Cesium.BillboardGraphics({
        image: markerSymbolUrl(point.kind, point.status, selected),
        width: selected ? 34 : 28,
        height: selected ? 34 : 28,
        scale: urgent ? new Cesium.CallbackProperty(pulse, false) : 1,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
      entity.point = urgent
        ? new Cesium.PointGraphics({
            color: Cesium.Color.fromCssColorString(
              point.status === 'alarm' ? '#ff7079' : '#efb66e',
            ).withAlpha(0.18),
            pixelSize: new Cesium.CallbackProperty(
              () =>
                motion.matches
                  ? 38
                  : 38 + 9 * Math.sin(performance.now() / 650),
              false,
            ),
            outlineWidth: 1,
            outlineColor: Cesium.Color.fromCssColorString(
              point.status === 'alarm' ? '#ff7079' : '#efb66e',
            ).withAlpha(0.38),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          })
        : undefined
      place(entity, urgent || selected)
    })
    stats.businessCount = devices.length
  }
  function syncModel() {
    const ts = options.getPartial()
    const ids = new Set(equipment.value.map((e) => e.id))
    model.forEach((entity, id) => {
      if (!ids.has(id)) {
        remove(entity)
        model.delete(id)
      }
    })
    let count = 0
    equipment.value.forEach((item) => {
      const type = equipmentPointType(item)
      const enabled = options.isKindVisible(type.group, type.kind)
      if (enabled) count++
      let entity = model.get(item.id)
      if (!entity) {
        entity = new Cesium.Entity({
          id: `equipment-${item.id}`,
          name: item.name,
        }) as SceneMarkerEntity
        entity.__equipmentId = item.id
        model.set(item.id, entity)
      }
      entity.position = new Cesium.ConstantPositionProperty(
        new Cesium.Cartesian3(...item.center),
      )
      const selected = item.id === options.getSelectedEquipmentId()
      entity.billboard = new Cesium.BillboardGraphics({
        image: markerSymbolUrl(type.kind, 'bim', selected),
        width: 28,
        height: 28,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          BIM_MARKER_NEAR_DISTANCE,
          Number.POSITIVE_INFINITY,
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
      entity.show =
        enabled &&
        !!ts?.show &&
        options.is3d() &&
        !options.isRoaming() &&
        !stats.nearHidden
      place(entity, selected)
    })
    stats.modelCount = count
  }
  function updateNearVisibility() {
    const v = options.getViewer()
    if (!v || v.isDestroyed()) return
    let nearest = Number.POSITIVE_INFINITY
    if (options.is3d() && !options.isRoaming())
      for (const item of equipment.value)
        nearest = Math.min(
          nearest,
          Cesium.Cartesian3.distance(
            v.camera.positionWC,
            new Cesium.Cartesian3(...item.center),
          ),
        )
    const hidden = hideBimMarkers(nearest, stats.nearHidden)
    if (hidden !== stats.nearHidden) {
      stats.nearHidden = hidden
      syncModel()
    }
  }
  async function loadEquipment(ts: Cesium.Cesium3DTileset) {
    const sequence = ++catalogSequence
    stats.loading = true
    stats.error = ''
    try {
      const catalog = await loadModelEquipment(options.catalogUrl)
      if (
        sequence !== catalogSequence ||
        ts.isDestroyed() ||
        options.getPartial() !== ts
      )
        return
      equipment.value = catalog.map((item) => {
        const p = Cesium.Matrix4.multiplyByPoint(
          ts.modelMatrix,
          new Cesium.Cartesian3(...item.center),
          new Cesium.Cartesian3(),
        )
        return { ...item, center: [p.x, p.y, p.z] as [number, number, number] }
      })
      syncModel()
    } catch (error) {
      if (sequence === catalogSequence)
        stats.error =
          error instanceof Error ? error.message : '设备标注加载失败'
    } finally {
      if (sequence === catalogSequence) stats.loading = false
    }
  }
  function sync() {
    syncBusiness()
    syncModel()
    options.getViewer()?.scene.requestRender()
  }
  function clearEquipment() {
    catalogSequence++
    equipment.value = []
    model.forEach(remove)
    model.clear()
    stats.modelCount = 0
    stats.nearHidden = false
    stats.loading = false
  }
  function destroy() {
    removeUpdate?.()
    removeUpdate = null
    removeCluster?.()
    removeCluster = null
    clearEquipment()
    business.forEach(remove)
    business.clear()
    const v = options.getViewer()
    if (v && !v.isDestroyed()) {
      if (normal) v.dataSources.remove(normal, true)
      if (priority) v.dataSources.remove(priority, true)
    }
    normal = null
    priority = null
    clusterHistory.length = 0
  }
  return {
    equipment,
    stats,
    initialize,
    sync,
    clearEquipment,
    loadEquipment,
    destroy,
    get businessEntities() {
      return [...business.values()]
    },
    get modelEntities() {
      return [...model.values()]
    },
    get clusterHistory() {
      return clusterHistory
    },
    get normalSource() {
      return normal
    },
    get prioritySource() {
      return priority
    },
  }
}
