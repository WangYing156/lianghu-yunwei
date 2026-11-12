/**
 * 孪生 VR 仿真推演：在主 Viewer 内（不新开 WebGL 上下文）基于局部竣工模型真实双层路面构建应急场景。
 *
 * - 火灾：火焰 / 烟气粒子（未排烟双向蔓延 → 排烟后压向下游），射流风机 / 加压送风接管，疏散诱导流线；
 * - 积水：沿纵坡汇水粒子，水面随液位涨落（按真实坡度裁剪淹没长度），泵井抽排流线，车道封闭；
 * - 事故：追尾车辆、排队蔓延、锥桶渐变封闭、车道指示器、救援车进场与管制解除；
 * - 巡检：第一人称沿下层路面巡游，风机推演转速标签，异常停机标注。
 * 视角：全景环绕（结构透视）/ 事件近景（模型内部）/ 第一人称行进；支持 Cesium 立体分屏 VR。
 * 所有特效挂在一个 PrimitiveCollection 下，停止时整体移除并恢复全部场景状态。
 */
import { reactive } from 'vue'
import * as Cesium from 'cesium'
import { PARTIAL_ROAMING_ROUTES } from '../config/partialRoamingRoutes'
import { PARTIAL_MC_TO_TILESET } from '../config/partialFanRig'
import {
  fireVentilationPlan,
  TWIN_SCENARIOS,
  type TwinDevice,
  type TwinScenarioId,
  type TwinTelemetry,
} from '../config/twinScenarios'
import {
  clamp01,
  createRoamingPath,
  nearestRoamingProgress,
  sampleRoamingPath,
  type Point3,
  type RoamingPath,
} from '../utils/roamingPath'
import {
  scenarioDuration,
  solveFloodExtent,
  walkAlongAtStep,
} from '../utils/simulationPhysics'
import {
  createFlowMaterial,
  createUnitQuadGeometry,
  createWaterMaterial,
  spriteUrl,
  vmsBoardUrl,
  type SpriteKind,
} from '../utils/simulationAssets'
import type { PartialTunnelFx } from './usePartialTunnelFx'

export type TwinView = 'overview' | 'event' | 'walk'
type Deck = 'lower' | 'upper'

export interface TwinSimState {
  active: boolean
  loading: boolean
  error: string
  scenario: TwinScenarioId
  step: number
  /** 当前步骤进度 0–1 */
  stepProgress: number
  playing: boolean
  finished: boolean
  rate: 1 | 2 | 4
  view: TwinView
  orbit: boolean
  stereo: boolean
  telemetry: TwinTelemetry[]
  devices: TwinDevice[]
}

interface SimOptions {
  getViewer: () => Cesium.Viewer | null
  prepare: () => Promise<Cesium.Cesium3DTileset | null>
  getTilesets: () => Cesium.Cesium3DTileset[]
  fx: PartialTunnelFx
  /** 全景视角下竣工模型结构透视 */
  setXray: (on: boolean) => void
  onEnter: () => void
  /** 仿真已接管场景（隐藏业务点位等） */
  onActivated?: () => void
  onExit: () => void
}

interface Frame {
  p: Cesium.Cartesian3
  dir: Cesium.Cartesian3
  side: Cesium.Cartesian3
}

interface ScenarioFx {
  /** 事件中心（tileset 局部坐标） */
  focus: Cesium.Cartesian3
  /** 近景机位：沿路线相对事件的距离 / 横向 / 高度 */
  eventCamera: { along: number; lateral: number; height: number }
  /** 第一人称起点（相对事件） */
  walkFrom: number
  walkTo: number
  /** 近景基准进度，缺省用事件进度 */
  cameraProgress?: number
  update: (t: number, dt: number, step: number, k: number) => void
  onStep?: (step: number) => void
  /** 巡检：由行进进度驱动步骤 */
  walkDriven?: boolean
}

interface Vehicle {
  body: Cesium.Primitive
  cabin: Cesium.Primitive
  height: number
  set: (f: Frame | null, yaw?: number) => void
}

interface SceneCaption {
  text: string
  position: Cesium.Cartesian3
  backgroundColor: Cesium.Color
  show: boolean
}

