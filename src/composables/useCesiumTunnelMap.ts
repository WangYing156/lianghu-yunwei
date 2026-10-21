import { onBeforeUnmount, ref, shallowRef, type Ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  geoForPointOnRoute,
  loadTunnelRoute,
  type LngLat,
  type TunnelRouteData
} from '../utils/tunnelRouteLoader'
import { ARROW_SVG_URL, sampleRoute, sliceRoute } from '../utils/tunnelRouteFlow'
import {
  getSceneVisualPreset,
  LIANGHU_ORTHO_RECT,
  LIANGHU_ORTHO_TMS,
  type SceneVisualPreset,
  type SceneVisualPresetId
} from '../config/sceneVisualPresets'
import {
  BIM_TILESET_PATH,
  OBLIQUE_TILESET_PATHS,
  PARTIAL_TUNNEL_TILESET_PATH
} from '../config/tunnelTilesets'
import { setTilesetBackFaceCulling, spawnClickPulse } from './useTunnelModelFx'
import { useModelRoaming } from './useModelRoaming'
import { getSceneEnvironment, type SceneEnvironmentId } from '../config/sceneEnvironment'

export type BasemapMode = 'satellite' | 'vector' | 'reality'
export type MapViewMode = '2d' | '3d'

export interface MapDevicePoint {
  id: string
  stake: string
  name: string
  status: 'ok' | 'warn' | 'alarm' | 'offline'
  group: string
  kind: string
  value?: string
  inspect?: string
  alarm?: string
  icon?: string
  unit?: string
  history?: { time: string; value: number }[]
}

export interface UseCesiumTunnelMapOptions {
  onPopupClosed?: () => void
  onDeviceFocus?: (id: string | null) => void
  /** 选择模式：仅回调，不打开 Popup */
  onDeviceSelect?: (p: MapDevicePoint) => void
  buildPopupContent?: (p: MapDevicePoint) => HTMLElement
  getOrthophotoAlpha?: () => number
  getVisualPresetId?: () => SceneVisualPresetId
  /** 倾斜摄影 3D Tiles 透明度 0~1 */
  getObliqueAlpha?: () => number
  /** 施工模型不透明度 0~1 */
  getBimOpacity?: () => number
  /** 竣工模型不透明度 0~1 */
  getPartialOpacity?: () => number
  /** 竣工模型 X光 模式（原始 / X光 两态，无透明度） */
  getPartialXray?: () => boolean
  /** 场景全局环境 */
  getSceneEnvironmentId?: () => SceneEnvironmentId
  getBasemapEnabled?: () => boolean
  getShowPartialTunnel?: () => boolean
  /** BIM 中性照明强度 0~100 */
  getBimBrightness?: () => number
  getShowFullTunnel?: () => boolean
  onModelSelect?: (info: ModelPickInfo | null) => void
}

export interface ModelPickInfo {
  title: string
  role: 'bim' | 'partial' | 'oblique' | 'unknown'
  properties: Record<string, string>
  /** 相对场景容器的点击像素，供属性面板就近展示 */
  screenX?: number
  screenY?: number
}

const SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7']

/** 本地 3D Tiles（public/三维数据） */
const FOCUS_VIEW_RANGE_3D = 240

function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const segments = relativePath.replace(/^\/+/, '').split('/').map(encodeURIComponent)
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${window.location.origin}${prefix}${segments.join('/')}`
}

const ARROW_COUNT = 18
const FLOW_SEG_LEN = 0.11
const FLOW_PHASE_STEP = 0.00032

/** 线路贴地高度（米）：略微抬离椭球面，避免与地形面 z-fighting */
const ROUTE_HEIGHT = 1.2
const FLOW_HEIGHT = 2.4
const DEVICE_HEIGHT = 3.6

const STATUS_OUTLINE: Record<MapDevicePoint['status'], number[]> = {
  ok: [0, 210, 106],
  warn: [255, 180, 0],
  alarm: [255, 77, 79],
  offline: [127, 149, 184]
}

function tiandituToken(): string {
  return (import.meta.env.VITE_TIANDITU_TK as string | undefined)?.trim() || ''
}

/* ============================================================
 * 底图：ImageryLayer
 * 说明：Cesium 的 {z}/{x}/{y} 即 XYZ 语义（y=0 为最北），
 * 与天地图 DataServer、高德 appmaptile 的行列号定义一致，无需翻转。
 * ============================================================ */

function createTiandituLayer(tile: string, tk: string, dimmed: boolean): Cesium.ImageryLayer {
  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: `https://t{s}.tianditu.gov.cn/DataServer?T=${tile}&x={x}&y={y}&l={z}&tk=${tk}`,
      subdomains: SUBDOMAINS,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: 18,
      credit: new Cesium.Credit('© 国家基础地理信息中心')
    }),
    // 影像层统一压暗提对比，贴合平台深色主题（标注层保持原色以确保可读）
    dimmed
      ? {
          brightness: 0.94,
          contrast: 1.08,
          saturation: 0.82,
          gamma: 1.02
        }
      : {}
  )
}

function createGaodeLayer(mode: 'satellite' | 'vector'): Cesium.ImageryLayer {
  const style = mode === 'satellite' ? 6 : 8
  const host = mode === 'satellite' ? 'webst0{s}' : 'webrd0{s}'
  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: `https://${host}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x={x}&y={y}&z={z}`,
      subdomains: ['1', '2', '3', '4'],
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: 18,
      credit: new Cesium.Credit('© 高德地图')
    }),
    mode === 'satellite'
      ? { brightness: 0.92, contrast: 1.08, saturation: 0.78 }
      : { brightness: 0.95, contrast: 1.02, saturation: 0.85 }
  )
}

function createLianghuOrthophotoLayer(alpha: number): Cesium.ImageryLayer {
  const rect = LIANGHU_ORTHO_RECT
  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: LIANGHU_ORTHO_TMS,
      tilingScheme: new Cesium.GeographicTilingScheme(),
      rectangle: Cesium.Rectangle.fromDegrees(rect.west, rect.south, rect.east, rect.north),
      maximumLevel: 22,
      credit: new Cesium.Credit('© 两湖正射影像')
    }),
    {
      alpha: Math.max(0, Math.min(1, alpha)),
      brightness: 1.15,
      contrast: 1.06,
      saturation: 1.1
    }
  )
}

function buildBasemapLayers(mode: 'satellite' | 'vector', _orthoAlpha: number): Cesium.ImageryLayer[] {
  const tk = tiandituToken()
  if (tk) {
    const baseTile = mode === 'satellite' ? 'img_w' : 'vec_w'
    const labelTile = mode === 'satellite' ? 'cia_w' : 'cva_w'
    return [createTiandituLayer(baseTile, tk, true), createTiandituLayer(labelTile, tk, false)]
  }
  return [createGaodeLayer(mode)]
}

/* ============================================================
 * 几何辅助
 * ============================================================ */

function positionsOf(coords: LngLat[], height: number): Cesium.Cartesian3[] {
  return coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1], height))
}

/* ============================================================
 * 设备图标：Canvas 生成（与原实现一致）
 * ============================================================ */

const emojiMarkerUrlCache = new Map<string, string>()

