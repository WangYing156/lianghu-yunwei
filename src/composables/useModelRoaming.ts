import { reactive, shallowRef } from 'vue'
import * as Cesium from 'cesium'
import { PARTIAL_ROAMING_ROUTES } from '../config/partialRoamingRoutes'
import { parseModelEquipment, type ModelEquipment } from '../utils/modelEquipment'
import {
  advanceRoamingProgress,
  clamp01,
  createRoamingPath,
  nearestRoamingProgress,
  sampleRoamingPath,
  type Point3,
  type RoamingPath,
} from '../utils/roamingPath'
import type { RoamingState } from '../types/roaming'

interface RoamingOptions {
  getViewer: () => Cesium.Viewer | null
  prepare: () => Promise<Cesium.Cesium3DTileset | null>
  getTilesets: () => Cesium.Cesium3DTileset[]
  onEnter: () => void
  onExit: () => void
  onEquipment: (equipment: ModelEquipment | null) => void
}

/** 路径驱动的模型检视，不接管 WASD；路线来自竣工模型真实双层路面。 */
export function useModelRoaming(options: RoamingOptions) {
  const state = reactive<RoamingState>({
    active: false,
    loading: false,
    playing: false,
    progress: 0.04,
    speed: 2,
    direction: 1,
    layer: 'lower',
    eyeHeight: 1.8,
    lateralOffset: 0,
    length: 0,
    dimStructure: false,
    selectedEquipmentId: '',
    error: '',
  })
  const equipment = shallowRef<ModelEquipment[]>([])
  const paths = new Map<string, RoamingPath>()
  let partial: Cesium.Cesium3DTileset | null = null
  let up = new Cesium.Cartesian3()
  let sequence = 0
  let abort: AbortController | null = null
  let restoreScene: ((restoreCamera: boolean) => void) | null = null
  let removeTick: (() => void) | null = null
  let removeInputs: (() => void) | null = null
  let lastTime = 0

  const viewer = () => {
    const v = options.getViewer()
    return v && !v.isDestroyed() ? v : null
  }
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const point3 = (p: Point3) => new Cesium.Cartesian3(...p)
  const asTuple = (p: Cesium.Cartesian3): Point3 => [p.x, p.y, p.z]

  function viewAt(progress = state.progress) {
    const path = paths.get(state.layer)!
    const { point, tangent } = sampleRoamingPath(path, progress)
    const direction = Cesium.Cartesian3.multiplyByScalar(
      point3(tangent),
      state.direction,
      new Cesium.Cartesian3(),
    )
    const side = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    const destination = Cesium.Cartesian3.add(
      point3(point),
      Cesium.Cartesian3.multiplyByScalar(up, state.eyeHeight, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    Cesium.Cartesian3.add(
      destination,
      Cesium.Cartesian3.multiplyByScalar(side, state.lateralOffset, new Cesium.Cartesian3()),
      destination,
    )
    return { destination, orientation: { direction, up } }
  }

  function flyTo(view: ReturnType<typeof viewAt>, duration = 0.9): Promise<boolean> {
    const v = viewer()
    if (!v) return Promise.resolve(false)
    v.camera.cancelFlight()
    if (reducedMotion() || duration === 0) {
      v.camera.setView(view)
      return Promise.resolve(true)
    }
    // Cesium.Camera.flyTo 返回 void；必须等待 complete/cancel，不能 await 一个 void。
    return new Promise((resolve) => {
      v.camera.flyTo({
        ...view,
        duration,
        complete: () => resolve(true),
        cancel: () => resolve(false),
      })
      v.scene.requestRender()
    })
  }

  function updateStyle() {
    if (!partial || partial.isDestroyed() || !state.active) return
    const idExpression =
      equipment.value.map((e) => `\${id} === ${JSON.stringify(e.id)}`).join(' || ') || 'false'
    partial.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          [`\${id} === ${JSON.stringify(state.selectedEquipmentId)}`, "color('#ffd5a1', 1.0)"],
          [idExpression, "color('#ffffff', 1.0)"],
          ['true', state.dimStructure ? "color('#a6bacb', 0.025)" : "color('#ffffff', 1.0)"],
        ],
      },
    })
    viewer()?.scene.requestRender()
  }

  function pause() {
    state.playing = false
    lastTime = 0
  }

  async function start() {
    if (state.loading || state.active) return
    const v = viewer()
    if (!v || v.scene.mode !== Cesium.SceneMode.SCENE3D) {
      state.error = '请先切换到三维视图，再进入模型内部。'
      return
    }
    const current = ++sequence
    state.loading = true
    state.error = ''
    abort = new AbortController()
    try {
      const ts = await options.prepare()
      if (current !== sequence || !viewer()) return
      if (!ts || ts.isDestroyed()) throw new Error('竣工模型未能加载，请检查模型资源后重试。')
      const base = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${base}三维数据/局部隧道竣工模型/scenetree.json`, {
        signal: abort.signal,
      })
      if (!response.ok) throw new Error('竣工模型设备目录加载失败，请检查 scenetree.json。')
      const catalog = parseModelEquipment(await response.json())
      if (current !== sequence || !viewer()) return
      if (!catalog.length) throw new Error('竣工模型中没有可定位的设备构件。')
      partial = ts
      // scenetree 的包围球是原始 ECEF 坐标，叠加运行时 modelMatrix 以匹配模型平移。
      equipment.value = catalog.map((e) => ({
        ...e,
        center: asTuple(
          Cesium.Matrix4.multiplyByPoint(ts.modelMatrix, point3(e.center), new Cesium.Cartesian3()),
        ) as [number, number, number],
      }))
      const transform = ts.root.computedTransform
      up = Cesium.Cartesian3.normalize(
        Cesium.Matrix4.multiplyByPointAsVector(
          transform,
          Cesium.Cartesian3.UNIT_Z,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      )
      paths.clear()
      PARTIAL_ROAMING_ROUTES.forEach((route) =>
        paths.set(
          route.id,
          createRoamingPath(
            route.points.map((p) =>
              asTuple(
                Cesium.Matrix4.multiplyByPoint(transform, point3(p), new Cesium.Cartesian3()),
              ),
            ),
          ),
        ),
      )
      state.length = paths.get(state.layer)!.length
      state.progress = 0.04
      state.selectedEquipmentId = ''
      state.dimStructure = false

      const camera = v.camera
      const savedView = {
        destination: Cesium.Cartesian3.clone(camera.positionWC),
        orientation: {
          direction: Cesium.Cartesian3.clone(camera.directionWC),
          up: Cesium.Cartesian3.clone(camera.upWC),
        },
      }
      const near = camera.frustum.near
      const controller = v.scene.screenSpaceCameraController
      const controls = {
        enableRotate: controller.enableRotate,
        enableTranslate: controller.enableTranslate,
        enableTilt: controller.enableTilt,
        enableLook: controller.enableLook,
        lookEventTypes: controller.lookEventTypes,
        inertiaSpin: controller.inertiaSpin,
      }
      const globeShown = v.scene.globe.show
      const atmosphereShown = v.scene.skyAtmosphere?.show
      const fog = v.scene.fog.enabled
      const light = v.scene.light
      const tilesets = options.getTilesets().map((t) => ({ t, show: t.show }))
      const previous = {
        style: ts.style,
        culling: ts.backFaceCulling,
        sse: ts.maximumScreenSpaceError,
        blend: ts.colorBlendMode,
        blendAmount: ts.colorBlendAmount,
      }
      restoreScene = (restoreCamera) => {
        if (v.isDestroyed()) return
        Object.assign(controller, controls)
        camera.frustum.near = near
        v.scene.globe.show = globeShown
        if (v.scene.skyAtmosphere && atmosphereShown !== undefined)
          v.scene.skyAtmosphere.show = atmosphereShown
        v.scene.fog.enabled = fog
        v.scene.light = light
        tilesets.forEach(({ t, show }) => {
          if (!t.isDestroyed()) t.show = show
        })
        if (!ts.isDestroyed()) {
          ts.style = previous.style
          ts.backFaceCulling = previous.culling
          ts.maximumScreenSpaceError = previous.sse
          ts.colorBlendMode = previous.blend
          ts.colorBlendAmount = previous.blendAmount
        }
        if (restoreCamera) camera.flyTo({ ...savedView, duration: reducedMotion() ? 0 : 0.8 })
      }
      state.active = true
      options.onEnter()
      tilesets.forEach(({ t }) => {
        t.show = t === ts
      })
      ts.show = true
      ts.backFaceCulling = false
      ts.maximumScreenSpaceError = 1.5
      ts.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT
      ts.colorBlendAmount = 0.35
      v.scene.globe.show = false
      if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = false
      v.scene.fog.enabled = false
      camera.frustum.near = 0.05
      controller.enableRotate = false
      controller.enableTranslate = false
      controller.enableTilt = false
      controller.enableLook = true
      controller.inertiaSpin = 0
      controller.lookEventTypes = Cesium.CameraEventType.LEFT_DRAG
      updateStyle()
      const headlight = new Cesium.DirectionalLight({
        direction: Cesium.Cartesian3.clone(camera.directionWC),
        intensity: 2.0,
      })
      v.scene.light = headlight
      removeTick = v.scene.preUpdate.addEventListener(() => {
        const now = performance.now()
        if (state.playing && !state.loading && !document.hidden) {
          const dt = lastTime ? (now - lastTime) / 1000 : 0
          state.progress = advanceRoamingProgress(
            state.progress,
            dt,
            state.speed,
            state.length,
            state.direction,
          )
          camera.setView(viewAt())
          if (state.progress === 0 || state.progress === 1) pause()
        }
        lastTime = now
        Cesium.Cartesian3.clone(camera.directionWC, headlight.direction)
      })
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') stop()
      }
      const onVisibility = () => {
        if (document.hidden) pause()
      }
      const onPointer = () => {
        if (!state.loading) pause()
      }
      v.canvas.addEventListener('pointerdown', onPointer)
      v.canvas.addEventListener('wheel', onPointer, { passive: true })
      window.addEventListener('keydown', onKey)
      document.addEventListener('visibilitychange', onVisibility)
      removeInputs = () => {
        v.canvas.removeEventListener('pointerdown', onPointer)
        v.canvas.removeEventListener('wheel', onPointer)
        window.removeEventListener('keydown', onKey)
        document.removeEventListener('visibilitychange', onVisibility)
      }
      const arrived = await flyTo(viewAt(), 1.2)
      if (current !== sequence) return
      state.playing = arrived && !reducedMotion()
    } catch (error) {
      if (current !== sequence || (error as Error).name === 'AbortError') return
      stop(false)
      state.error = error instanceof Error ? error.message : '内部巡游启动失败，请重试。'
    } finally {
      if (current === sequence) state.loading = false
    }
  }

  function stop(restoreCamera = true) {
    sequence++
    abort?.abort()
    abort = null
    pause()
    viewer()?.camera.cancelFlight()
    removeTick?.()
    removeTick = null
    removeInputs?.()
    removeInputs = null
    const entered = state.active
    state.active = false
    state.loading = false
    state.error = ''
    restoreScene?.(restoreCamera)
    restoreScene = null
    paths.clear()
    partial = null
    if (entered) options.onExit()
  }

  function seek(value: number) {
    if (!state.active || state.loading) return
    pause()
    state.progress = clamp01(value)
    if (state.selectedEquipmentId) options.onEquipment(null)
    state.selectedEquipmentId = ''
    updateStyle()
    viewer()?.camera.cancelFlight()
    viewer()?.camera.setView(viewAt())
  }
  function togglePlay() {
    if (!state.active || state.loading) return
    if (state.playing) pause()
    else {
      if (state.direction === 1 && state.progress >= 1) state.progress = 0
      if (state.direction === -1 && state.progress <= 0) state.progress = 1
      viewer()?.camera.cancelFlight()
      if (state.selectedEquipmentId) options.onEquipment(null)
      state.selectedEquipmentId = ''
      updateStyle()
      state.playing = true
      lastTime = 0
    }
  }
  function setLayer(layer: RoamingState['layer']) {
    if (!paths.has(layer) || state.loading) return
    state.layer = layer
    state.length = paths.get(layer)!.length
    seek(state.progress)
  }
  function setEyeHeight(height: number) {
    state.eyeHeight = Math.max(0.6, Math.min(4.2, height))
    seek(state.progress)
  }
  function setLateralOffset(offset: number) {
    state.lateralOffset = Math.max(-3, Math.min(3, offset))
    seek(state.progress)
  }
  function reverse() {
    state.direction = state.direction === 1 ? -1 : 1
    seek(state.progress)
  }
  function setDimStructure(dim: boolean) {
    state.dimStructure = dim
    updateStyle()
  }

  async function inspectEquipment(id: string) {
    if (!state.active || state.loading) return
    const item = equipment.value.find((e) => e.id === id)
    if (!item) return
    pause()
    let best = { distance: Infinity, progress: 0, layer: state.layer }
    // 自动选择离设备更近的通行层，而不是把所有设备投影到同一个高度。
    const targetAtFloor = Cesium.Cartesian3.subtract(
      point3(item.center),
      Cesium.Cartesian3.multiplyByScalar(up, state.eyeHeight, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    paths.forEach((path, layer: RoamingState['layer']) => {
      const candidate = nearestRoamingProgress(path, asTuple(targetAtFloor))
      if (candidate.distance < best.distance) best = { ...candidate, layer }
    })
    state.layer = best.layer
    state.length = paths.get(state.layer)!.length
    state.progress = clamp01(
      best.progress -
        (state.direction * Math.max(4, Math.min(item.radius * 1.3, 9))) / state.length,
    )
    state.lateralOffset = 0
    state.selectedEquipmentId = item.id
    state.dimStructure = true
    updateStyle()
    const view = viewAt()
    const target = point3(item.center)
    // 泵房等设备可能低于道路通行层。检视机位落到设备高度，而非隔着整层路板俯视。
    const offset = Cesium.Cartesian3.subtract(view.destination, target, new Cesium.Cartesian3())
    Cesium.Cartesian3.subtract(
      offset,
      Cesium.Cartesian3.multiplyByScalar(
        up,
        Cesium.Cartesian3.dot(offset, up),
        new Cesium.Cartesian3(),
      ),
      offset,
    )
    if (Cesium.Cartesian3.magnitudeSquared(offset) < 0.001)
      Cesium.Cartesian3.negate(view.orientation.direction, offset)
    Cesium.Cartesian3.normalize(offset, offset)
    Cesium.Cartesian3.multiplyByScalar(
      offset,
      Math.max(2.5, Math.min(8, item.radius * 2.2)),
      offset,
    )
    view.destination = Cesium.Cartesian3.add(target, offset, new Cesium.Cartesian3())
    Cesium.Cartesian3.add(
      view.destination,
      Cesium.Cartesian3.multiplyByScalar(up, 0.45, new Cesium.Cartesian3()),
      view.destination,
    )
    const direction = Cesium.Cartesian3.subtract(target, view.destination, new Cesium.Cartesian3())
    view.orientation.direction = Cesium.Cartesian3.normalize(direction, direction)
    options.onEquipment(item)
    await flyTo(view, 0.8)
  }

  function selectPickedEquipment(id: string) {
    pause()
    const item = equipment.value.find((e) => e.id === id)
    if (item) {
      state.selectedEquipmentId = id
      updateStyle()
    }
  }

  return {
    state,
    equipment,
    start,
    stop,
    pause,
    seek,
    togglePlay,
    setLayer,
    setEyeHeight,
    setLateralOffset,
    reverse,
    setDimStructure,
    inspectEquipment,
    selectPickedEquipment,
  }
}