const UP = Cesium.Cartesian3.UNIT_Z
const CEILING_LOWER = 4.6
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const fract = (n: number) => n - Math.floor(n)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function useTwinSimulation(options: SimOptions) {
  const state = reactive<TwinSimState>({
    active: false,
    loading: false,
    error: '',
    scenario: 'fire',
    step: 0,
    stepProgress: 0,
    playing: false,
    finished: false,
    rate: 1,
    view: 'overview',
    orbit: true,
    stereo: false,
    telemetry: [],
    devices: [],
  })

  let v: Cesium.Viewer | null = null
  let transform = new Cesium.Matrix4()
  const paths = new Map<Deck, RoamingPath>()
  let root: Cesium.PrimitiveCollection | null = null
  let billboards: Cesium.BillboardCollection | null = null
  let fxScene: ScenarioFx | null = null
  let restoreScene: (() => void) | null = null
  let removeInputs: (() => void) | null = null
  let raf = 0
  let last = 0
  let simTime = 0
  let stepElapsed = 0
  let telemetryAt = 0
  let walkAlong = 0
  let orbitHeading = 0
  let orbitPitch = -0.55
  let orbitRange = 90
  let cameraBusy = false
  let sequence = 0
  let interiorOn = false
  let savedInterior: (() => void) | null = null
  /** onEnter 已改动过外部场景状态；即使加载失败/被取消也要调用 onExit 复原 */
  let enterPending = false
  let errorTimer = 0

  const viewer = () => {
    const x = options.getViewer()
    return x && !x.isDestroyed() ? x : null
  }
  const def = () => TWIN_SCENARIOS[state.scenario]
  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ================= 空间工具（tileset 局部坐标，z 向上） ================= */

  function path(deck: Deck): RoamingPath {
    return paths.get(deck) ?? paths.get('lower')!
  }

  function progressBy(deck: Deck, from: number, meters: number): number {
    return clamp01(from + meters / path(deck).length)
  }

  function frame(deck: Deck, progress: number, lateral = 0, height = 0): Frame {
    const { point, tangent } = sampleRoamingPath(path(deck), progress)
    const dir = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(tangent[0], tangent[1], 0),
      new Cesium.Cartesian3(),
    )
    const side = Cesium.Cartesian3.cross(dir, UP, new Cesium.Cartesian3())
    const p = new Cesium.Cartesian3(point[0], point[1], point[2] + height)
    Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(side, lateral, new Cesium.Cartesian3()), p)
    return { p, dir, side }
  }

  const toWorld = (local: Cesium.Cartesian3) =>
    Cesium.Matrix4.multiplyByPoint(transform, local, new Cesium.Cartesian3())

  /** 同层风机平均射流方向相对路线方向的符号：+1 气流顺路线点序 */
  function flowSign(deck: Deck): 1 | -1 {
    const m = Cesium.Matrix4.fromArray([...PARTIAL_MC_TO_TILESET])
    const sum = new Cesium.Cartesian3()
    options.fx.rigs.forEach((r) => {
      if (r.deck !== deck) return
      Cesium.Cartesian3.add(
        sum,
        Cesium.Matrix4.multiplyByPointAsVector(m, new Cesium.Cartesian3(...r.axis), new Cesium.Cartesian3()),
        sum,
      )
    })
    const pts = path(deck).points
    const along = new Cesium.Cartesian3(
      pts[pts.length - 1][0] - pts[0][0],
      pts[pts.length - 1][1] - pts[0][1],
      0,
    )
    return Cesium.Cartesian3.dot(sum, along) >= 0 ? 1 : -1
  }

  function localPose(f: Frame, yaw = 0, lift = 0): Cesium.Matrix4 {
    const q = Cesium.Quaternion.fromAxisAngle(UP, yaw)
    const d = Cesium.Matrix3.multiplyByVector(
      Cesium.Matrix3.fromQuaternion(q),
      f.dir,
      new Cesium.Cartesian3(),
    )
    const y = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(UP, d, new Cesium.Cartesian3()), new Cesium.Cartesian3())
    const x = Cesium.Cartesian3.cross(y, UP, new Cesium.Cartesian3())
    const p = f.p
    return new Cesium.Matrix4(
      x.x, y.x, UP.x, p.x,
      x.y, y.y, UP.y, p.y,
      x.z, y.z, UP.z, p.z + lift,
      0, 0, 0, 1,
    )
  }

  /* ================= 图元工厂 ================= */

  function addSprite(kind: SpriteKind, size: number, color: Cesium.Color): Cesium.Billboard {
    return billboards!.add({
      image: spriteUrl(kind),
      position: Cesium.Cartesian3.ZERO,
      sizeInMeters: true,
      width: size,
      height: size,
      color,
      scaleByDistance: new Cesium.NearFarScalar(3, 0.25, 28, 1),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(1.8, 500),
      show: false,
    })
  }

  const captionCache = new Map<string, string>()

  function captionImage(text: string, accent: string): string {
    const key = `${accent}|${text}`
    const hit = captionCache.get(key)
    if (hit) return hit
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = '700 22px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.font = font
    const width = Math.ceil(ctx.measureText(text).width + 40)
    const height = 48
    canvas.width = width
    canvas.height = height
    ctx.font = font
    const round = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }
    ctx.fillStyle = 'rgba(2, 8, 16, 0.45)'
    round(3, 5, width - 6, height - 8, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(7, 16, 28, 0.92)'
    round(1, 1, width - 5, height - 10, 10)
    ctx.fill()
    ctx.fillStyle = accent
    round(1, 1, 7, height - 10, 3)
    ctx.fill()
    ctx.fillStyle = '#f5f9ff'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 18, (height - 8) / 2)
    const url = canvas.toDataURL('image/png')
    captionCache.set(key, url)
    return url
  }

  function addLabel(text: string, at: Cesium.Cartesian3, color: string): SceneCaption {
    const accent = Cesium.Color.fromCssColorString(color).withAlpha(0.95)
    const billboard = billboards!.add({
      image: captionImage(text, accent.toCssColorString()),
      position: at,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, -12),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(10, 1.05, 240, 0.7),
      show: false,
    })
    let current = text
    let paint = accent.toCssColorString()
    return {
      get text() {
        return current
      },
      set text(value: string) {
        if (value === current) return
        current = value
        billboard.image = captionImage(current, paint)
      },
      get position() {
        return billboard.position
      },
      set position(value: Cesium.Cartesian3) {
        billboard.position = value
      },
      get backgroundColor() {
        return Cesium.Color.fromCssColorString(paint)
      },
      set backgroundColor(value: Cesium.Color) {
        const next = value.toCssColorString()
        if (next === paint) return
        paint = next
        billboard.image = captionImage(current, paint)
      },
      get show() {
        return billboard.show
      },
      set show(value: boolean) {
        billboard.show = value
      },
    }
  }

  function addBox(dimensions: Cesium.Cartesian3, color: Cesium.Color): Cesium.Primitive {
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: Cesium.BoxGeometry.fromDimensions({
          dimensions,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: color.alpha < 1,
        closed: true,
      }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(primitive)
    return primitive
  }

  function addWheel(radius: number, thick: number, color: Cesium.Color): Cesium.Primitive {
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.CylinderGeometry({
          length: thick,
          topRadius: radius,
          bottomRadius: radius,
          slices: 18,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({ closed: true }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(primitive)
    return primitive
  }

  const wheelSpin = Cesium.Matrix3.fromRotationX(Math.PI / 2)

  function addVehicle(length: number, width: number, height: number, color: string): Vehicle {
    const truck = length >= 6
    const paint = Cesium.Color.fromCssColorString(color)
    const glass = new Cesium.Color(0.05, 0.12, 0.2, 0.96)
    const trim = new Cesium.Color(0.08, 0.09, 0.1, 1)
    const silver = new Cesium.Color(0.78, 0.82, 0.86, 1)
    const cabinPaint = truck ? Cesium.Color.fromCssColorString('#f4f7fa') : paint
    const body = addBox(new Cesium.Cartesian3(length * 0.92, width * 0.96, height * 0.28), paint)
    const cabin = addBox(
      new Cesium.Cartesian3(truck ? length * 0.26 : length * 0.36, width * 0.86, height * 0.3),
      cabinPaint,
    )
    const roof = addBox(
      new Cesium.Cartesian3(truck ? length * 0.2 : length * 0.3, width * 0.78, height * 0.06),
      truck ? cabinPaint : paint,
    )
    const hood = addBox(new Cesium.Cartesian3(length * 0.24, width * 0.9, height * 0.1), paint)
    const deck = addBox(new Cesium.Cartesian3(length * 0.22, width * 0.9, height * 0.08), paint)
    const screen = addBox(new Cesium.Cartesian3(0.05, width * 0.72, height * 0.22), glass)
    const rearGlass = addBox(new Cesium.Cartesian3(0.045, width * 0.66, height * 0.16), glass)
    const sideGlass = [-1, 1].map(() => addBox(new Cesium.Cartesian3(truck ? length * 0.14 : length * 0.2, 0.035, height * 0.14), glass))
    const belt = addBox(new Cesium.Cartesian3(length * 0.7, width * 1.002, 0.035), silver)
    const bumper = addBox(new Cesium.Cartesian3(0.08, width, height * 0.1), silver)
    const rearBumper = addBox(new Cesium.Cartesian3(0.06, width * 0.96, height * 0.08), silver)
    const grille = addBox(new Cesium.Cartesian3(0.03, width * 0.42, height * 0.12), trim)
    const plate = addBox(new Cesium.Cartesian3(0.02, 0.42, 0.12), new Cesium.Color(0.93, 0.94, 0.9, 1))
    const mirrors = [-1, 1].map(() => addBox(new Cesium.Cartesian3(0.14, 0.07, 0.05), trim))
    const lamps = [0, 1].map(() => addBox(new Cesium.Cartesian3(0.05, 0.28, 0.09), new Cesium.Color(1, 0.97, 0.86, 1)))
    const tails = [0, 1].map(() => addBox(new Cesium.Cartesian3(0.04, 0.32, 0.08), new Cesium.Color(0.86, 0.08, 0.1, 1)))
    const lightbar = truck
      ? [
          addBox(new Cesium.Cartesian3(0.55, 0.16, 0.08), new Cesium.Color(0.9, 0.08, 0.1, 1)),
          addBox(new Cesium.Cartesian3(0.55, 0.16, 0.08), new Cesium.Color(0.1, 0.28, 0.95, 1)),
        ]
      : []
    const axles = truck ? [-0.34, 0.02, 0.32] : [-0.3, 0.32]
    const wheelPos = axles.flatMap((sx) => [-1, 1].map((sy) => ({ sx, sy })))
    const tireR = truck ? 0.46 : 0.34
    const tires = wheelPos.map(() => addWheel(tireR, truck ? 0.24 : 0.18, trim))
    const rims = wheelPos.map(() => addWheel(tireR * 0.52, truck ? 0.26 : 0.2, silver))
    const parts = [
      body, cabin, roof, hood, deck, screen, rearGlass, ...sideGlass, belt, bumper, rearBumper,
      grille, plate, ...mirrors, ...lamps, ...tails, ...lightbar, ...tires, ...rims,
    ]
    const put = (prim: Cesium.Primitive, pose: Cesium.Matrix4, offset: Cesium.Cartesian3) => {
      prim.modelMatrix = Cesium.Matrix4.multiply(
        transform,
        Cesium.Matrix4.multiply(pose, Cesium.Matrix4.fromTranslation(offset), new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      )
      prim.show = true
    }
    const putWheel = (prim: Cesium.Primitive, pose: Cesium.Matrix4, offset: Cesium.Cartesian3) => {
      const local = Cesium.Matrix4.fromRotationTranslation(wheelSpin, offset)
      prim.modelMatrix = Cesium.Matrix4.multiply(
        transform,
        Cesium.Matrix4.multiply(pose, local, new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      )
      prim.show = true
    }
    return {
      body,
      cabin,
      height,
      set(f, yaw = 0) {
        if (!f) {
          parts.forEach((p) => (p.show = false))
          return
        }
        const pose = localPose(f, yaw)
        const z = tireR
        const beltZ = z + height * 0.22
        put(body, pose, new Cesium.Cartesian3(0, 0, z + height * 0.12))
        put(cabin, pose, new Cesium.Cartesian3(truck ? length * 0.28 : -length * 0.04, 0, z + height * 0.38))
        put(roof, pose, new Cesium.Cartesian3(truck ? length * 0.28 : -length * 0.04, 0, z + height * 0.56))
        put(hood, pose, new Cesium.Cartesian3(length * 0.32, 0, z + height * 0.2))
        put(deck, pose, new Cesium.Cartesian3(-length * 0.32, 0, z + height * 0.2))
        put(screen, pose, new Cesium.Cartesian3(truck ? length * 0.4 : length * 0.14, 0, z + height * 0.42))
        put(rearGlass, pose, new Cesium.Cartesian3(truck ? length * 0.16 : -length * 0.22, 0, z + height * 0.4))
        sideGlass.forEach((pane, i) =>
          put(pane, pose, new Cesium.Cartesian3(truck ? length * 0.28 : -length * 0.04, (i ? 1 : -1) * width * 0.45, z + height * 0.4)),
        )
        put(belt, pose, new Cesium.Cartesian3(0, 0, beltZ))
        put(bumper, pose, new Cesium.Cartesian3(length * 0.48, 0, z + height * 0.08))
        put(rearBumper, pose, new Cesium.Cartesian3(-length * 0.46, 0, z + height * 0.08))
        put(grille, pose, new Cesium.Cartesian3(length * 0.47, 0, z + height * 0.22))
        put(plate, pose, new Cesium.Cartesian3(length * 0.49, 0, z + height * 0.06))
        mirrors.forEach((mirror, i) =>
          put(mirror, pose, new Cesium.Cartesian3(length * 0.12, (i ? 1 : -1) * width * 0.52, z + height * 0.4)),
        )
        lamps.forEach((lamp, i) => put(lamp, pose, new Cesium.Cartesian3(length * 0.48, (i ? 1 : -1) * width * 0.32, z + height * 0.18)))
        tails.forEach((lamp, i) => put(lamp, pose, new Cesium.Cartesian3(-length * 0.47, (i ? 1 : -1) * width * 0.3, z + height * 0.2)))
        lightbar.forEach((bar, i) => put(bar, pose, new Cesium.Cartesian3(length * 0.28, (i ? 1 : -1) * 0.18, z + height * 0.64)))
        wheelPos.forEach(({ sx, sy }, i) => {
          const atWheel = new Cesium.Cartesian3(sx * length, sy * width * 0.5, tireR)
          putWheel(tires[i], pose, atWheel)
          putWheel(rims[i], pose, atWheel)
        })
      },
    }
  }

  function addCone(f: Frame): Cesium.Primitive {
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.CylinderGeometry({
          length: 0.72,
          topRadius: 0.035,
          bottomRadius: 0.17,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#ff7a1a')),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({ closed: true }),
      modelMatrix: Cesium.Matrix4.multiply(transform, localPose(f, 0, 0.36), new Cesium.Matrix4()),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(primitive)
    return primitive
  }

  interface FlowLine {
    primitive: Cesium.Primitive
    material: Cesium.Material
  }

  function addFlowLine(localPoints: Cesium.Cartesian3[], color: string, width = 10, dash = 4): FlowLine {
    let length = 0
    for (let i = 1; i < localPoints.length; i++) length += Cesium.Cartesian3.distance(localPoints[i - 1], localPoints[i])
    const material = createFlowMaterial(Cesium.Color.fromCssColorString(color), length / dash)
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: localPoints.map(toWorld),
          width,
          arcType: Cesium.ArcType.NONE,
          vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new Cesium.PolylineMaterialAppearance({ material, translucent: true }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(primitive)
    return { primitive, material }
  }

  const advanceFlow = (line: FlowLine, dt: number, speed: number) => {
    const u = line.material.uniforms as { offset: number }
    u.offset += dt * speed
  }

  function samplePolyline(deck: Deck, from: number, to: number, lateral: number, height: number, n = 18) {
    const out: Cesium.Cartesian3[] = []
    for (let i = 0; i <= n; i++) out.push(frame(deck, from + ((to - from) * i) / n, lateral, height).p)
    return out
  }

  const scratchColor = new Cesium.Color()
  const tinted = (base: Cesium.Color, alpha: number) =>
    Cesium.Color.clone(base, scratchColor).withAlpha(Math.max(0, Math.min(1, alpha)), scratchColor)

  /* ================= 场景：火灾疏散 ================= */

  function buildFire(): ScenarioFx {
    const deck: Deck = 'lower'
    const pe = def().eventProgress
    const sign = flowSign(deck)
    const at = (meters: number, lateral = 0, height = 0) =>
      frame(deck, progressBy(deck, pe, meters * sign), lateral, height)
    const fire = at(0, 0.82)
    const car = addVehicle(4.6, 1.5, 1.5, '#3b2c27')
    car.set(fire, 0.12)

    const glow = addSprite('glow', 8, Cesium.Color.ORANGE)
    const flames = Array.from({ length: 56 }, () => ({
      b: addSprite('flame', 1.2, Cesium.Color.WHITE),
      phase: Math.random(),
      jx: rand(-1, 1),
      jy: rand(-1, 1),
      rate: rand(0.9, 1.4),
    }))
    const smokeBase = new Cesium.Color(0.15, 0.15, 0.17, 1)
    const smokeFar = new Cesium.Color(0.42, 0.42, 0.45, 1)
    const smoke = Array.from({ length: 120 }, () => ({
      b: addSprite('smoke', 2, smokeBase),
      phase: Math.random(),
      lateral: rand(-3.2, 3.2),
      dirN: Math.random() < 0.5 ? -1 : 1,
      color: new Cesium.Color(),
    }))
    const embers = Array.from({ length: 28 }, () => ({
      b: addSprite('glow', 0.35, Cesium.Color.ORANGE),
      phase: Math.random(),
      lateral: rand(-0.8, 0.8),
      along: rand(-1.2, 1.4),
    }))
    const evacLine = addFlowLine(
      Array.from({ length: 19 }, (_, i) => at(-6 - i * 4, -1.9, 0.08).p),
      '#2ee6a0',
      12,
      5,
    )
    const evacLights = Array.from({ length: 11 }, (_, i) => ({
      b: addSprite('beacon', 0.9, Cesium.Color.fromCssColorString('#2ee6a0')),
      f: at(-8 - i * 7, -3.7, 0.9),
      i,
    }))
    evacLights.forEach((l) => (l.b.position = l.f.p))
    const fireLabel = addLabel('推演火点 · 小客车起火', at(0, 1.6, 4.2).p, '#d9363e')
    const evacLabel = addLabel('推演疏散方向 · 上游 80m', at(-82, -1.9, 2.6).p, '#11946a')
    const exhaustLabel = addLabel('纵向排烟 · 顺下游射流方向', at(28, 0, CEILING_LOWER + 0.6).p, '#c46a12')
    let activeStep = 0
    let activeK = 0
    let overrideKey = ''

    /** 覆写对象只在模式切换时重建，负荷函数读取当前 step/k，保证步骤 3 能真正回落常规通风。 */
    const syncVentilation = (step: number, k: number) => {
      activeStep = step
      activeK = k
      const plan = fireVentilationPlan(step, k)
      const key = `${plan.mode}|${plan.label}`
      if (key === overrideKey) return
      overrideKey = key
      options.fx.setOverride({
        label: plan.label,
        mode: plan.mode,
        level: (rig) => {
          const current = fireVentilationPlan(activeStep, activeK)
          return rig.deck === 'lower' ? current.lower : current.upper
        },
        vent: plan.vent,
        tint: plan.vent ? new Cesium.Color(1, 0.72, 0.45, 1) : undefined,
      })
    }

    return {
      focus: at(1.5, 0.3, 0.65).p,
      eventCamera: { along: -11 * sign, lateral: -2.05, height: 2.15 },
      walkFrom: -72 * sign,
      walkTo: -13 * sign,
      onStep: (step) => syncVentilation(step, 0),
      update(t, _dt, step, kk) {
        syncVentilation(step, kk)
        const plan = fireVentilationPlan(step, kk)
        const intensity =
          step === 0 ? 0.55 + 0.45 * kk : step === 1 ? 1 : step === 2 ? 1 - 0.3 * kk : 0.7 * Math.pow(1 - kk, 1.6)
        const density = step === 0 ? 0.5 + 0.5 * kk : step === 1 ? 1 : step === 2 ? 0.85 : 0.75 * (1 - kk)
        // 排烟风机建立前双向扩散；排烟建立后压向下游；复盘阶段逐步恢复扩散而非瞬间反向。
        const exhaust = step === 0 ? 0 : step === 1 ? smooth(0, 0.35, kk) : step === 2 ? 1 : 1 - smooth(0.55, 1, kk) * 0.78
        glow.position = at(0, 1.6, 1.6).p
        glow.color = tinted(Cesium.Color.ORANGE, 0.32 * intensity * (0.85 + 0.15 * Math.sin(t * 17)))
        glow.show = intensity > 0.02
        for (const f of flames) {
          const u = fract(f.phase + t * f.rate)
          const life = 1 - u
          const p = Cesium.Cartesian3.clone(fire.p)
          Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(fire.side, f.jx * 0.9 * life, new Cesium.Cartesian3()), p)
          Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(fire.dir, f.jy * 1.7 * life, new Cesium.Cartesian3()), p)
          p.z += 1.25 + u * 2.4 * intensity
          f.b.position = p
          const size = (1.5 - u * 0.85) * (0.55 + 0.45 * intensity)
          f.b.width = f.b.height = size
          f.b.color = tinted(
            u < 0.3 ? Cesium.Color.WHITE : u < 0.6 ? Cesium.Color.ORANGE : Cesium.Color.ORANGERED,
            Math.pow(life, 1.1) * intensity,
          )
          f.b.show = intensity > 0.02
        }
        for (const e of embers) {
          const u = fract(e.phase + t * 0.35)
          const p = Cesium.Cartesian3.clone(fire.p)
          Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(fire.side, e.lateral, new Cesium.Cartesian3()), p)
          Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(fire.dir, e.along + u * 1.6, new Cesium.Cartesian3()), p)
          p.z += 0.35 + u * 1.1
          e.b.position = p
          e.b.width = e.b.height = 0.18 + (1 - u) * 0.28
          e.b.color = tinted(u < 0.5 ? Cesium.Color.YELLOW : Cesium.Color.ORANGERED, (1 - u) * intensity)
          e.b.show = intensity > 0.05
        }
        for (const s of smoke) {
          const u = fract(s.phase + t / 10)
          let along: number
          let height: number
          let lat: number
          if (u < 0.18) {
            const r = u / 0.18
            along = 0
            height = 2.3 + r * (CEILING_LOWER - 2.5)
            lat = 1.6 + (s.lateral - 1.6) * r * 0.5
          } else {
            const q = (u - 0.18) / 0.82
            along = q * (26 * s.dirN * (1 - exhaust) + 72 * exhaust)
            height = CEILING_LOWER - 0.2 - q * 0.9 * (1 - exhaust * 0.6)
            lat = s.lateral * (0.55 + 0.45 * q)
          }
          s.b.position = at(along, lat, height).p
          const size = 1.6 + u * 4.4
          s.b.width = s.b.height = size
          Cesium.Color.lerp(smokeBase, smokeFar, u, s.color)
          const fade = (u < 0.06 ? u / 0.06 : 1) * Math.pow(1 - u, 0.7)
          s.b.color = s.color.withAlpha(0.62 * fade * density, s.color)
          s.b.show = density > 0.01
        }
        const evac = step === 2 || (step === 3 && kk < 0.35)
        evacLine.primitive.show = evac
        if (evac) advanceFlow(evacLine, _dt, 0.55)
        evacLights.forEach((l) => {
          l.b.show = evac
          if (evac) {
            const chase = fract(t * 1.4 - l.i / evacLights.length)
            l.b.color = tinted(Cesium.Color.fromCssColorString('#2ee6a0'), 0.35 + 0.65 * (chase < 0.25 ? 1 : 0.15))
          }
        })
        fireLabel.show = intensity > 0.05
        evacLabel.show = evac
        exhaustLabel.show = plan.mode === 'exhaust'
      },
    }
  }

  /* ================= 场景：积水排涝 ================= */

  function buildFlood(): ScenarioFx {
    const deck: Deck = 'lower'
    const p = path(deck)
    // 洞口是路线最低点；往洞内退约 18m 避开被切断的断面，并按真实纵坡求水平水面。
    const origin = floodOriginMeters()
    const pLow = origin / p.length
    const zHere = frame(deck, pLow).p.z
    const zAhead = frame(deck, progressBy(deck, pLow, 12)).p.z
    const uphill: 1 | -1 = zAhead >= zHere ? 1 : -1
    const at = (meters: number, lateral = 0, height = 0) =>
      frame(deck, progressBy(deck, pLow, meters * uphill), lateral, height)
    const sampleAt = (meters: number): Point3 =>
      sampleRoamingPath(p, clamp01(meters / p.length)).point
    const rel = (meters: number) => (meters - origin) * uphill
    const poolAlong = 7
    const poolLateral = 0
    const waterWidth = 4.4
    const driveLane = -0.68
    const guideLateral = -1.72
    const pumpAlong = 8
    const pumpLateral = 2.2
    const sumpAlong = 12.2
    const sumpLateral = 2.72
    const water = createWaterMaterial(new Cesium.Color(0.1, 0.42, 0.62, 1))
    const sumpWater = createWaterMaterial(new Cesium.Color(0.08, 0.38, 0.58, 1))
    const waterSheet = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry: createUnitQuadGeometry() }),
      appearance: new Cesium.MaterialAppearance({
        material: water,
        translucent: true,
        faceForward: true,
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
      }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(waterSheet)
    const drops = Array.from({ length: 36 }, () => ({
      b: addSprite('drop', 0.2, Cesium.Color.fromCssColorString('#9fd8ff')),
      phase: Math.random(),
      lateral: rand(-1.6, 1.6),
    }))
    const sumpSheet = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({ geometry: createUnitQuadGeometry() }),
      appearance: new Cesium.MaterialAppearance({
        material: sumpWater,
        translucent: true,
        faceForward: true,
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
      }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    })
    root!.add(sumpSheet)
    const alarm = addSprite('beacon', 0.7, Cesium.Color.RED)
    const steel = new Cesium.Color(0.22, 0.27, 0.32, 1)
    const pumpBlue = new Cesium.Color(0.12, 0.38, 0.68, 1)
    const pipeColor = new Cesium.Color(0.45, 0.62, 0.74, 1)
    const placePart = (box: Cesium.Primitive, meters: number, lateral: number, lift: number) => {
      const f = at(meters, lateral, 0)
      box.modelMatrix = Cesium.Matrix4.multiply(
        transform,
        Cesium.Matrix4.multiply(localPose(f), Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, lift)), new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      )
      box.show = true
    }
    const part = (size: Cesium.Cartesian3, color: Cesium.Color, meters: number, lateral: number, lift: number) => {
      const box = addBox(size, color)
      placePart(box, meters, lateral, lift)
      return box
    }
    part(new Cesium.Cartesian3(1.7, 0.78, 0.08), steel, pumpAlong, pumpLateral, 0.06)
    part(new Cesium.Cartesian3(0.46, 0.4, 0.36), pumpBlue, pumpAlong + 0.38, pumpLateral, 0.3)
    part(new Cesium.Cartesian3(0.46, 0.4, 0.36), pumpBlue, pumpAlong - 0.38, pumpLateral, 0.3)
    part(new Cesium.Cartesian3(0.16, 0.85, 0.14), pipeColor, pumpAlong, 1.58, 0.2)
    part(new Cesium.Cartesian3(0.14, 0.14, 0.28), pipeColor, pumpAlong + 0.38, pumpLateral, 0.58)
    part(new Cesium.Cartesian3(0.14, 0.14, 0.28), pipeColor, pumpAlong - 0.38, pumpLateral, 0.58)
    part(new Cesium.Cartesian3(1.05, 0.12, 0.12), pipeColor, pumpAlong, pumpLateral, 0.72)
    part(new Cesium.Cartesian3(2.4, 0.12, 0.12), pipeColor, 10.2, pumpLateral, 0.72)
    part(new Cesium.Cartesian3(0.12, 0.7, 0.12), pipeColor, sumpAlong, 2.45, 0.55)
    part(new Cesium.Cartesian3(0.72, 0.52, 0.32), new Cesium.Color(0.18, 0.2, 0.22, 1), sumpAlong, sumpLateral, 0.18)
    part(new Cesium.Cartesian3(0.62, 0.42, 0.04), new Cesium.Color(0.1, 0.12, 0.14, 1), sumpAlong, sumpLateral, 0.36)
    const addMotor = (meters: number) => {
      const motor = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.CylinderGeometry({
            length: 0.28,
            topRadius: 0.14,
            bottomRadius: 0.16,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#243140')),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({ closed: true }),
        asynchronous: false,
        allowPicking: false,
      })
      const f = at(meters, pumpLateral, 0)
      motor.modelMatrix = Cesium.Matrix4.multiply(
        transform,
        Cesium.Matrix4.multiply(localPose(f), Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 0.62)), new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      )
      motor.show = true
      root!.add(motor)
    }
    addMotor(pumpAlong + 0.38)
    addMotor(pumpAlong - 0.38)
    const pumpGlow = addSprite('glow', 0.55, Cesium.Color.fromCssColorString('#4ea6ff'))
    const pumpAnchor = at(pumpAlong, pumpLateral, 0.7)
    pumpGlow.position = pumpAnchor.p
    const sumpAnchor = at(sumpAlong, sumpLateral, 0.08)
    const pumpLine = addFlowLine(
      [
        at(poolAlong, 1.7, 0.12).p,
        at(pumpAlong, 1.58, 0.2).p,
        at(pumpAlong, pumpLateral, 0.72).p,
        at(10.2, pumpLateral, 0.72).p,
        at(sumpAlong, 2.45, 0.55).p,
        sumpAnchor.p,
      ],
      '#7ec8e3',
      5,
      1.2,
    )
    const outlet = addSprite('drop', 0.28, Cesium.Color.fromCssColorString('#d7f3ff'))
    // 诱导设施在积水上坡一侧，近景能同时看到水面和绕行车道
    const guideAt = 12
    const board = billboards!.add({
      image: vmsBoardUrl('前方 K3+050 积水预警', '减速慢行 · 准备绕行上层', 'warn'),
      position: at(guideAt, 0, 1.55).p,
      sizeInMeters: true,
      width: 3.6,
      height: 0.95,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: 40,
      show: true,
    })
    const mount = (offsetY: number, size: Cesium.Cartesian3, z: number) => {
      const box = addBox(size, new Cesium.Color(0.22, 0.27, 0.32, 1))
      const f = at(guideAt, offsetY, 0)
      box.modelMatrix = Cesium.Matrix4.multiply(
        transform,
        Cesium.Matrix4.multiply(localPose(f), Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, z)), new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      )
      box.show = true
      return box
    }
    mount(-2.35, new Cesium.Cartesian3(0.14, 0.14, 2.15), 1.05)
    mount(2.35, new Cesium.Cartesian3(0.14, 0.14, 2.15), 1.05)
    mount(0, new Cesium.Cartesian3(0.12, 4.9, 0.12), 2.05)
    const signs = [-2.15, 2.15].map((lat) => ({
      closed: addSprite('laneClosed', 0.82, Cesium.Color.WHITE),
      open: addSprite('laneOpen', 0.82, Cesium.Color.WHITE),
      lat,
      f: at(guideAt, lat, 1.15),
    }))
    signs.forEach((s) => {
      s.closed.position = s.f.p
      s.open.position = s.f.p
      s.closed.disableDepthTestDistance = 30
      s.open.disableDepthTestDistance = 30
    })
    const guideLine = addFlowLine(
      Array.from({ length: 22 }, (_, i) => at(26 - i * 1.8, guideLateral, 0.22).p),
      '#ffc53d',
      18,
      2.2,
    )
    const guideDashes = Array.from({ length: 16 }, (_, i) =>
      part(new Cesium.Cartesian3(1.05, 0.14, 0.035), new Cesium.Color(1, 0.78, 0.1, 1), 24 - i * 2.1, guideLateral, 0.08),
    )
    guideDashes.forEach((d) => (d.show = false))
    guideLine.primitive.show = false
    const detourCars = ['#d5deea', '#3d7edb'].map((c, i) => ({
      v: addVehicle(4.5, 1.5, 1.48, c),
      along: 18 + i * 8,
    }))
    let guideAtTime = -1
    const heading = (f: Frame): Frame =>
      uphill > 0 ? { ...f, dir: Cesium.Cartesian3.negate(f.dir, new Cesium.Cartesian3()) } : f
    const foam = Array.from({ length: 18 }, () => ({
      b: addSprite('drop', 0.38, Cesium.Color.WHITE),
      phase: Math.random(),
      lateral: rand(-1.5, 1.5),
    }))
    const ripples = Array.from({ length: 5 }, () => ({
      b: addSprite('glow', 0.55, Cesium.Color.fromCssColorString('#b8dde8')),
      phase: Math.random(),
      lateral: rand(-1.2, 1.2),
      along: Math.random(),
    }))
    let visLevel = 0.05
    const pit = at(poolAlong, poolLateral)
    const levelLabel = addLabel('积水点 W2 · 推演液位', at(poolAlong, 0, 1.7).p, '#d9363e')
    const pumpLabel = addLabel('排涝泵 P1/P2 · 推演抽排', new Cesium.Cartesian3(pumpAnchor.p.x, pumpAnchor.p.y, pumpAnchor.p.z + 0.85), '#1d6fd1')
    const sumpLabel = addLabel('侧墙集水井 · 推演受纳点', new Cesium.Cartesian3(sumpAnchor.p.x, sumpAnchor.p.y, sumpAnchor.p.z + 1.15), '#1d6fd1')
    const detourLabel = addLabel('交通诱导 · 推演绕行', at(guideAt, driveLane, 1.7).p, '#c46a12')
    let shownBand = ''
    let lastText = ''
    let boardMode = ''

    return {
      focus: at(poolAlong - 1, 0.05, 0.18).p,
      eventCamera: { along: (poolAlong + 10) * uphill, lateral: -0.15, height: 2.5 },
      walkFrom: 64 * uphill,
      walkTo: 12 * uphill,
      update(t, dt, step, k) {
        const tel = def().telemetry(step, k)
        const levelCm = Number.parseFloat(tel[0].value) || 0
        const pumpFlow = Number.parseFloat(tel[1].value) || 0
        const rain = Number.parseFloat(tel[2].value) || 0
        const targetH = Math.max(0.025, levelCm / 100)
        visLevel += (targetH - visLevel) * Math.min(1, dt * 0.42)
        const h = visLevel
        // 水平水面与真实路面纵坡求交：水位越高，向上游延伸越长，而不是固定圆盘悬空。
        const extent = solveFloodExtent(sampleAt, p.length, origin, h, {
          startMargin: 9,
          maxLookahead: 70,
          direction: uphill,
          sampleStep: 0.75,
        })
        const startRel = rel(extent.startMeters)
        const endRel = rel(extent.endMeters)
        const centerRel = rel(extent.centerMeters)
        const wetSpan = Math.abs(endRel - startRel)
        const waterTopZ = extent.surfaceZ + 0.008
        const centerFrame = frame(deck, clamp01(extent.centerMeters / p.length))
        const centerPoint = new Cesium.Cartesian3(centerFrame.p.x, centerFrame.p.y, waterTopZ)
        const waterPose = localPose({ ...centerFrame, p: centerPoint }, 0, 0)
        waterSheet.modelMatrix = Cesium.Matrix4.multiply(
          transform,
          Cesium.Matrix4.multiply(
            waterPose,
            Cesium.Matrix4.fromScale(new Cesium.Cartesian3(extent.horizontalLength, waterWidth, 1)),
            new Cesium.Matrix4(),
          ),
          new Cesium.Matrix4(),
        )
        const showWater = levelCm > 0.8 && h > 0.015 && extent.horizontalLength > 0.6
        waterSheet.show = showWater
        ;(water.uniforms as { time: number }).time += dt
        ;(sumpWater.uniforms as { time: number }).time += dt
        for (const f of foam) {
          const u = fract(f.phase + t * 0.35)
          const ang = f.phase * Math.PI * 2
          const reach = 0.25 + 0.55 * u
          const edge = at(
            centerRel + Math.cos(ang) * wetSpan * 0.42 * reach,
            Math.sin(ang) * waterWidth * 0.35 * reach,
            0,
          )
          f.b.position = new Cesium.Cartesian3(edge.p.x, edge.p.y, waterTopZ + 0.025)
          f.b.width = f.b.height = 0.28 + u * 0.45
          f.b.color = tinted(Cesium.Color.fromCssColorString('#e9f7ff'), (1 - u) * 0.75 * (showWater ? 1 : 0))
          f.b.show = showWater
        }
        for (const r of ripples) {
          const pulse = fract(r.phase + t * 0.4)
          const spot = at(centerRel + (r.along - 0.5) * wetSpan * 0.65, r.lateral * waterWidth * 0.28, 0)
          r.b.position = new Cesium.Cartesian3(spot.p.x, spot.p.y, waterTopZ + 0.02)
          r.b.width = r.b.height = 0.35 + pulse * 0.55
          r.b.color = tinted(Cesium.Color.fromCssColorString('#b8dde8'), (1 - pulse) * 0.22)
          r.b.show = showWater
        }
        const rainK = clamp01(rain / 42)
        for (const d of drops) {
          const u = fract(d.phase + t * 0.06)
          const along = startRel + u * (endRel - startRel)
          const f = at(along, d.lateral * waterWidth * 0.32, 2.2 * (1 - u))
          d.b.position = f.p
          d.b.width = 0.1
          d.b.height = 0.38
          d.b.color = tinted(Cesium.Color.fromCssColorString('#9fd8ff'), (u < 0.12 ? u * 8 : 1) * 0.55 * rainK)
          d.b.show = rainK > 0.12 && showWater
        }
        alarm.position = new Cesium.Cartesian3(centerPoint.x, centerPoint.y, waterTopZ + 0.15)
        const pulse = fract(t * 0.7)
        alarm.width = alarm.height = 0.7
        alarm.color = tinted(Cesium.Color.RED, 0.35 + (1 - pulse) * 0.4)
        alarm.show = step <= 1 && showWater
        // 水位回落阶段抽排仍持续，设备表、流线和出口强度共用同一个流量读数。
        const pumpStrength = clamp01(pumpFlow / 420)
        const pumping = step >= 1 && pumpStrength > 0.02
        pumpGlow.show = pumping
        pumpGlow.color = tinted(Cesium.Color.fromCssColorString('#4ea6ff'), 0.25 + 0.45 * pumpStrength)
        pumpLine.primitive.show = pumping
        if (pumping) advanceFlow(pumpLine, dt, 0.5 + 1.4 * pumpStrength)
        const jet = fract(t * 1.4)
        outlet.position = new Cesium.Cartesian3(sumpAnchor.p.x, sumpAnchor.p.y, sumpAnchor.p.z + 0.42 + jet * 0.2)
        outlet.width = outlet.height = 0.16 + jet * 0.14
        outlet.color = tinted(Cesium.Color.fromCssColorString('#d7f3ff'), pumping ? (1 - jet) * 0.75 * pumpStrength : 0)
        outlet.show = pumping
        sumpSheet.modelMatrix = Cesium.Matrix4.multiply(
          transform,
          Cesium.Matrix4.multiply(
            localPose({ ...pit, p: new Cesium.Cartesian3(sumpAnchor.p.x, sumpAnchor.p.y, sumpAnchor.p.z + 0.28) }, 0, 0),
            Cesium.Matrix4.fromScale(new Cesium.Cartesian3(0.55, 0.55, 1)),
            new Cesium.Matrix4(),
          ),
          new Cesium.Matrix4(),
        )
        sumpSheet.show = pumping
        const guiding = step === 2 || (step === 3 && k < 0.55)
        const passing = step === 3 && k >= 0.55
        const mode = passing ? 'pass' : guiding ? 'stop' : 'warn'
        if (mode !== boardMode) {
          boardMode = mode
          board.image = vmsBoardUrl(
            passing ? '积水消退 · 恢复通行' : guiding ? '下层积水封闭 · 沿黄线绕行' : '前方 K3+050 积水预警',
            passing ? '双车道开放 · 限速 60km/h' : '请沿诱导线绕行上层通道',
            mode,
          )
        }
        board.show = true
        guideLine.primitive.show = guiding
        if (guiding) advanceFlow(guideLine, dt, 1.1)
        guideDashes.forEach((d) => (d.show = guiding))
        signs.forEach((s) => {
          const shut = guiding && s.lat > 0
          s.closed.show = shut
          s.open.show = !shut
        })
        if (guiding) {
          if (guideAtTime < 0) {
            guideAtTime = t
            detourCars.forEach((c, i) => (c.along = 16 - i * 9))
          }
          const blend = Math.min(1, (t - guideAtTime) / 2.4)
          detourCars.forEach((c) => {
            c.along -= dt * 6.2
            if (c.along < -16) c.along = 22
            const lateral = poolLateral + (driveLane - poolLateral) * blend
            c.v.set(heading(at(c.along, lateral)))
          })
        } else {
          guideAtTime = -1
          detourCars.forEach((c, i) => c.v.set(heading(at(16 + i * 7, poolLateral))))
        }
        const cm = Math.round(levelCm)
        const band = cm >= 25 ? '#d9363e' : cm >= 15 ? '#c46a12' : '#11946a'
        const text = `积水点 W2 · 推演 ${cm}cm`
        if (text !== lastText) {
          levelLabel.text = text
          lastText = text
        }
        if (band !== shownBand) {
          levelLabel.backgroundColor = Cesium.Color.fromCssColorString(band)
          shownBand = band
        }
        levelLabel.position = new Cesium.Cartesian3(centerPoint.x, centerPoint.y, waterTopZ + 1.2)
        levelLabel.show = true
        pumpLabel.show = pumping
        sumpLabel.show = pumping
        detourLabel.show = guiding
      },
    }
  }

  /* ================= 场景：交通事故 ================= */

  function buildAccident(): ScenarioFx {
    const deck: Deck = 'upper'
    const pe = def().eventProgress
    const sign = flowSign(deck)
    // 标线在路线 ±1.8 附近，车身中心收到车道内侧，避免压实线
    const closedLane = -0.82
    const openLane = 0.82
    const rescueLane = 0.82
    const at = (meters: number, lateral = 0, height = 0) =>
      frame(deck, progressBy(deck, pe, meters * sign), lateral, height)
    /** 车辆朝向行车方向 */
    const heading = (f: Frame): Frame =>
      sign > 0 ? f : { ...f, dir: Cesium.Cartesian3.negate(f.dir, new Cesium.Cartesian3()) }

    const len = path(deck).length
    const hitA = addVehicle(4.6, 1.5, 1.45, '#e9edf3')
    const hitB = addVehicle(4.8, 1.55, 1.6, '#2b4a8a')
    const palette = ['#7d8796', '#b8332f', '#d9dde3', '#1f2933', '#3d6b4f', '#c9a227']
    const queue = palette.map((c, i) => ({ v: addVehicle(4.5, 1.5, 1.5, c), gap: 22 + i * 11 }))
    const flow = ['#5c6f8a', '#e0e4ea', '#8a2f2f', '#2f3d4d'].map((c, i) => ({
      v: addVehicle(4.5, 1.5, 1.5, c),
      progress: (i + 0.35) / 4,
    }))
    const rescue = addVehicle(7.2, 1.65, 2.55, '#c8282c')
    const debris = [0, 1, 2, 3, 4].map((i) => ({
      box: addBox(new Cesium.Cartesian3(0.55, 0.16, 0.06), new Cesium.Color(0.1, 0.1, 0.11, 1)),
      i,
    }))
    const hazards = [addSprite('beacon', 0.55, Cesium.Color.ORANGE), addSprite('beacon', 0.55, Cesium.Color.ORANGE)]
    const rescueLights = [addSprite('beacon', 0.4, Cesium.Color.RED), addSprite('beacon', 0.4, Cesium.Color.BLUE)]
    const cones = [
      { along: -40, lateral: -1.95 },
      { along: -34, lateral: -1.95 },
      { along: -28, lateral: -1.95 },
      { along: -22, lateral: -1.95 },
      { along: -16.5, lateral: -1.85 },
      { along: -15.2, lateral: -1.45 },
      { along: -13.8, lateral: -1.1 },
      { along: -12.6, lateral: -0.72 },
    ].map((spot) => addCone(at(spot.along, spot.lateral)))
    const signAt = -6
    const signs = [closedLane, openLane].map((lat) => {
      const f = at(signAt, lat, 2.85)
      const closed = addSprite('laneClosed', 0.78, Cesium.Color.WHITE)
      const open = addSprite('laneOpen', 0.78, Cesium.Color.WHITE)
      closed.position = open.position = f.p
      closed.disableDepthTestDistance = 40
      open.disableDepthTestDistance = 40
      return { lat, closed, open }
    })
    const crashLabel = addLabel('推演事故点 · 两车追尾 · 占用 1 车道', at(0, closedLane, 2.6).p, '#d9363e')
    const controlLabel = addLabel('推演车道管制 · 事故车道封闭', at(signAt, 0, 3.55).p, '#c46a12')
    let disposeAt = -1
    let clearAt = -1

    return {
      focus: at(-3.2, closedLane * 0.35, 0.55).p,
      eventCamera: { along: -18 * sign, lateral: 2.35, height: 3.15 },
      walkFrom: -96 * sign,
      walkTo: -30 * sign,
      onStep: () => applyBaselineVentilation(),
      update(t, dt, step, k) {
        const tel = def().telemetry(step, k)
        const queueM = Number.parseFloat(tel[0].value) || 0
        const speedKmh = Number.parseFloat(tel[1].value) || 40
        const cordon = step === 1 || (step === 2 && k < 0.52)
        const sceneHold = step === 2 && k < 0.52
        const clearing = (step === 2 && k >= 0.52) || step === 3
        if (step === 2) {
          if (disposeAt < 0) disposeAt = t
          if (clearing && clearAt < 0) clearAt = t
        } else if (step === 3) {
          if (clearAt < 0) clearAt = t
        } else {
          disposeAt = -1
          clearAt = -1
        }
        const tow = clearing && clearAt >= 0 ? Math.min(42, (t - clearAt - 0.5) * 8) : 0
        const aAlong = tow
        const bAlong = -9.2 + tow
        const stillInside = (along: number) => {
          const prog = pe + (along * sign) / len
          return prog > 0.004 && prog < 0.996
        }
        const wreckOnScene = !clearing || tow < 38
        hitA.set(wreckOnScene && stillInside(aAlong) ? heading(at(aAlong, closedLane)) : null, 0.05)
        hitB.set(wreckOnScene && stillInside(bAlong) ? heading(at(bAlong, closedLane)) : null, -0.04)
        debris.forEach((d) => {
          const along = -3.1 - d.i * 0.85 + (clearing ? tow * 0.35 : 0)
          const f = at(along, closedLane + (d.i % 2 ? 0.35 : -0.35))
          d.box.modelMatrix = Cesium.Matrix4.multiply(
            transform,
            localPose(f, d.i * 0.35, 0.05),
            new Cesium.Matrix4(),
          )
          d.box.show = cordon || sceneHold
        })
        queue.forEach((q, i) => {
          const visible =
            (step < 2 && queueM >= i * 55 + 8) || step === 2 || (step === 3 && clearing)
          let along = -q.gap
          if (clearing && clearAt >= 0)
            along += Math.max(0, (t - clearAt - 5) * 7.5 - i * 2.6)
          const prog = pe + (along * sign) / len
          q.v.set(visible && prog > 0.004 && prog < 0.996 ? heading(at(along, closedLane)) : null)
        })
        const cruise = Math.max(6, (speedKmh / 3.6) * 0.65)
        const rescueApproach = step === 2 && k < 0.52
        const rescueHold = sceneHold
        const rescueDepart = clearing
        const rescueStop = -18
        const rescueTravel = rescueApproach ? Math.min(1, k / 0.52) : rescueHold ? 1 : -1
        const rescueAlongHold = rescueTravel >= 0 ? -95 + rescueTravel * (95 + rescueStop) : Number.NaN
        const rescueProg = Number.isFinite(rescueAlongHold) ? pe + (rescueAlongHold * sign) / len : Number.NaN
        flow.forEach((c) => {
          const holdForRescue = (rescueApproach || rescueHold) && Number.isFinite(rescueProg)
          if (!(clearing && clearAt >= 0 && t - clearAt > 3.2)) {
            c.progress += (dt * cruise * sign) / len
            if (c.progress >= 1) c.progress -= 1
            if (c.progress < 0) c.progress += 1
          }
          if (holdForRescue) {
            let delta = (c.progress - rescueProg!) * len
            if (delta > len / 2) delta -= len
            if (delta < -len / 2) delta += len
            if (delta * sign <= 0 && Math.abs(delta) < 10) {
              let held = rescueProg! - (10 * sign) / len
              if (held < 0) held += 1
              if (held >= 1) held -= 1
              c.progress = held
            }
          }
          c.v.set(heading(frame(deck, c.progress, openLane, 0)))
        })
        const blink = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6))
        hazards.forEach((h, i) => {
          h.position = at(i === 0 ? 4.2 : -13.2, i === 0 ? closedLane : -2.05, 0.55).p
          h.color = tinted(Cesium.Color.ORANGE, (cordon || sceneHold) ? blink : 0)
          h.show = cordon || sceneHold
        })
        cones.forEach((c) => {
          c.show = cordon
        })
        signs.forEach((s) => {
          const closed = s.lat === closedLane && (cordon || sceneHold)
          s.closed.show = closed
          s.open.show = !closed
        })
        if (rescueApproach || rescueHold) {
          const travel = rescueApproach ? Math.min(1, k / 0.52) : 1
          const along = -95 + travel * (95 + rescueStop)
          rescue.set(heading(at(along, rescueLane)))
          rescueLights.forEach((l, i) => {
            l.position = at(along + (i ? -0.8 : 0.8), rescueLane, 2.5).p
            const on = (Math.sin(t * 8) > 0) === (i === 0)
            l.color = tinted(i === 0 ? Cesium.Color.RED : Cesium.Color.BLUE, on ? 0.85 : 0.15)
            l.show = true
          })
        } else if (rescueDepart && clearAt >= 0) {
          const depart = Math.min(1, Math.max(0, (t - clearAt - 1.2) / 6))
          const along = rescueStop + depart * 90
          if (depart < 1) {
            rescue.set(heading(at(along, openLane)))
            rescueLights.forEach((l, i) => {
              l.position = at(along + (i ? -0.8 : 0.8), openLane, 2.5).p
              const on = (Math.sin(t * 8) > 0) === (i === 0)
              l.color = tinted(i === 0 ? Cesium.Color.RED : Cesium.Color.BLUE, on ? 0.7 : 0.12)
              l.show = true
            })
          } else {
            rescue.set(null)
            rescueLights.forEach((l) => (l.show = false))
          }
        } else {
          rescue.set(null)
          rescueLights.forEach((l) => (l.show = false))
        }
        crashLabel.show = cordon || sceneHold
        controlLabel.show = cordon || sceneHold
      },
    }
  }

  /* ================= 场景：日常巡检 ================= */

  function buildPatrol(): ScenarioFx {
    const deck: Deck = 'lower'
    const p = path(deck)
    const lowerFans = options.fx.rigs
      .map((rig, index) => ({ rig, index }))
      .filter((f) => f.rig.deck === 'lower')
      .map((f) => {
        const c = new Cesium.Cartesian3(...f.rig.center)
        return {
          ...f,
          c,
          progress: nearestRoamingProgress(p, [c.x, c.y, c.z] as Point3).progress,
        }
      })
    // 巡检由 progress=1 端入场向 0 端行进，最后一段发现的风机设为故障停机
    const faulty = lowerFans.reduce((a, b) => (b.progress < a.progress ? b : a), lowerFans[0])
    const fanLabels = lowerFans.map((f) => ({
      ...f,
      label: addLabel(f.rig.name, new Cesium.Cartesian3(f.c.x, f.c.y, f.c.z - 1.1), '#1d6fd1'),
    }))
    const faultBeacon = addSprite('beacon', 0.7, Cesium.Color.RED)
    if (faulty) {
      const side = frame(deck, faulty.progress, 2.2, 0.4)
      faultBeacon.position = new Cesium.Cartesian3(side.p.x, side.p.y, faulty.c.z)
    }
    const faultLabel = faulty
      ? addLabel('推演异常：射流风机停机 · 工单 WO-0317', new Cesium.Cartesian3(faulty.c.x, faulty.c.y, faulty.c.z + 1.2), '#d9363e')
      : null
    const beam = addSprite('glow', 0.55, Cesium.Color.fromCssColorString('#ffe7a0'))
    const footprints = Array.from({ length: 8 }, () => ({
      b: addSprite('beacon', 0.22, Cesium.Color.fromCssColorString('#ffe7a0')),
      phase: Math.random(),
    }))
    let labelAt = 0
    options.fx.setOverride({
      label: '巡检工况',
      mode: 'normal',
      level: (_rig, i) => (faulty && i === faulty.index ? 0 : 0.72),
    })

    return {
      focus: faulty
        ? new Cesium.Cartesian3(faulty.c.x, faulty.c.y, faulty.c.z + 0.4)
        : frame(deck, 0.5, 0, 1.2).p,
      eventCamera: { along: 8, lateral: -2.1, height: 1.85 },
      cameraProgress: faulty?.progress ?? 0.5,
      walkFrom: 0,
      walkTo: 0,
      walkDriven: true,
      update(t, _dt, step) {
        if (t - labelAt > 0.5 || labelAt === 0) {
          labelAt = t
          fanLabels.forEach((f) => {
            const tel = options.fx.telemetryOf(f.index)
            f.label.text = `${f.rig.name.replace('风机_八片扭转叶轮', '射流风机 ')} · ${tel.running ? `${tel.rpm}rpm` : '停机'}（推演）`
            f.label.backgroundColor = Cesium.Color.fromCssColorString(tel.running ? '#1d6fd1' : '#d9363e').withAlpha(0.82)
            f.label.show = step >= 1
          })
        }
        faultBeacon.show = step >= 3
        if (step >= 3) {
          faultBeacon.width = faultBeacon.height = 0.7
          faultBeacon.color = tinted(Cesium.Color.RED, 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4)))
        }
        if (faultLabel) faultLabel.show = step >= 3
        const len = Math.max(path(deck).length, 1)
        const progress = clamp01(1 - walkAlong / len)
        const ahead = clamp01(progress - 7 / len)
        const lamp = frame(deck, ahead, -1.3, 0.15)
        beam.position = lamp.p
        beam.width = beam.height = 0.55
        beam.color = tinted(Cesium.Color.fromCssColorString('#ffe7a0'), 0.45)
        beam.show = true
        footprints.forEach((f, i) => {
          const p = clamp01(progress + (2 + i * 1.1) / len)
          const spot = frame(deck, p, i % 2 ? -0.45 : -0.95, 0.06)
          f.b.position = spot.p
          f.b.width = f.b.height = 0.22
          f.b.color = tinted(Cesium.Color.fromCssColorString('#ffe7a0'), 0.2 + 0.35 * (1 - i / footprints.length))
          f.b.show = true
        })
      },
    }
  }

  /* ================= 相机 ================= */

  function eventFrame(): Frame {
    const d = def()
    const cam = fxScene!.eventCamera
    const deck = d.deck as Deck
    const pe = fxScene.cameraProgress ?? eventBaseProgress()
    return frame(deck, progressBy(deck, pe, cam.along), cam.lateral, cam.height)
  }

  /** 积水贴近洞口真实低点，但向内退一段避开被切断的洞口断面 */
  function floodOriginMeters(): number {
    const length = path('lower').length
    const byFraction = Math.min(Math.max(8, length * 0.04), Math.max(8, length * 0.12))
    return Math.min(length * 0.2, byFraction)
  }

  /** 事件基准进度：积水取洞口内低点，其余取配置 */
  function eventBaseProgress(): number {
    const d = def()
    if (d.id !== 'flood') return d.eventProgress
    return floodOriginMeters() / path('lower').length
  }

  function lookFrom(f: Frame, target: Cesium.Cartesian3) {
    const dest = toWorld(f.p)
    const tgt = toWorld(target)
    const direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(tgt, dest, new Cesium.Cartesian3()), new Cesium.Cartesian3())
    const upW = Cesium.Cartesian3.normalize(
      Cesium.Matrix4.multiplyByPointAsVector(transform, UP, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    )
    const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(direction, upW, new Cesium.Cartesian3()), new Cesium.Cartesian3())
    const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3())
    return { destination: dest, orientation: { direction, up } }
  }

  function setInterior(on: boolean) {
    if (!v || interiorOn === on) return
    interiorOn = on
    const camera = v.camera
    const controller = v.scene.screenSpaceCameraController
    if (on) {
      const saved = {
        near: camera.frustum.near,
        rotate: controller.enableRotate,
        translate: controller.enableTranslate,
        tilt: controller.enableTilt,
        look: controller.enableLook,
        lookTypes: controller.lookEventTypes,
        light: v.scene.light,
      }
      const vv = v
      savedInterior = () => {
        if (vv.isDestroyed()) return
        camera.frustum.near = saved.near
        controller.enableRotate = saved.rotate
        controller.enableTranslate = saved.translate
        controller.enableTilt = saved.tilt
        controller.enableLook = saved.look
        controller.lookEventTypes = saved.lookTypes
        vv.scene.light = saved.light
      }
      camera.frustum.near = 0.05
      controller.enableRotate = false
      controller.enableTranslate = false
      controller.enableTilt = false
      controller.enableLook = true
      controller.lookEventTypes = Cesium.CameraEventType.LEFT_DRAG
      v.scene.light = new Cesium.DirectionalLight({
        direction: Cesium.Cartesian3.clone(camera.directionWC),
        intensity: 2,
      })
    } else {
      savedInterior?.()
      savedInterior = null
    }
  }

  function flyCamera(view: { destination: Cesium.Cartesian3; orientation: { direction: Cesium.Cartesian3; up: Cesium.Cartesian3 } }, duration = 1.3) {
    if (!v) return
    v.camera.cancelFlight()
    if (reducedMotion()) {
      v.camera.setView(view)
      return
    }
    cameraBusy = true
    v.camera.flyTo({
      ...view,
      duration,
      complete: () => (cameraBusy = false),
      cancel: () => (cameraBusy = false),
    })
  }

  function overviewCenter(): Cesium.Cartesian3 {
    return toWorld(fxScene!.focus)
  }

  function enterOverview() {
    if (!v || !fxScene) return
    const center = overviewCenter()
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center)
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4())
    const deck = def().deck as Deck
    const dirW = Cesium.Matrix4.multiplyByPointAsVector(transform, frame(deck, eventBaseProgress()).dir, new Cesium.Cartesian3())
    const dirE = Cesium.Matrix4.multiplyByPointAsVector(inv, dirW, new Cesium.Cartesian3())
    orbitHeading = Math.atan2(dirE.x, dirE.y) + 0.95
    orbitPitch = -0.5
    orbitRange = def().id === 'patrol' ? 260 : 95
    v.camera.cancelFlight()
    cameraBusy = true
    v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 30), {
      offset: new Cesium.HeadingPitchRange(orbitHeading, orbitPitch, orbitRange),
      duration: reducedMotion() ? 0 : 1.4,
      complete: () => {
        cameraBusy = false
        v?.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
      },
      cancel: () => (cameraBusy = false),
    })
  }

  /** 第一人称机位与推演步骤保持一致：切到该视角时不会跳回全程入口 */
  function walkStartAlong(step = state.step, k = state.stepProgress): number {
    const d = def()
    const scene = fxScene!
    if (scene.walkDriven) {
      return (clamp01((step + k) / d.steps.length)) * path(d.deck as Deck).length
    }
    return walkAlongAtStep(scene.walkFrom, scene.walkTo, step, k, d.steps.length)
  }

  function setView(view: TwinView) {
    if (!state.active || !v || !fxScene) return
    // VR 分屏下不做全景环绕，避免头显里出现持续自动转场。
    const target: TwinView = state.stereo && view === 'overview' ? 'event' : view
    state.view = target
    const interior = target !== 'overview'
    setInterior(interior)
    options.setXray(!interior)
    options.fx.setSeeThrough(!interior)
    if (target === 'overview') {
      state.orbit = true
      enterOverview()
    } else if (target === 'event') {
      flyCamera(lookFrom(eventFrame(), fxScene.focus))
    } else {
      walkAlong = walkStartAlong()
      const f = walkFrame()
      const targetPoint = fxScene.walkDriven
        ? Cesium.Cartesian3.add(f.p, f.dir, new Cesium.Cartesian3())
        : fxScene.focus
      flyCamera(lookFrom(f, targetPoint), 1.1)
    }
    v.scene.requestRender()
  }

  /** 第一人称当前机位：巡检沿全线由 1 → 0；其它场景从上游走向事件 */
  function walkFrame(): Frame {
    const d = def()
    const deck = d.deck as Deck
    if (fxScene!.walkDriven) {
      const progress = clamp01(1 - walkAlong / path(deck).length)
      const f = frame(deck, progress, -0.75, 1.62)
      return { ...f, dir: Cesium.Cartesian3.negate(f.dir, new Cesium.Cartesian3()) }
    }
    const f = frame(deck, progressBy(deck, eventBaseProgress(), walkAlong), -0.6, 1.7)
    const towards = Math.sign(fxScene!.walkTo - fxScene!.walkFrom) || 1
    return towards > 0 ? f : { ...f, dir: Cesium.Cartesian3.negate(f.dir, new Cesium.Cartesian3()) }
  }

  function updateCamera(dt: number) {
    if (!v || !fxScene || cameraBusy) return
    const camera = v.camera
    if (interiorOn && v.scene.light instanceof Cesium.DirectionalLight)
      v.scene.light.direction = Cesium.Cartesian3.clone(camera.directionWC, v.scene.light.direction)
    if (state.view === 'overview' && state.orbit && state.playing) {
      orbitHeading += dt * 0.07
      camera.lookAt(overviewCenter(), new Cesium.HeadingPitchRange(orbitHeading, orbitPitch, orbitRange))
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    } else if (state.view === 'walk' && state.playing) {
      const d = def()
      const deck = d.deck as Deck
      if (fxScene.walkDriven) {
        walkAlong = Math.min(path(deck).length, walkAlong + dt * 3 * state.rate)
      } else {
        // 行进速度与四步总时长一致，切步骤或倍速后不会与遥测曲线脱节。
        const total = scenarioDuration(d.steps.map((s) => s.duration))
        const towards = Math.sign(fxScene.walkTo - fxScene.walkFrom) || 1
        const speed = Math.abs(fxScene.walkTo - fxScene.walkFrom) / Math.max(1, total)
        const nextAlong = walkAlong + dt * speed * state.rate * towards
        walkAlong = towards > 0 ? Math.min(fxScene.walkTo, nextAlong) : Math.max(fxScene.walkTo, nextAlong)
      }
      const f = walkFrame()
      const target = fxScene.walkDriven
        ? (() => {
            const ahead = Cesium.Cartesian3.add(
              f.p,
              Cesium.Cartesian3.multiplyByScalar(f.dir, 9, new Cesium.Cartesian3()),
              new Cesium.Cartesian3(),
            )
            ahead.z -= 0.85
            return ahead
          })()
        : fxScene.focus
      camera.setView(lookFrom(f, target))
    }
  }

  /* ================= 推演时钟 ================= */

  function applyStep() {
    fxScene?.onStep?.(state.step)
    syncTelemetry(true)
  }

  function syncTelemetry(force = false) {
    const now = performance.now()
    if (!force && now - telemetryAt < 250) return
    telemetryAt = now
    const d = def()
    state.telemetry = d.telemetry(state.step, state.stepProgress)
    state.devices = d.devices(state.step, state.stepProgress)
  }

  function advance(dt: number) {
    const d = def()
    if (!fxScene || !state.playing) return
    simTime += dt * state.rate
    if (fxScene.walkDriven) {
      const total = path(d.deck as Deck).length
      const overall = clamp01(walkAlong / total) * d.steps.length
      const step = Math.min(d.steps.length - 1, Math.floor(overall))
      state.stepProgress = clamp01(overall - step)
      if (step !== state.step) {
        state.step = step
        applyStep()
      }
      if (walkAlong >= total - 0.01) finish()
      return
    }
    stepElapsed += dt * state.rate
    const duration = d.steps[state.step]?.duration || 12
    state.stepProgress = clamp01(stepElapsed / duration)
    if (stepElapsed >= duration) {
      if (state.step < d.steps.length - 1) {
        state.step++
        stepElapsed = 0
        state.stepProgress = 0
        applyStep()
      } else finish()
    }
  }

  function finish() {
    state.playing = false
    state.finished = true
    state.stepProgress = 1
    syncTelemetry(true)
  }

  function tick(now: number) {
    raf = 0
    if (!state.active || !v || v.isDestroyed()) return
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    advance(dt)
    if (fxScene) fxScene.update(simTime, state.playing ? dt * state.rate : 0, state.step, state.stepProgress)
    updateCamera(dt)
    syncTelemetry()
    v.scene.requestRender()
    raf = requestAnimationFrame(tick)
  }

  /* ================= 生命周期 ================= */

  /** 四类工况启动时先统一接管为常规通风；火灾/巡检构造器再替换为各自的专用计划。 */
  function applyBaselineVentilation() {
    const d = def()
    options.fx.setOverride({
      label: `推演 · ${d.label} · 常规通风`,
      mode: 'normal',
      level: () => 0.72,
      vent: false,
    })
  }

  function buildEffects() {
    if (!v) return
    disposeEffects()
    root = new Cesium.PrimitiveCollection()
    billboards = new Cesium.BillboardCollection({ modelMatrix: transform, scene: v.scene })
    root.add(billboards)
    v.scene.primitives.add(root)
    applyBaselineVentilation()
    const id = state.scenario
    fxScene = id === 'fire' ? buildFire() : id === 'flood' ? buildFlood() : id === 'accident' ? buildAccident() : buildPatrol()
  }

  function disposeEffects() {
    if (root && v && !v.isDestroyed()) v.scene.primitives.remove(root)
    else if (root && !root.isDestroyed()) root.destroy()
    root = null
    billboards = null
    fxScene = null
  }

  function clearError() {
    window.clearTimeout(errorTimer)
    errorTimer = 0
    state.error = ''
  }

  function setError(message: string, transient = false) {
    clearError()
    state.error = message
    if (transient) {
      errorTimer = window.setTimeout(() => {
        if (state.error === message) state.error = ''
        errorTimer = 0
      }, 6500)
    }
  }

  /** 失败、取消或退出时统一回收；只要 onEnter 改过外部状态，就确保 onExit 被调用一次。 */
  function abortPending(message?: string) {
    const hadEnter = enterPending
    cancelAnimationFrame(raf)
    raf = 0
    removeInputs?.()
    removeInputs = null
    options.fx.setOverride(null)
    if (v && !v.isDestroyed()) {
      try {
        setInterior(false)
        if (v.scene.useWebVR) v.scene.useWebVR = false
      } catch {
        /* viewer 可能正在销毁，忽略 */
      }
    }
    options.setXray(false)
    disposeEffects()
    restoreScene?.()
    restoreScene = null
    state.active = false
    state.playing = false
    state.finished = false
    state.stereo = false
    state.telemetry = []
    state.devices = []
    state.loading = false
    v = null
    enterPending = false
    if (hadEnter) options.onExit()
    if (message) setError(message)
  }

  function resetClock(step = 0) {
    const d = def()
    const s = Math.max(0, Math.min(d.steps.length - 1, Math.floor(Number.isFinite(step) ? step : 0)))
    simTime = scenarioDuration(d.steps.slice(0, s).map((x) => x.duration))
    stepElapsed = 0
    state.step = s
    state.stepProgress = 0
    state.finished = false
    // 尊重系统减少动效：进入后停在首帧，用户仍可手动播放/切步。
    state.playing = !reducedMotion()
    last = 0
    walkAlong = fxScene ? walkStartAlong(s, 0) : 0
  }

  function bindInputs(vv: Cesium.Viewer) {
    const canvas = vv.scene.canvas
    /** 拖拽/滚轮代表用户接管观察：暂停自动推演和环绕，而不是每帧把相机抢回去。 */
    const onNavigate = () => {
      if (state.view === 'overview') state.orbit = false
      if (state.playing) {
        state.playing = false
        last = 0
      }
    }
    const onVisibility = () => {
      if (document.hidden && state.playing) {
        state.playing = false
        last = 0
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      // 控件里的空格/方向键交给控件本身；避免按“暂停”按钮时又触发一次全局播放。
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || target?.isContentEditable) return
      if (e.key === 'Escape') {
        if (state.stereo) setStereo(false)
        else stop()
        return
      }
      if (/^(BUTTON|A)$/.test(tag)) return
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') nextStep()
      else if (e.key === 'ArrowLeft') prevStep()
    }
    canvas.addEventListener('pointerdown', onNavigate)
    canvas.addEventListener('wheel', onNavigate, { passive: true })
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      canvas.removeEventListener('pointerdown', onNavigate)
      canvas.removeEventListener('wheel', onNavigate)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }

  async function start(
    id: TwinScenarioId = state.scenario,
    step = 0,
    opts: { restart?: boolean } = {},
  ): Promise<boolean> {
    if (state.loading) return false
    clearError()
    if (state.active) {
      const same = id === state.scenario
      if (!same || opts.restart || state.finished) setScenario(id, step, true)
      else if (step !== state.step) setStep(step)
      return true
    }
    const vv = viewer()
    if (!vv || vv.scene.mode !== Cesium.SceneMode.SCENE3D) {
      setError('请先切换到三维视图，再进入孪生仿真。')
      return false
    }
    const current = ++sequence
    state.loading = true
    enterPending = true
    try {
      options.onEnter()
      const tileset = await options.prepare()
      // stop() 已通过 sequence 接管并完成回收，这里不能再重复 onExit。
      if (current !== sequence) return false
      if (!viewer()) throw new Error('三维场景已释放，无法构建仿真场景。')
      if (!tileset || tileset.isDestroyed()) throw new Error('竣工模型未能加载，无法构建仿真场景。')
      v = vv
      transform = Cesium.Matrix4.clone(tileset.root.computedTransform)
      paths.clear()
      PARTIAL_ROAMING_ROUTES.forEach((r) => paths.set(r.id as Deck, createRoamingPath(r.points as unknown as Point3[])))

      const scene = vv.scene
      const saved = {
        globe: scene.globe.show,
        atmosphere: scene.skyAtmosphere?.show,
        fog: scene.fog.enabled,
        culling: tileset.backFaceCulling,
        sse: tileset.maximumScreenSpaceError,
        tilesets: options.getTilesets().map((t) => ({ t, show: t.show })),
        view: {
          destination: Cesium.Cartesian3.clone(vv.camera.positionWC),
          orientation: {
            direction: Cesium.Cartesian3.clone(vv.camera.directionWC),
            up: Cesium.Cartesian3.clone(vv.camera.upWC),
          },
        },
      }
      restoreScene = () => {
        if (vv.isDestroyed()) return
        setInterior(false)
        if (scene.useWebVR) scene.useWebVR = false
        scene.globe.show = saved.globe
        if (scene.skyAtmosphere && saved.atmosphere !== undefined) scene.skyAtmosphere.show = saved.atmosphere
        scene.fog.enabled = saved.fog
        saved.tilesets.forEach(({ t, show }) => {
          if (!t.isDestroyed()) t.show = show
        })
        if (!tileset.isDestroyed()) {
          tileset.backFaceCulling = saved.culling
          tileset.maximumScreenSpaceError = saved.sse
        }
        vv.camera.cancelFlight()
        vv.camera.flyTo({ ...saved.view, duration: reducedMotion() ? 0 : 0.9 })
      }
      saved.tilesets.forEach(({ t }) => (t.show = t === tileset))
      tileset.show = true
      tileset.backFaceCulling = false
      tileset.maximumScreenSpaceError = Math.min(tileset.maximumScreenSpaceError, 2)
      scene.globe.show = false
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
      scene.fog.enabled = false

      state.scenario = id
      state.active = true
      state.stereo = false
      options.onActivated?.()
      buildEffects()
      resetClock(step)
      applyStep()
      removeInputs = bindInputs(vv)
      setView(fxScene?.walkDriven ? 'walk' : 'event')
      raf = requestAnimationFrame(tick)
      return true
    } catch (err) {
      if (current !== sequence) return false
      abortPending(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      if (current === sequence) state.loading = false
    }
  }

  function setScenario(id: TwinScenarioId, step = 0, restart = false) {
    clearError()
    if (!state.active) {
      state.scenario = id
      state.step = Math.max(0, Math.min(TWIN_SCENARIOS[id].steps.length - 1, Math.floor(step)))
      state.stepProgress = 0
      state.finished = false
      state.playing = false
      state.telemetry = []
      state.devices = []
      return
    }
    if (id === state.scenario && !state.finished && !restart) {
      if (step !== state.step) setStep(step)
      return
    }
    const previousView = state.view
    state.scenario = id
    buildEffects()
    resetClock(step)
    applyStep()
    const view: TwinView = state.stereo
      ? 'event'
      : fxScene?.walkDriven
        ? 'walk'
        : previousView === 'overview'
          ? 'overview'
          : 'event'
    setView(view)
  }

  function stop() {
    sequence++
    const wasLoading = state.loading
    const wasActive = state.active
    if (!wasActive && !wasLoading) {
      clearError()
      return
    }
    abortPending()
    clearError()
  }

  function togglePlay() {
    if (!state.active) return
    if (state.finished) {
      restart()
      return
    }
    state.playing = !state.playing
    last = 0
  }

  function restart() {
    if (!state.active) return
    clearError()
    buildEffects()
    resetClock(0)
    applyStep()
    setView(state.view)
  }

  function setStep(i: number) {
    if (!state.active || !fxScene) return
    const d = def()
    const step = Math.max(0, Math.min(d.steps.length - 1, Math.floor(i)))
    clearError()
    // 手动跳转用于检视：暂停自动推进，避免刚切到某一步就被时钟带走。
    state.playing = false
    state.orbit = false
    state.finished = false
    state.step = step
    state.stepProgress = 0
    stepElapsed = 0
    simTime = scenarioDuration(d.steps.slice(0, step).map((s) => s.duration))
    walkAlong = walkStartAlong(step, 0)
    last = 0
    if (state.view === 'walk' && v) {
      v.camera.cancelFlight()
      const f = walkFrame()
      const target = fxScene.walkDriven
        ? Cesium.Cartesian3.add(f.p, f.dir, new Cesium.Cartesian3())
        : fxScene.focus
      v.camera.setView(lookFrom(f, target))
    }
    applyStep()
  }

  const nextStep = () => setStep(state.step + 1)
  const prevStep = () => setStep(state.step - 1)

  function setRate(rate: 1 | 2 | 4) {
    state.rate = rate === 2 || rate === 4 ? rate : 1
  }

  function setOrbit(on: boolean) {
    state.orbit = on
    if (on && state.view === 'overview') {
      enterOverview()
      state.playing = true
      last = 0
    }
  }

  /** Cesium 立体分屏（Cardboard / WebVR）；正交投影下不可用 */
  function setStereo(on: boolean) {
    const vv = v
    if (!vv || vv.isDestroyed()) return
    if (on && vv.scene.mode !== Cesium.SceneMode.SCENE3D) {
      setError('立体分屏需要三维透视相机；请先退出二维或正交视图。', true)
      return
    }
    try {
      vv.scene.useWebVR = on
      state.stereo = on
      clearError()
      if (on && state.view === 'overview') setView('event')
    } catch (err) {
      state.stereo = false
      try {
        vv.scene.useWebVR = false
      } catch {
        /* ignore */
      }
      setError(err instanceof Error ? err.message : '当前视图不支持立体分屏', true)
    }
    vv.scene.requestRender()
  }

  function destroy() {
    stop()
    clearError()
  }

  return {
    state,
    start,
    stop,
    destroy,
    setScenario,
    togglePlay,
    restart,
    setStep,
    nextStep,
    prevStep,
    setView,
    setRate,
    setOrbit,
    setStereo,
    clearError,
    isActive: () => state.active || state.loading,
  }
}

export type TwinSimulation = ReturnType<typeof useTwinSimulation>