function emojiMarkerUrl(emoji: string, outline: number[], dimmed: boolean, focused: boolean): string {
  const key = `${emoji}|${outline.join(',')}|${dimmed}|${focused}`
  const cached = emojiMarkerUrlCache.get(key)
  if (cached) return cached

  const px = focused ? 44 : 36
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const r = px / 2 - 2
  ctx.beginPath()
  ctx.arc(px / 2, px / 2, r, 0, Math.PI * 2)
  ctx.fillStyle = dimmed ? 'rgba(200,210,220,0.35)' : 'rgba(255,255,255,0.98)'
  ctx.fill()
  ctx.lineWidth = focused ? 3 : 2
  ctx.strokeStyle = dimmed
    ? `rgba(${outline[0]},${outline[1]},${outline[2]},0.35)`
    : `rgb(${outline[0]},${outline[1]},${outline[2]})`
  ctx.stroke()
  ctx.font = `${focused ? 22 : 18}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, px / 2, px / 2 + 1)

  const url = canvas.toDataURL('image/png')
  emojiMarkerUrlCache.set(key, url)
  return url
}

function deviceSizePx(p: MapDevicePoint, dimmed: boolean, focused: boolean): number {
  return focused ? 26 : 20
}

/** 无 emoji 时的状态色圆点：按状态色缓存生成的画布图标（描边色已烘焙进图） */
const deviceDotUrlCache = new Map<string, string>()

function deviceDotUrl(outline: number[], dimmed: boolean, focused: boolean): string {
  const key = `${outline.join(',')}|${dimmed}|${focused}`
  const cached = deviceDotUrlCache.get(key)
  if (cached) return cached

  const px = focused ? 48 : 40
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const r = px / 2 - 3
  ctx.beginPath()
  ctx.arc(px / 2, px / 2, r, 0, Math.PI * 2)
  ctx.fillStyle = dimmed ? 'rgba(200,210,220,0.35)' : 'rgba(255,255,255,0.98)'
  ctx.fill()
  ctx.lineWidth = focused ? 4 : 3
  ctx.strokeStyle = dimmed
    ? `rgba(${outline[0]},${outline[1]},${outline[2]},0.35)`
    : `rgb(${outline[0]},${outline[1]},${outline[2]})`
  ctx.stroke()

  const url = canvas.toDataURL('image/png')
  deviceDotUrlCache.set(key, url)
  return url
}

/* ============================================================
 * 悬浮 Popup 锚点（对外结构与 ArcGIS 版一致）
 * ============================================================ */

export interface MapDevicePopupAnchor {
  device: MapDevicePoint
  x: number
  y: number
}

export function useCesiumTunnelMap(
  containerRef: Ref<HTMLDivElement | null>,
  getDevices: () => MapDevicePoint[],
  options?: UseCesiumTunnelMapOptions
) {
  const ready = ref(false)
  const viewMode = ref<MapViewMode>('2d')
  const devicePopupAnchor = ref<MapDevicePopupAnchor | null>(null)

  const viewer = shallowRef<Cesium.Viewer | null>(null)
  const routeData = shallowRef<TunnelRouteData | null>(null)

  let basemapTileMode: 'satellite' | 'vector' = 'satellite'
  let activeBasemapMode: BasemapMode = 'satellite'
  const tunnelTilesets: Cesium.Cesium3DTileset[] = []
  let routeLayerUserVisible = true
  let flowLayerUserVisible = true
  let tilesetsLoading: Promise<void> | null = null
  let loadedPresetId: SceneVisualPresetId | null = null
  let activeEnvironmentId: SceneEnvironmentId = 'default'
  const xrayRestoresMap = new Map<Cesium.Cesium3DTileset, () => void>()
  let orthoLayerRef: Cesium.ImageryLayer | null = null
  let clickPulseDispose: (() => void) | null = null
  let selectedFeature: { feature: Cesium.Cesium3DTileFeature; color: Cesium.Color } | null = null

  // Entity 分组
  let routeEntities: Cesium.Entity[] = []
  let flowEntities: Cesium.Entity[] = []
  let arrowEntities: Cesium.Entity[] = []
  let deviceEntities: Cesium.Entity[] = []

  let floatingPosition: Cesium.Cartesian3 | null = null
  let flowPhase = 0
  let flowRaf = 0
  let flowRunning = false
  let flowEnabled = true
  let focusedDeviceId: string | null = null
  let lifecycleVersion = 0
  let viewSwitchSeq = 0
  /** mount 期间用户是否主动切换过维度（用于区分「用户意图」与「初始化赋值」） */
  let userSwitchedDuringMount = false
  let moveHandler: Cesium.Event.RemoveCallback | null = null

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const modelRoaming = useModelRoaming({
    getViewer: () => viewer.value,
    prepare: async () => {
      const v = viewer.value
      if (!v || v.isDestroyed()) return null
      await ensureTunnelTilesets(v)
      return getPartialTileset() ?? await loadOneTileset(v, PARTIAL_TUNNEL_TILESET_PATH, 3, 'partial')
    },
    getTilesets: () => tunnelTilesets,
    onEnter: () => {
      closeScenePopup()
      setEntityVisible(deviceEntities, false)
    },
    onExit: () => {
      const v = viewer.value
      if (!v || v.isDestroyed()) return
      closeScenePopup()
      applyPresentationMode()
      syncDeviceGraphics()
      applyVisualEnvironment(v)
    },
    onEquipment: item => options?.onModelSelect?.(item ? {
      title: item.name,
      role: 'partial',
      properties: { '构件编号': item.modelId, '设备类别': item.category, '数据来源': '竣工 BIM 构件', '说明': '空间位置来自模型，不代表设备实时运行状态' }
    } : null)
  })

  function markerScale(status: MapDevicePoint['status']) {
    return new Cesium.CallbackProperty(() => {
      if (motionQuery.matches || (status !== 'alarm' && status !== 'warn')) return 1
      return 1 + (Math.sin(performance.now() / 600) + 1) * 0.055
    }, false)
  }

  /* ==========================================================
   * 流动动画：用 CallbackProperty 驱动，Cesium 每帧自动重算，
   * 相比ArcGIS 每帧 removeAll()+addMany() 重建 Graphic 有量级提升。
   * ========================================================== */

  function flowPositionsCallback(offset: number): Cesium.PositionProperty {
    // CallbackProperty 实现了 PositionProperty 接口，此处断言以满足 Cesium 类型定义
    return new Cesium.CallbackProperty(() => {
      const r = routeData.value
      if (!r) return []
      const t0 = (flowPhase + offset) % 1
      return positionsOf(sliceRoute(r, t0, t0 + FLOW_SEG_LEN, 14), FLOW_HEIGHT)
    }, false) as unknown as Cesium.PositionProperty
  }

  function arrowPositionCallback(index: number): Cesium.PositionProperty {
    return new Cesium.CallbackProperty(() => {
      const r = routeData.value
      if (!r) return Cesium.Cartesian3.ZERO
      const t = (flowPhase + index / ARROW_COUNT) % 1
      const { point } = sampleRoute(r, t, 0.004)
      return Cesium.Cartesian3.fromDegrees(point[0], point[1], FLOW_HEIGHT)
    }, false) as unknown as Cesium.PositionProperty
  }

  function arrowRotationCallback(index: number): Cesium.Property {
    return new Cesium.CallbackProperty(() => {
      const r = routeData.value
      if (!r) return 0
      const t = (flowPhase + index / ARROW_COUNT) % 1
      // 采样前后两点求切线朝向；Cesium billboard rotation 为弧度
      const p0 = r.pointAt(t)
      const p1 = r.pointAt(Math.min(1, t + 0.004))
      const dx = p1[0] - p0[0]
      const dy = p1[1] - p0[1]
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI
      return Cesium.Math.toRadians(deg)
    }, false) as unknown as Cesium.Property
  }

  function buildStaticRoute(): Cesium.Entity[] {
    const route = routeData.value
    if (!route) return []
    const path = positionsOf(route.coordinates, ROUTE_HEIGHT)
    const out: Cesium.Entity[] = []

    // 外层深绿光晕
    out.push(
      new Cesium.Entity({
        id: 'route-outer',
        polyline: {
          positions: path,
          width: 11,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.22,
            color: Cesium.Color.fromCssColorString('rgba(4,120,87,0.85)')
          })
        }
      })
    )
    // 中层白
    out.push(
      new Cesium.Entity({
        id: 'route-mid',
        polyline: {
          positions: path,
          width: 7,
          material: Cesium.Color.fromCssColorString('rgba(255,255,255,0.98)')
        }
      })
    )
    // 内层亮绿
    out.push(
      new Cesium.Entity({
        id: 'route-inner',
        polyline: {
          positions: path,
          width: 4,
          material: Cesium.Color.fromCssColorString('#10b981')
        }
      })
    )

    // 里程节点圆点
    route.coordinates.forEach((c, i) => {
      const isEnd = i === 0 || i === route.coordinates.length - 1
      if (i % 2 === 1 && !isEnd) return
      out.push(
        new Cesium.Entity({
          id: `route-node-${i}`,
          position: Cesium.Cartesian3.fromDegrees(c[0], c[1], ROUTE_HEIGHT),
          point: {
            pixelSize: isEnd ? 9 : 7,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#059669'),
            outlineWidth: 1.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
    })

    return out
  }

  function buildFlowEntities(): { flow: Cesium.Entity[]; arrows: Cesium.Entity[] } {
    const flow: Cesium.Entity[] = []
    const arrows: Cesium.Entity[] = []

    for (let s = 0; s < 4; s++) {
      const offset = s * 0.22
      flow.push(
        new Cesium.Entity({
          id: `flow-seg-${s}`,
          polyline: {
            positions: flowPositionsCallback(offset),
            width: 5,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.35,
              color: Cesium.Color.fromCssColorString('rgba(120,255,255,0.62)')
            })
          }
        })
      )
      // 亮芯
      flow.push(
        new Cesium.Entity({
          id: `flow-core-${s}`,
          polyline: {
            positions: flowPositionsCallback(offset),
            width: 2,
            material: Cesium.Color.fromCssColorString('rgba(220,255,255,1)')
          }
        })
      )
    }

    for (let i = 0; i < ARROW_COUNT; i++) {
      arrows.push(
        new Cesium.Entity({
          id: `flow-arrow-${i}`,
          position: arrowPositionCallback(i),
          billboard: {
            image: new Cesium.ConstantProperty(ARROW_SVG_URL),
            width: new Cesium.ConstantProperty(16),
            height: new Cesium.ConstantProperty(16),
            rotation: arrowRotationCallback(i),
            // billboard 默认始终正对相机，此处仅需关闭深度遮挡避免被地形遮住
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      )
    }

    return { flow, arrows }
  }

  /* ==========================================================
   * 设备点位
   * ========================================================== */

  function syncDeviceGraphics() {
    const v = viewer.value
    const route = routeData.value
    if (!v || !route) return

    const devices = getDevices()

    // 复用已有Entity，仅更新变化的属性，避免全量重建
    const existing = new Map<string, Cesium.Entity>()
    deviceEntities.forEach(e => {
      const id = (e as unknown as { __deviceId?: string }).__deviceId
      if (id) existing.set(id, e)
    })

    const next: Cesium.Entity[] = []

    devices.forEach(p => {
      const [lng, lat] = geoForPointOnRoute(route, p, devices)
      const dimmed = false
      const focused = focusedDeviceId === p.id
      const outline = STATUS_OUTLINE[p.status] ?? STATUS_OUTLINE.ok
      const emoji = p.icon?.trim()
      const url = emoji ? emojiMarkerUrl(emoji, outline, dimmed, focused) : deviceDotUrl(outline, dimmed, focused)
      const size = deviceSizePx(p, dimmed, focused)

      const prev = existing.get(p.id)
      if (prev) {
        prev.position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees(lng, lat, DEVICE_HEIGHT)
        )
        prev.show = !modelRoaming.state.active
        // 图标随 dimmed/focused 变化（画布尺寸不同），需整体替换
        if (prev.billboard) {
          prev.billboard.image = new Cesium.ConstantProperty(url)
          prev.billboard.width = new Cesium.ConstantProperty(size)
          prev.billboard.height = new Cesium.ConstantProperty(size)
          prev.billboard.scale = markerScale(p.status)
        }
        next.push(prev)
      } else {
        const e = new Cesium.Entity({
          id: `device-${p.id}`,
          name: p.name,
          show: !modelRoaming.state.active,
          position: Cesium.Cartesian3.fromDegrees(lng, lat, DEVICE_HEIGHT),
          // emoji / 圆点统一走 billboard，描边色已烘焙进画布图标
          billboard: {
            image: new Cesium.ConstantProperty(url),
            width: new Cesium.ConstantProperty(size),
            height: new Cesium.ConstantProperty(size),
            scale: markerScale(p.status),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
        // 记录业务 id，供点击命中查询
        ;(e as unknown as { __deviceId?: string }).__deviceId = p.id
        v.entities.add(e)
        next.push(e)
      }
    })

    // 移除已不在列表中的设备（按业务 id 精确回收）
    const nextIds = new Set(devices.map(d => d.id))
    existing.forEach((entity, id) => {
      if (!nextIds.has(id)) v.entities.remove(entity)
    })

    deviceEntities = next
  }

  /* ==========================================================
   * 相机与交互
   * ========================================================== */

  function currentHeading(): number {
    return viewMode.value === '3d' ? Cesium.Math.toRadians(25) : 0
  }

  function currentPitch(): number {
    // 原 ArcGIS tilt=55（自天顶起算）→ Cesium pitch 自地平线起算，俯视约 -35°
    return viewMode.value === '3d' ? Cesium.Math.toRadians(-35) : Cesium.Math.toRadians(-90)
  }

  /** 二维（正交）模式下缩放：靠frustum 尺寸而非相机高度，height 在正交下不影响缩放 */
  const TWO_D_FRUSTUM_SIZE = 1600
  /** 二维相机高度：正交投影下不影响缩放，但必须非0，否则 Cesium 会重置到默认远景 */
  const TWO_D_CAM_HEIGHT = 2_000_000

  /**
   * 二维缩放：以当前视口为基准按比例缩放。
   * 注意：不可直接设置 frustum.width/height——正交 frustum 的 near/far 需同步推算，
   * 否则 Cesium 会抛 "width, aspectRatio, near, or far parameters are not set"。
   * 这里改为通过相机高度缩放视口：二维正交下 height 变化不影响取景范围，故配合 zoomToCursor 使用。
   */
  function zoomTwoD(factor: number) {
    const v = viewer.value
    if (!v) return
    // 正交模式下 camera.getMagnitude() 即视口对角尺度，缩放它即可安全改变比例尺
    const mag = v.camera.getMagnitude()
    if (!mag || !isFinite(mag)) return
    v.camera.zoomIn(mag * (factor - 1))
  }

  async function resetMapView(duration = 0.8) {
    const v = viewer.value
    const route = routeData.value
    if (!v || !route) return
    focusedDeviceId = null
    closeFloatingPopup()
    syncDeviceGraphics()

    if (!isScene2D(v) && tunnelTilesets.length) {
      await flyToTilesetFocus(v, duration)
      return
    }

    const pts = positionsOf(route.coordinates, ROUTE_HEIGHT)
    const sphere = Cesium.BoundingSphere.fromPoints(pts)

    // 二维/三维统一用 flyToBoundingSphere：Cesium 会自行求解正交 frustum 的全部参数，
    // 避免手动设置 width/near/far 引发 DeveloperError。
    v.camera.flyToBoundingSphere(sphere, {
      offset: new Cesium.HeadingPitchRange(currentHeading(), currentPitch(), 0),
      duration
    })
  }

  async function focusDevice(p: MapDevicePoint) {
    const v = viewer.value
    if (!v) return

    focusedDeviceId = p.id
    options?.onDeviceFocus?.(p.id)
    syncDeviceGraphics()

    const devices = getDevices()
    const route = routeData.value!
    const [lng, lat] = geoForPointOnRoute(route, p, devices)
    const target = Cesium.Cartesian3.fromDegrees(lng, lat, DEVICE_HEIGHT)

    if (options?.onDeviceSelect) {
      options.onDeviceSelect(p)
    }

    // 原版：二维拉近聚焦点/ 三维 tilt 58 heading 25
    if (viewMode.value === '3d') {
      const focusSphere = new Cesium.BoundingSphere(target, 32)
      await v.camera.flyToBoundingSphere(focusSphere, {
        duration: 0.85,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(22),
          Cesium.Math.toRadians(-28),
          FOCUS_VIEW_RANGE_3D
        )
      })
    } else {
      // 二维为正交投影：camera.flyTo 只移动位置不改变比例尺，
      // 故先用 flyTo 定位，再叠加 zoomIn 实现"拉近"
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, TWO_D_CAM_HEIGHT),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
        duration: 0.7,
        complete: () => zoomTwoD(0.45)
      })
    }

    if (options?.buildPopupContent) {
      openFloatingPopup(p, target)
    }
  }

  function openFloatingPopup(p: MapDevicePoint, position: Cesium.Cartesian3) {
    floatingPosition = position
    devicePopupAnchor.value = { device: p, x: 0, y: 0 }
    updateFloatingPopupPosition()

    const v = viewer.value
    if (!v) return
    moveHandler?.()
    // 用 postRender 跟随相机，比 ArcGIS 的多个 reactive watch 更轻
    moveHandler = v.scene.postRender.addEventListener(() => updateFloatingPopupPosition())
  }

  function updateFloatingPopupPosition() {
    const v = viewer.value
    const anchor = devicePopupAnchor.value
    if (!v || !floatingPosition || !anchor) return
    const windowPos = Cesium.SceneTransforms.worldToWindowCoordinates(
      v.scene,
      floatingPosition,
      new Cesium.Cartesian2()
    )
    if (!windowPos) return
    devicePopupAnchor.value = { device: anchor.device, x: windowPos.x, y: windowPos.y }
  }

  function closeFloatingPopup() {
    devicePopupAnchor.value = null
    floatingPosition = null
    moveHandler?.()
    moveHandler = null
  }

  /* ==========================================================
   * 底图/维度切换
   * ========================================================== */

  function orthoAlphaNow(): number {
    return options?.getOrthophotoAlpha?.() ?? 0.72
  }

  function applyBasemapLayers(mode: 'satellite' | 'vector') {
    const v = viewer.value
    if (!v) return
    const alpha = orthoAlphaNow()
    const showBasemap = options?.getBasemapEnabled?.() ?? true
    v.imageryLayers.removeAll()
    orthoLayerRef = null
    if (showBasemap) {
      const layers = buildBasemapLayers(mode, 0)
      layers.forEach(l => v.imageryLayers.add(l))
    }
    const showOrtho =
      alpha > 0.02 &&
      (mode === 'satellite' || activeBasemapMode === 'reality' || !showBasemap)
    if (showOrtho) {
      orthoLayerRef = createLianghuOrthophotoLayer(alpha)
      const insertAt = showBasemap ? Math.min(1, v.imageryLayers.length) : 0
      v.imageryLayers.add(orthoLayerRef, insertAt)
    }
    syncUndergroundReveal(v)
  }

  function syncUndergroundReveal(v: Cesium.Viewer) {
    if (modelRoaming.state.active) return
    const alpha = orthoAlphaNow()
    const showContext = (options?.getBasemapEnabled?.() ?? true) || alpha > 0.02
    // 未显示底图时彻底隐藏地球，避免不透明的地球底色遮住地下 BIM。
    v.scene.globe.show = showContext
    const reveal = showContext && alpha < 0.62 && !isScene2D(v)
    v.scene.globe.translucency.enabled = reveal
    if (reveal) {
      v.scene.globe.translucency.frontFaceAlpha = Math.min(0.55, 0.08 + alpha * 0.55)
      v.scene.globe.translucency.backFaceAlpha = 0.04
    }
    v.scene.requestRender()
  }

  function applyRealityImagery(v: Cesium.Viewer) {
    applyBasemapLayers('satellite')
  }

  function setOrthophotoOpacity(alpha: number) {
    const v = viewer.value
    if (!v) return
    if (orthoLayerRef && !orthoLayerRef.isDestroyed()) {
      orthoLayerRef.alpha = Math.max(0, Math.min(1, alpha))
    } else {
      applyBasemapLayers(basemapTileMode)
      if (orthoLayerRef) orthoLayerRef.alpha = Math.max(0, Math.min(1, alpha))
    }
    applyTilesetStyles()
    syncUndergroundReveal(v)
    v.scene.requestRender()
  }

  function setBasemapEnabled(_enabled: boolean) {
    applyBasemapLayers(basemapTileMode)
  }

  function isScene2D(v: Cesium.Viewer): boolean {
    return v.scene.mode === Cesium.SceneMode.SCENE2D
  }

  function detachAllTunnelTilesets(v: Cesium.Viewer) {
    while (tunnelTilesets.length) {
      const ts = tunnelTilesets.pop()!
      v.scene.primitives.remove(ts)
      if (!ts.isDestroyed()) ts.destroy()
    }
    xrayRestoresMap.clear()
    tilesetsLoading = null
  }

  type TilesetRole = 'oblique' | 'bim' | 'partial'

  async function loadOneTileset(
    v: Cesium.Viewer,
    relativePath: string,
    maximumScreenSpaceError: number,
    role: TilesetRole
  ): Promise<Cesium.Cesium3DTileset | null> {
    const url = publicAssetUrl(relativePath)
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError })
      if (v.isDestroyed() || viewer.value !== v) { tileset.destroy(); return null }
      ;(tileset as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole = role
      v.scene.primitives.add(tileset)
      tunnelTilesets.push(tileset)
      return tileset
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[tunnel] tileset 加载失败:', relativePath, err)
      return null
    }
  }

  async function loadObliqueRoots(v: Cesium.Viewer, sse: number): Promise<number> {
    let ok = 0
    for (const path of OBLIQUE_TILESET_PATHS) {
      const ts = await loadOneTileset(v, path, sse, 'oblique')
      if (ts) ok++
    }
    return ok
  }

  function bimBrightnessFactor(): number {
    const b = options?.getBimBrightness?.() ?? 72
    return Math.max(0.35, Math.min(1.45, b / 70))
  }

  function obliqueAlphaNow(): number {
    const a = options?.getObliqueAlpha?.() ?? 0.35
    return Math.max(0, Math.min(1, a))
  }

  function bimOpacityNow(): number {
    const a = options?.getBimOpacity?.() ?? 1
    return Math.max(0, Math.min(1, a))
  }

  function partialOpacityNow(): number {
    const a = options?.getPartialOpacity?.() ?? 1
    return Math.max(0, Math.min(1, a))
  }

  function applyTilesetStyles(
    preset = getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering')
  ) {
    if (modelRoaming.state.active) return
    const brightness = bimBrightnessFactor()
    const partialXray = options?.getPartialXray?.() ?? false
    const bimAlpha = bimOpacityNow()
    tunnelTilesets.forEach(ts => {
      const role = (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole
      if (role === 'bim') {
        // 施工模型以克制的半透明材质作上下文，视觉主体回归真实 BIM。
        ts.style = new Cesium.Cesium3DTileStyle({ color: `color('#ffffff', ${bimAlpha.toFixed(2)})` })
      } else if (role === 'partial') {
        // 竣工模型：仅「原始 / X光」两态，无透明度滑杆
        const alpha = partialXray ? 0.42 : 1
        ts.style = new Cesium.Cesium3DTileStyle({
          color: `color('${preset.partialTint}', ${alpha.toFixed(2)})`
        })
      } else {
        const alpha = obliqueAlphaNow().toFixed(2)
        ts.style = new Cesium.Cesium3DTileStyle({
          color: `color('${preset.obliqueTint}', ${alpha})`
        })
      }
      if (role === 'bim' || role === 'partial') {
        // lightColor 必须是 Cartesian3（RGB），赋 Color 会在 HDR 下触发 model_lightColorHdr 非法；
        // 用中性白光提亮，材质染色交给 style.color，避免双重染色。
        // 施工透明 / 竣工 X光时额外提亮，保证透视下仍醒目。
        const boost =
          (role === 'bim' && bimAlpha < 0.999) || (role === 'partial' && partialXray) ? 0.5 : 0
        try {
          const s = 0.85 + brightness * 0.25 + boost * 0.35
          ts.lightColor = new Cesium.Cartesian3(s, s, s)
          const ibl = ts.imageBasedLighting
          if (ibl) {
            ibl.imageBasedLightingFactor = new Cesium.Cartesian2(
              Math.min(1.6, 0.85 + brightness * 0.15 + boost * 0.3),
              0.8
            )
          }
        } catch {
          /* older Cesium */
        }
      }
      ts.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT
      ts.colorBlendAmount = role === 'partial' ? 0.14 : 0.08
      if (role === 'partial') ts.maximumScreenSpaceError = Math.min(ts.maximumScreenSpaceError, 4)
    })
    syncXrayMode()
  }

  /** 透视模式：施工透明 / 竣工 X光 时关闭对应模型背面剔除，便于透视内部构造 */
  function syncXrayMode() {
    const partialXray = options?.getPartialXray?.() ?? false
    const bimAlpha = bimOpacityNow()
    const wantBim = bimAlpha < 0.999
    const wantPartial = partialXray
    tunnelTilesets.forEach(ts => {
      const role = (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole
      const want = role === 'bim' ? wantBim : role === 'partial' ? wantPartial : false
      if (want && !xrayRestoresMap.has(ts)) {
        xrayRestoresMap.set(ts, setTilesetBackFaceCulling(ts, false))
      } else if (!want && xrayRestoresMap.has(ts)) {
        const restore = xrayRestoresMap.get(ts)!
        try {
          restore()
        } catch {
          /* ignore */
        }
        xrayRestoresMap.delete(ts)
      }
    })
  }

  function setObliqueOpacity(alpha: number) {
    const v = viewer.value
    if (!v || v.isDestroyed()) return
    applyTilesetStyles()
    v.scene.requestRender()
  }

  function setBimOpacity(_alpha: number) {
    const v = viewer.value
    if (!v || v.isDestroyed()) return
    applyTilesetStyles()
    v.scene.requestRender()
  }

  function setPartialOpacity(_alpha: number) {
    const v = viewer.value
    if (!v || v.isDestroyed()) return
    applyTilesetStyles()
    v.scene.requestRender()
  }

  /** 竣工模型 X光 切换：原始 / X光 两态 */
  function setPartialXray(_on: boolean) {
    const v = viewer.value
    if (!v || v.isDestroyed()) return
    applyTilesetStyles()
    v.scene.requestRender()
  }

  function setBimBrightness(_value: number) {
    const v = viewer.value
    if (!v || v.isDestroyed() || modelRoaming.state.active) return
    applyTilesetStyles()
    applyEnvironmentState(v, getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering'))
    v.scene.requestRender()
  }

  function setFullTunnelVisible(show: boolean) {
    const v = viewer.value
    if (!v || isScene2D(v)) return
    void (async () => {
      const existing = getBimTileset()
      if (show) {
        if (!existing) {
          const preset = getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering')
          await loadOneTileset(v, BIM_TILESET_PATH, preset.bimSse, 'bim')
        } else {
          existing.show = true
        }
        applyTilesetStyles()
      } else if (existing) {
        existing.show = false
      }
      v.scene.requestRender()
    })()
  }

  function getBimTileset(): Cesium.Cesium3DTileset | null {
    return (
      tunnelTilesets.find(ts => (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole === 'bim') ??
      null
    )
  }

  function getPartialTileset(): Cesium.Cesium3DTileset | null {
    return (
      tunnelTilesets.find(ts => (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole === 'partial') ??
      null
    )
  }

  /** 构件拾取优先竣工模型，确保能检视设备。 */
  function getInteriorTileset(): Cesium.Cesium3DTileset | null {
    return getPartialTileset() ?? getBimTileset()
  }

  /** 局部竣工显隐：优先 show 切换，避免重载完整施工模型 */
  async function setPartialTunnelVisible(show: boolean) {
    const v = viewer.value
    if (!v || isScene2D(v)) return
    const existing = getPartialTileset()
    if (show) {
      if (!existing) {
        const preset = getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering')
        await loadOneTileset(v, PARTIAL_TUNNEL_TILESET_PATH, preset.partialSse, 'partial')
      } else {
        existing.show = true
      }
      applyTilesetStyles()
    } else if (existing) {
      existing.show = false
    }
    v.scene.requestRender()
  }

  function applyVisualEnvironment(v: Cesium.Viewer) {
    const preset = getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering')
    applyEnvironmentState(v, preset)
    applyTilesetStyles(preset)
    syncUndergroundReveal(v)
    v.scene.requestRender()
  }

  /** 应用「场景全局环境」：背景 / 昼夜 / 雾效 / 光照强度 / bloom 氛围 */
  function applyEnvironmentState(v: Cesium.Viewer, preset: SceneVisualPreset) {
    const env = getSceneEnvironment(activeEnvironmentId)

    v.scene.backgroundColor = Cesium.Color.fromCssColorString(env.background)
    v.scene.globe.baseColor = Cesium.Color.fromCssColorString(env.globeBase)
    v.scene.sun.show = env.sun
    v.scene.moon.show = env.moon
    v.scene.skyBox.show = false
    v.scene.globe.showGroundAtmosphere = false
    v.scene.globe.enableLighting = env.id !== 'default'
    v.scene.fog.enabled = env.fog
    if (env.fog) {
      v.scene.fog.density = env.fogDensity
      v.scene.fog.screenSpaceErrorFactor = 2
    }
    // 局部 ENU 方向光 + 中性环境光，保留设备原始材质与结构明暗。
    const sphere = combinedTilesetSphere()
    const direction = sphere
      ? Cesium.Matrix4.multiplyByPointAsVector(Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center), new Cesium.Cartesian3(-0.35, 0.25, -0.9), new Cesium.Cartesian3())
      : new Cesium.Cartesian3(0.35, -0.45, -0.82)
    v.scene.light = new Cesium.DirectionalLight({
      direction: Cesium.Cartesian3.normalize(direction, direction),
      intensity: 1.65 * preset.ambientBoost * env.lightFactor * bimBrightnessFactor()
    })
    v.scene.highDynamicRange = true
    v.scene.postProcessStages.tonemapper = Cesium.Tonemapper.ACES
    v.scene.postProcessStages.exposure = env.id === 'day' ? 1.05 : 1.12
    const bloom = v.scene.postProcessStages.bloom
    bloom.enabled = preset.bloom
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = 64
    bloom.uniforms.brightness = -0.3
    bloom.uniforms.delta = 0.7
    bloom.uniforms.sigma = 1.4
    bloom.uniforms.stepSize = 0.5
  }

  function setSceneEnvironment(id: SceneEnvironmentId) {
    activeEnvironmentId = id
    const v = viewer.value
    if (!v || v.isDestroyed() || isScene2D(v) || modelRoaming.state.active) return
    const preset = getSceneVisualPreset(options?.getVisualPresetId?.() ?? 'engineering')
    applyEnvironmentState(v, preset)
    applyTilesetStyles(preset)
    v.scene.requestRender()
  }

  async function ensureTunnelTilesets(v: Cesium.Viewer, force = false): Promise<void> {
    const presetId = options?.getVisualPresetId?.() ?? 'engineering'
    const preset = getSceneVisualPreset(presetId)
    if (!force && tunnelTilesets.length && loadedPresetId === presetId) return
    if (tilesetsLoading) {
      await tilesetsLoading
      return
    }
    tilesetsLoading = (async () => {
      try {
        detachAllTunnelTilesets(v)
        loadedPresetId = presetId
        let obliqueCount = 0
        if (preset.loadOblique) {
          obliqueCount = await loadObliqueRoots(v, preset.obliqueSse)
          if (obliqueCount === 0) {
            console.warn('[tunnel] 倾斜 tileset 未加载，请检查 public/三维数据/两湖倾斜/*/tileset.json')
          }
        }
        if (preset.loadBim && (options?.getShowFullTunnel?.() ?? true)) {
          await loadOneTileset(v, BIM_TILESET_PATH, preset.bimSse, 'bim')
        }
        if (
          preset.loadPartial &&
          (options?.getShowPartialTunnel?.() ?? true)
        ) {
          await loadOneTileset(v, PARTIAL_TUNNEL_TILESET_PATH, preset.partialSse, 'partial')
        }
        if (v.isDestroyed() || viewer.value !== v) return
        v.scene.globe.depthTestAgainstTerrain = true
        applyVisualEnvironment(v)
        try {
          setBimBrightness(options?.getBimBrightness?.() ?? 72)
        } catch (err) {
          console.warn('[tunnel] setBimBrightness 失败', err)
        }
        v.scene.requestRender()
      } catch (err) {
        console.warn('[tunnel] ensureTunnelTilesets 失败', err)
      } finally {
        tilesetsLoading = null
      }
    })()
    await tilesetsLoading
  }

  async function setVisualPreset(_id: SceneVisualPresetId) {
    const v = viewer.value
    if (!v || isScene2D(v)) return
    tilesetsLoading = null
    loadedPresetId = null
    await ensureTunnelTilesets(v, true)
    applyPresentationMode()
  }

  function combinedTilesetSphere(): Cesium.BoundingSphere | null {
    if (!tunnelTilesets.length) return null
    // 优先以隧道 BIM / 局部竣工为主体包围球，倾斜摄影不主导取景
    const primary = tunnelTilesets.filter(ts => {
      const role = (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole
      return ts.show && (role === 'bim' || role === 'partial')
    })
    const list = primary.length ? primary : tunnelTilesets
    let out = Cesium.BoundingSphere.clone(list[0].boundingSphere, new Cesium.BoundingSphere())
    for (let i = 1; i < list.length; i++) {
      Cesium.BoundingSphere.union(out, list[i].boundingSphere, out)
    }
    return out
  }

  async function flyToTilesetFocus(v: Cesium.Viewer, duration = 0.8) {
    // 默认聚焦带真实设备的竣工段；完整施工模型仍作为空间上下文保留。
    const partial = getPartialTileset()
    const sphere = partial?.show ? partial.boundingSphere : combinedTilesetSphere()
    if (sphere) {
      await v.camera.flyToBoundingSphere(sphere, {
        duration,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(-25),
          Cesium.Math.toRadians(-32),
          Math.max(sphere.radius * 2.0, 40)
        )
      })
      return
    }
    await resetMapView(duration)
  }

  /** 二维才挂载矢量线；三维永不创建，避免与三维模型叠加 */
  function ensureRouteEntitiesFor2d(v: Cesium.Viewer) {
    if (routeEntities.length) return
    routeEntities = buildStaticRoute()
    routeEntities.forEach(e => v.entities.add(e))
    const built = buildFlowEntities()
    flowEntities = built.flow
    arrowEntities = built.arrows
    ;[...flowEntities, ...arrowEntities].forEach(e => v.entities.add(e))
  }

  function applyPresentationMode() {
    const v = viewer.value
    if (!v) return
    const is2d = isScene2D(v)
    if (is2d) ensureRouteEntitiesFor2d(v)
    else {
      // 三维强制隐藏（即使历史 HMR 残留）
      setEntityVisible(routeEntities, false)
      setEntityVisible(flowEntities, false)
      setEntityVisible(arrowEntities, false)
      stopFlowLoop()
    }
    const showRoute = is2d && routeLayerUserVisible
    const showFlow = is2d && flowLayerUserVisible && flowEnabled
    if (is2d) {
      setEntityVisible(routeEntities, showRoute)
      setEntityVisible(flowEntities, showFlow)
      setEntityVisible(arrowEntities, showFlow)
      if (showFlow) startFlowLoop()
      else stopFlowLoop()
    }

    tunnelTilesets.forEach(ts => {
      const role = (ts as unknown as { __tunnelRole?: TilesetRole }).__tunnelRole
      ts.show = !is2d && (role === 'bim' ? (options?.getShowFullTunnel?.() ?? true) : role === 'partial' ? (options?.getShowPartialTunnel?.() ?? true) : true)
    })
    if (!is2d && tunnelTilesets.length === 0) {
      void ensureTunnelTilesets(v).then(() => {
        tunnelTilesets.forEach(ts => {
          ts.show = true
        })
        applyVisualEnvironment(v)
        v.scene.requestRender()
      })
    }
    v.scene.requestRender()
  }

  async function applyViewMode(mode: MapViewMode) {
    const v = viewer.value
    if (!v || v.isDestroyed()) return
    v.camera.cancelFlight()
    if (v.scene.mode === Cesium.SceneMode.MORPHING) v.scene.completeMorph()
    const target = mode === '3d' ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.SCENE2D
    if (v.scene.mode === target) return
    // 使用公开的零时长投影切换，让 Cesium 同步重建正确视锥；
    // 再平滑定位局部场景，避免地下 BIM 先飞到全球尺度，也避免快速切换竞态。
    if (mode === '3d') v.scene.morphTo3D(0)
    else v.scene.morphTo2D(0)
    if (v.isDestroyed() || viewer.value !== v || viewMode.value !== mode) return
    applyPresentationMode()
    syncUndergroundReveal(v)
    await resetMapView(motionQuery.matches ? 0 : 0.6)
  }

  function clearFeatureHighlight() {
    if (selectedFeature) {
      try {
        selectedFeature.feature.color = selectedFeature.color
      } catch {
        /* tileset may have reloaded */
      }
      selectedFeature = null
    }
  }

  function highlightTilesetPick(feature: Cesium.Cesium3DTileFeature) {
    clearFeatureHighlight()
    selectedFeature = { feature, color: Cesium.Color.clone(feature.color) }
    // 点击高亮：亮青描边感，突出选中构件
    feature.color = Cesium.Color.fromCssColorString('#a5f3fc').withAlpha(1.0)
  }

  function emitModelPickInfo(
    feature: Cesium.Cesium3DTileFeature | undefined,
    tileset: Cesium.Cesium3DTileset | undefined,
    worldPos?: Cesium.Cartesian3,
    screen?: { x: number; y: number }
  ) {
    if (!feature && !tileset) {
      options?.onModelSelect?.(null)
      return
    }
    const role = (tileset as unknown as { __tunnelRole?: TilesetRole } | undefined)?.__tunnelRole ?? 'unknown'
    const properties: Record<string, string> = {}
    if (feature) {
      const feat = feature as Cesium.Cesium3DTileFeature & {
        getPropertyIds?: () => string[]
        getPropertyNames?: () => string[]
      }
      const names = feat.getPropertyIds?.() ?? feat.getPropertyNames?.() ?? []
      for (const name of names) {
        const val = feature.getProperty(name)
        if (val == null || val === '') continue
        properties[String(name)] = String(val)
      }
    }
    if (worldPos) {
      const c = Cesium.Cartographic.fromCartesian(worldPos)
      properties['经度'] = Cesium.Math.toDegrees(c.longitude).toFixed(6)
      properties['纬度'] = Cesium.Math.toDegrees(c.latitude).toFixed(6)
      properties['高程(m)'] = c.height.toFixed(2)
    }
    const featureName = feature?.getProperty('name') ?? feature?.getProperty('名称')
    const title = featureName ? String(featureName) :
      role === 'bim'
        ? '完整施工模型'
        : role === 'partial'
          ? '局部竣工模型'
          : role === 'oblique'
            ? '倾斜摄影'
            : '三维构件'
    if (!Object.keys(properties).length) {
      properties['模型'] = title
      properties['类型'] = role
      properties['说明'] = '当前瓦片未写入业务属性，已展示空间定位信息'
    }
    options?.onModelSelect?.({
      title,
      role,
      properties,
      screenX: screen?.x,
      screenY: screen?.y
    })
  }

  /* ==========================================================
   * 图层开关
   * ========================================================== */

  function setEntityVisible(list: Cesium.Entity[], visible: boolean) {
    list.forEach(e => {
      e.show = visible
    })
  }

  function setRouteLayerVisible(visible: boolean) {
    routeLayerUserVisible = visible
    applyPresentationMode()
  }

  function setFlowAnimationEnabled(enabled: boolean) {
    flowLayerUserVisible = enabled
    flowEnabled = enabled
    applyPresentationMode()
  }

  function setDeviceLayerVisible(visible: boolean) {
    setEntityVisible(deviceEntities, visible)
  }

  function closeScenePopup() {
    focusedDeviceId = null
    clearFeatureHighlight()
    options?.onModelSelect?.(null)
    syncDeviceGraphics()
    closeFloatingPopup()
    // 先清锚点再回调，避免 UI watch 竞态把弹窗又挂回去
    devicePopupAnchor.value = null
    floatingPosition = null
    moveHandler?.()
    moveHandler = null
    options?.onPopupClosed?.()
  }

  /* ==========================================================
   * 生命周期
   * ========================================================== */

  /** 记录每个 Viewer 的点击处理器，销毁时一并清理（用 WeakMap 避免污染 Cesium 类型） */
  const clickHandlers = new WeakMap<Cesium.Viewer, Cesium.ScreenSpaceEventHandler>()

  function bindClick(v: Cesium.Viewer) {
    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas)
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      // drillPick 由近到远；取「最近」的设备或构件，禁止落到最底层
      const candidates = v.scene.drillPick(movement.position, modelRoaming.state.active ? 32 : 8)
      let deviceId: string | undefined
      let tileFeature: Cesium.Cesium3DTileFeature | undefined
      let structuralFeature: Cesium.Cesium3DTileFeature | undefined
      for (const c of candidates) {
        const id = (c.id as unknown as { __deviceId?: string } | undefined)?.__deviceId
        if (id) {
          deviceId = id
          break
        }
        if (c instanceof Cesium.Cesium3DTileFeature) {
          const isEquipment = modelRoaming.equipment.value.some(e => e.id === String(c.getProperty('id') ?? ''))
          if (!modelRoaming.state.active || isEquipment) { tileFeature = c; break }
          structuralFeature ??= c
        }
      }
      if (deviceId) {
        const p = getDevices().find(d => d.id === deviceId)
        if (p) void focusDevice(p)
        return
      }
      tileFeature ??= structuralFeature
      const pickedTileset = tileFeature
        ? (tileFeature.tileset as Cesium.Cesium3DTileset | undefined)
        : undefined
      if (tileFeature || pickedTileset) {
        if (modelRoaming.state.active && tileFeature) modelRoaming.selectPickedEquipment(String(tileFeature.getProperty('id') ?? ''))
        if (tileFeature) highlightTilesetPick(tileFeature)
        const equipment = tileFeature ? modelRoaming.equipment.value.find(e => e.id === String(tileFeature!.getProperty('id') ?? '')) : undefined
        const pos = (equipment ? new Cesium.Cartesian3(...equipment.center) : undefined) ||
          (v.scene.pickPositionSupported ? v.scene.pickPosition(movement.position) : undefined) ||
          (() => {
            const bs = getInteriorTileset()?.boundingSphere
            return bs ? bs.center : undefined
          })()
        // 相对场景容器的像素，供属性面板就近锚定
        const canvas = v.scene.canvas
        const root = containerRef.value
        const canvasRect = canvas.getBoundingClientRect()
        const rootRect = root?.getBoundingClientRect()
        const sx = rootRect
          ? movement.position.x + (canvasRect.left - rootRect.left)
          : movement.position.x
        const sy = rootRect
          ? movement.position.y + (canvasRect.top - rootRect.top)
          : movement.position.y
        emitModelPickInfo(tileFeature, pickedTileset ?? getInteriorTileset() ?? undefined, pos, {
          x: sx,
          y: sy
        })
        if (pos) {
          clickPulseDispose?.()
          const tone =
            (pickedTileset as unknown as { __tunnelRole?: TilesetRole } | undefined)?.__tunnelRole ===
            'partial'
              ? '#fb923c'
              : '#67e8f9'
          clickPulseDispose = spawnClickPulse(v, pos, tone)
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    clickHandlers.set(v, handler)
  }

  async function mount(mode: BasemapMode, initialViewMode: MapViewMode = '3d') {
    if (!containerRef.value) return
    await destroy()
    const version = lifecycleVersion

    const isReality = mode === 'reality'
    activeBasemapMode = mode
    // 以调用方传入的模式为准（它已反映用户当前选择），避免覆盖用户在等待期间的切换
    viewMode.value = initialViewMode === '2d' ? '2d' : '3d'
    basemapTileMode = mode === 'vector' ? 'vector' : 'satellite'
    const route = await loadTunnelRoute()
    if (version !== lifecycleVersion || !containerRef.value) return
    routeData.value = route
    activeEnvironmentId = options?.getSceneEnvironmentId?.() ?? 'default'

    // 版权容器：天地图/高德要求保留署名，低调显示在容器左下角
    const creditHost = document.createElement('div')
    creditHost.className = 'tunnel-cesium-credit'
    containerRef.value.appendChild(creditHost)

    const v = new Cesium.Viewer(containerRef.value, {
      // 不添加默认 Ion 底图，改为下面手动接入天地图/高德，避免多余请求与 token 报错
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
      requestRenderMode: false,
      creditContainer: creditHost,
      contextOptions: {
        webgl: { alpha: false, antialias: true }
      }
    })

    // 深蓝工程展示底色；不再绘制模型包围盒或发光线框。
    v.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a1a38')
    v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0c2248')
    v.scene.skyBox.show = false
    v.scene.sun.show = false
    v.scene.moon.show = false
    v.scene.fog.enabled = false
    v.scene.globe.showGroundAtmosphere = false
    v.scene.globe.depthTestAgainstTerrain = false
    // 不再钳制近景/远景；关闭地形和模型碰撞才能穿入地下构件。
    v.scene.screenSpaceCameraController.minimumZoomDistance = 0
    v.scene.screenSpaceCameraController.maximumZoomDistance = Number.POSITIVE_INFINITY
    v.scene.screenSpaceCameraController.enableCollisionDetection = false
    v.scene.highDynamicRange = true
    v.scene.msaaSamples = 4
    v.scene.postProcessStages.fxaa.enabled = true
    v.useBrowserRecommendedResolution = false
    v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5) / (window.devicePixelRatio || 1)
    v.targetFrameRate = 45
    const ao = v.scene.postProcessStages.ambientOcclusion
    ao.enabled = Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(v.scene)
    ao.uniforms.intensity = 1.2
    ao.uniforms.lengthCap = 0.12
    ao.uniforms.stepSize = 1.0
    ao.uniforms.blurStepSize = 1.0

    viewer.value = v

    // 应用底图（含两湖正射 TMS，透明度由 UI 控制）
    if (isReality) applyRealityImagery(v)
    else applyBasemapLayers(basemapTileMode)
    applyVisualEnvironment(v)

    // 矢量隧道路线：仅二维模式使用；三维完全不挂载，杜绝「走矢量线」误用
    routeEntities = []
    flowEntities = []
    arrowEntities = []
    if (initialViewMode === '2d') {
      routeEntities = buildStaticRoute()
      routeEntities.forEach(e => v.entities.add(e))
      const built = buildFlowEntities()
      flowEntities = built.flow
      arrowEntities = built.arrows
      ;[...flowEntities, ...arrowEntities].forEach(e => v.entities.add(e))
    }

    bindClick(v)

    // 初始维度
    if (initialViewMode === '2d') v.scene.morphTo2D(0)

    syncDeviceGraphics()
    applyPresentationMode()
    try {
      if (initialViewMode !== '2d') {
        await ensureTunnelTilesets(v)
        if (version !== lifecycleVersion || v.isDestroyed() || viewer.value !== v) return
        applyPresentationMode()
        await flyToTilesetFocus(v, 0)
      } else {
        await resetMapView(0)
      }

      // 竞态保护：仅当 mount 期间用户确实主动切换过维度时才补应用。
      // 用 userSwitched 标记而非比较 viewMode，避免把初始化自身的赋值误判为用户操作。
      if (userSwitchedDuringMount) {
        userSwitchedDuringMount = false
        await applyViewMode(viewMode.value)
      }
    } catch (err) {
      console.warn('[tunnel] mount 后期初始化失败，界面仍可用', err)
    }

    if (version !== lifecycleVersion || v.isDestroyed() || viewer.value !== v) return

    // 开发期调试钩子：便于在控制台检查相机/图层状态
    if (import.meta.env.DEV) {
      ;(window as unknown as { __tunnelCesium?: unknown }).__tunnelCesium = {
        viewer: v,
        routeEntities,
        flowEntities,
        arrowEntities,
        deviceEntities,
        modelRoaming,
        setViewMode
      }
    }

    ready.value = true
  }

  async function setViewMode(mode: MapViewMode) {
    if (modelRoaming.state.active || modelRoaming.state.loading) modelRoaming.stop(false)
    viewMode.value = mode
    const v = viewer.value
    // viewer 尚未就绪时只记录意图，mount 完成后会依据标记补应用，
    // 否则会静默丢弃用户操作（表现为点了没反应）
    if (!v || !containerRef.value) {
      userSwitchedDuringMount = true
      return
    }
    // 以场景真实状态判断，避免重复 morph
    const target = mode === '3d' ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.SCENE2D
    if (v.scene.mode === target) return
    const seq = ++viewSwitchSeq
    await applyViewMode(mode)
    if (seq !== viewSwitchSeq) return
  }

  async function setBasemap(mode: BasemapMode) {
    activeBasemapMode = mode
    basemapTileMode = mode === 'vector' ? 'vector' : 'satellite'
    if (!viewer.value) {
      await mount(mode, viewMode.value)
      return
    }
    const v = viewer.value
    if (mode === 'reality') applyRealityImagery(v)
    else applyBasemapLayers(basemapTileMode)
    applyPresentationMode()
    if (!isScene2D(v)) await flyToTilesetFocus(v, 0.5)
  }

  function startFlowLoop() {
    if (flowRunning || !flowEnabled) return
    flowRunning = true
    const tick = () => {
      if (!flowRunning) return
      const v = viewer.value
      if (!v || v.isDestroyed()) return
      flowPhase = (flowPhase + FLOW_PHASE_STEP) % 1
      // CallbackProperty 会在下一帧自动拉取新位置，此处无需手动重建 Entity
      v.scene.requestRender()
      flowRaf = requestAnimationFrame(tick)
    }
    flowRaf = requestAnimationFrame(tick)
  }

  function stopFlowLoop() {
    flowRunning = false
    cancelAnimationFrame(flowRaf)
  }

  async function destroy() {
    lifecycleVersion++
    ready.value = false
    focusedDeviceId = null
    activeEnvironmentId = 'default'
    stopFlowLoop()
    modelRoaming.stop(false)
    // 还原所有 X光 背面剔除
    xrayRestoresMap.forEach(restore => {
      try {
        restore()
      } catch {
        /* ignore */
      }
    })
    xrayRestoresMap.clear()
    clearFeatureHighlight()
    clickPulseDispose?.()
    clickPulseDispose = null
    moveHandler?.()
    moveHandler = null
    closeFloatingPopup()
    routeEntities = []
    flowEntities = []
    arrowEntities = []
    deviceEntities = []
    routeData.value = null

    const v = viewer.value
    viewer.value = null
    if (v && !v.isDestroyed()) {
      if (v.scene.mode === Cesium.SceneMode.MORPHING) v.scene.completeMorph()
      detachAllTunnelTilesets(v)
      clickHandlers.get(v)?.destroy()
      clickHandlers.delete(v)
      v.destroy()
    }
    activeBasemapMode = 'satellite'
    // Viewer.destroy() 会移除自身 DOM，这里再兜底清空以确保干净
    containerRef.value?.replaceChildren()
  }

  onBeforeUnmount(() => {
    void destroy()
  })

  return {
    ready,
    viewMode,
    mount,
    setBasemap,
    setViewMode,
    setBasemapEnabled,
    setPartialTunnelVisible,
    setFullTunnelVisible,
    setBimBrightness,
    setRouteLayerVisible,
    setFlowAnimationEnabled,
    setDeviceLayerVisible,
    syncDeviceGraphics,
    setVisualPreset,
    setOrthophotoOpacity,
    setObliqueOpacity,
    setBimOpacity,
    setPartialOpacity,
    setPartialXray,
    roaming: modelRoaming.state,
    roamEquipment: modelRoaming.equipment,
    startRoaming: modelRoaming.start,
    stopRoaming: modelRoaming.stop,
    toggleRoamingPlayback: modelRoaming.togglePlay,
    seekRoaming: modelRoaming.seek,
    reverseRoaming: modelRoaming.reverse,
    setRoamingLayer: modelRoaming.setLayer,
    setRoamingEyeHeight: modelRoaming.setEyeHeight,
    setRoamingLateralOffset: modelRoaming.setLateralOffset,
    setRoamingDimStructure: modelRoaming.setDimStructure,
    inspectRoamingEquipment: modelRoaming.inspectEquipment,
    focusDeviceById: (id: string) => {
      if (modelRoaming.state.active) modelRoaming.stop(false)
      const point = getDevices().find(p => p.id === id)
      if (point) void focusDevice(point)
    },
    setSceneEnvironment,
    resetMapView,
    destroy,
    closeScenePopup,
    devicePopupAnchor
  }
}