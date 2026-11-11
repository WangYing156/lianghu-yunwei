/**
 * 局部竣工模型通风动态特效：射流风机叶轮真实转动 + 气流场（射流羽流 / 吸风 / 车道流向 / 加压送风）。
 *
 * - 叶轮转动：CustomShader 顶点旋转（见 utils/fanRigShader），CPU 积分角度，带启停惯性；
 * - 气流粒子：PointPrimitiveCollection 置于网格局部坐标（modelMatrix = 根变换），小坐标保精度；
 * - 车道流向：沿双层路面真实路线的流动箭头折线，方向取同层风机射流平均方向；
 * - 仅在有风机运转 / 惯性未停时跑 rAF；destroy 时彻底释放 Primitive 与 Shader。
 */
import { reactive } from 'vue'
import * as Cesium from 'cesium'
import {
  PARTIAL_AIR_VENTS,
  PARTIAL_FAN_RIGS,
  PARTIAL_MC_TO_TILESET,
  type PartialAirDevice,
  type PartialFanRig,
} from '../config/partialFanRig'
import { PARTIAL_ROAMING_ROUTES } from '../config/partialRoamingRoutes'
import {
  buildFanFragmentShader,
  buildFanVertexShader,
  fanUniformSlots,
} from '../utils/fanRigShader'
import {
  FRESNEL_FRAGMENT_BODY,
  selectedFresnelUniforms,
} from '../utils/modelMaterials'
import { createFlowMaterial } from '../utils/simulationAssets'

export type VentilationMode = 'normal' | 'exhaust' | 'stop'
export type FanDeck = PartialFanRig['deck']

export interface PartialFxState {
  /** 叶轮转动 */
  spin: boolean
  /** 气流场可视化 */
  airflow: boolean
  mode: VentilationMode
  /** 转速档位 0.2–1 */
  speed: number
  /** 气流穿透显示（外部视角透过结构看到气流） */
  seeThrough: boolean
  /** 内部巡游：车道贴地流向 */
  roamView: boolean
  /** 孪生仿真接管中（UI 只读） */
  overridden: boolean
  overrideLabel: string
  /** 以下为 4Hz 采样的运行摘要 */
  runningFans: number
  avgLevel: number
  fanCount: number
}

export interface FanTelemetry {
  name: string
  deck: FanDeck
  level: number
  rpm: number
  frequency: number
  outletSpeed: number
  direction: string
  running: boolean
}

/** 仿真接管通风：按风机返回目标负荷（0–1）与是否反转 */
export interface VentilationOverride {
  label: string
  mode: VentilationMode
  level?: (rig: PartialFanRig, index: number) => number
  reverse?: (rig: PartialFanRig, index: number) => boolean
  vent?: boolean
  /** 气流粒子色（仿真烟气 / 排烟时区分） */
  tint?: Cesium.Color
}

interface FxOptions {
  getViewer: () => Cesium.Viewer | null
}

const MODE_LEVEL: Record<VentilationMode, number> = {
  normal: 0.72,
  exhaust: 1,
  stop: 0,
}
/** 视觉角速度上限：30fps 下每帧 < 半个叶片间距（8 叶 → 0.39rad），避免车轮效应倒转 */
const MAX_OMEGA = 6.2
const RATED_RPM = 1450
const RATED_HZ = 50
const RATED_OUTLET = 30
const OUT_PER_FAN = 22
const IN_PER_FAN = 6
const VENT_PARTICLES = 26
const PLUME_LENGTH = 16
const RIBBON_HEIGHT = 2.6
const RIBBON_DASH = 7

const COLOR_NORMAL = Cesium.Color.fromCssColorString('#5fe8ff')
const COLOR_EXHAUST = Cesium.Color.fromCssColorString('#ffc27a')
const COLOR_VENT = Cesium.Color.fromCssColorString('#9dffcf')

interface Particle {
  point: Cesium.PointPrimitive
  fan: number
  phase: number
  theta: number
  spread: number
  inflow: boolean
}

interface Basis {
  c: Cesium.Cartesian3
  a: Cesium.Cartesian3
  e1: Cesium.Cartesian3
  e2: Cesium.Cartesian3
}

interface Ribbon {
  deck: FanDeck
  primitive: Cesium.Primitive
  material: Cesium.Material
  sign: 1 | -1
  length: number
}

function basisOf(device: PartialAirDevice): Basis {
  const a = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(...device.axis),
    new Cesium.Cartesian3(),
  )
  const ref =
    Math.abs(a.z) < 0.9 ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.UNIT_X
  const e1 = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(a, ref, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )
  const e2 = Cesium.Cartesian3.cross(a, e1, new Cesium.Cartesian3())
  return { c: new Cesium.Cartesian3(...device.center), a, e1, e2 }
}

const fract = (n: number) => n - Math.floor(n)

export function usePartialTunnelFx(options: FxOptions) {
  const rigs = PARTIAL_FAN_RIGS
  const vents = PARTIAL_AIR_VENTS
  const count = rigs.length
  const slots = fanUniformSlots(count)

  const state = reactive<PartialFxState>({
    spin: true,
    airflow: true,
    mode: 'normal',
    speed: 1,
    seeThrough: true,
    roamView: false,
    overridden: false,
    overrideLabel: '',
    runningFans: 0,
    avgLevel: 0,
    fanCount: count,
  })

  const level = new Float32Array(count)
  const angle = new Float32Array(count)
  const dirSign = new Float32Array(count).fill(1)
  const fanBasis = rigs.map(basisOf)
  const ventBasis = vents.map(basisOf)
  let ventLevel = 0
  let override: VentilationOverride | null = null
  let roamDeck: FanDeck = 'lower'

  let partial: Cesium.Cesium3DTileset | null = null
  let root: Cesium.PrimitiveCollection | null = null
  let points: Cesium.PointPrimitiveCollection | null = null
  let particles: Particle[] = []
  let ventParticles: Particle[] = []
  let ribbons: Ribbon[] = []
  let normalShader: Cesium.CustomShader | null = null
  let selectedShader: Cesium.CustomShader | null = null
  let raf = 0
  let last = 0
  let clock = 0
  let summaryAt = 0
  let removeMorph: Cesium.Event.RemoveCallback | null = null

  const viewer = () => {
    const v = options.getViewer()
    return v && !v.isDestroyed() ? v : null
  }

  /* ---------------- Shader ---------------- */

  function createShader(selected: boolean): Cesium.CustomShader {
    const uniforms: Record<string, { type: Cesium.UniformType; value: unknown }> =
      {}
    for (let i = 0; i < slots; i++) {
      uniforms[`u_fanAngle${i}`] = {
        type: Cesium.UniformType.VEC4,
        value: new Cesium.Cartesian4(),
      }
      uniforms[`u_fanLevel${i}`] = {
        type: Cesium.UniformType.VEC4,
        value: new Cesium.Cartesian4(),
      }
    }
    if (selected) Object.assign(uniforms, selectedFresnelUniforms())
    const shader = new Cesium.CustomShader({
      mode: Cesium.CustomShaderMode.MODIFY_MATERIAL,
      lightingModel: selected ? Cesium.LightingModel.PBR : undefined,
      translucencyMode: selected
        ? Cesium.CustomShaderTranslucencyMode.TRANSLUCENT
        : Cesium.CustomShaderTranslucencyMode.INHERIT,
      uniforms: uniforms as ConstructorParameters<
        typeof Cesium.CustomShader
      >[0]['uniforms'],
      varyings: {
        v_fanMask: Cesium.VaryingType.FLOAT,
        v_fanLevel: Cesium.VaryingType.FLOAT,
        v_fanAngle: Cesium.VaryingType.FLOAT,
        v_fanAxis: Cesium.VaryingType.VEC3,
      },
      vertexShaderText: buildFanVertexShader(rigs),
      fragmentShaderText: buildFanFragmentShader(
        selected ? FRESNEL_FRAGMENT_BODY : '',
      ),
    })
    writeUniforms(shader)
    return shader
  }

  /** 竣工模型当前应挂载的 CustomShader（选中态叠加 Fresnel 高亮） */
  function shaderFor(selected: boolean): Cesium.CustomShader {
    if (selected) return (selectedShader ??= createShader(true))
    return (normalShader ??= createShader(false))
  }

  function writeUniforms(shader: Cesium.CustomShader) {
    for (let s = 0; s < slots; s++) {
      const i = s * 4
      shader.setUniform(
        `u_fanAngle${s}`,
        new Cesium.Cartesian4(angle[i] ?? 0, angle[i + 1] ?? 0, angle[i + 2] ?? 0, angle[i + 3] ?? 0),
      )
      shader.setUniform(
        `u_fanLevel${s}`,
        new Cesium.Cartesian4(level[i] ?? 0, level[i + 1] ?? 0, level[i + 2] ?? 0, level[i + 3] ?? 0),
      )
    }
  }

  /* ---------------- 运行状态 ---------------- */

  const activeMode = () => override?.mode ?? state.mode

  function targetOf(i: number): number {
    if (!state.spin) return 0
    if (override?.level) return Math.max(0, Math.min(1, override.level(rigs[i], i)))
    return MODE_LEVEL[activeMode()] * state.speed
  }

  function reversedOf(i: number): boolean {
    return override?.reverse?.(rigs[i], i) ?? false
  }

  const ventTarget = () =>
    state.spin && (override ? !!override.vent : state.mode === 'exhaust') ? 1 : 0

  function step(dt: number): boolean {
    let moving = false
    for (let i = 0; i < count; i++) {
      // 反转需先减速到 0 再反向加速，符合真实射流风机切换逻辑
      const wantSign = reversedOf(i) ? -1 : 1
      const target = wantSign === dirSign[i] ? targetOf(i) : 0
      const tau = target > level[i] ? 1.6 : 2.4
      level[i] += (target - level[i]) * (1 - Math.exp(-dt / tau))
      if (Math.abs(target - level[i]) < 0.002) level[i] = target
      if (level[i] < 0.01 && wantSign !== dirSign[i]) dirSign[i] = wantSign
      if (level[i] > 0.001) {
        angle[i] = fract((angle[i] + level[i] * MAX_OMEGA * dirSign[i] * dt) / (Math.PI * 2)) * Math.PI * 2
      }
      if (level[i] > 0.001 || level[i] !== target) moving = true
    }
    const vt = ventTarget()
    ventLevel += (vt - ventLevel) * (1 - Math.exp(-dt / 1.2))
    if (Math.abs(vt - ventLevel) < 0.002) ventLevel = vt
    if (ventLevel > 0.001 || ventLevel !== vt) moving = true
    return moving
  }

  /* ---------------- 气流可视化 ---------------- */

  function mcToWorld(ts: Cesium.Cesium3DTileset): Cesium.Matrix4 {
    return Cesium.Matrix4.multiply(
      ts.root.computedTransform,
      Cesium.Matrix4.fromArray([...PARTIAL_MC_TO_TILESET]),
      new Cesium.Matrix4(),
    )
  }

  function buildVisuals(v: Cesium.Viewer, ts: Cesium.Cesium3DTileset) {
    disposeVisuals(v)
    root = new Cesium.PrimitiveCollection()
    points = new Cesium.PointPrimitiveCollection({
      modelMatrix: mcToWorld(ts),
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    })
    const make = (fan: number, k: number, total: number, inflow: boolean): Particle => ({
      point: points!.add({
        position: Cesium.Cartesian3.ZERO,
        pixelSize: inflow ? 3 : 4.2,
        color: Cesium.Color.TRANSPARENT,
        scaleByDistance: new Cesium.NearFarScalar(8, 1.5, 420, 0.4),
        disableDepthTestDistance: 0,
        show: false,
      }),
      fan,
      phase: (k + Math.random() * 0.6) / total,
      theta: Math.random() * Math.PI * 2,
      spread: 0.55 + Math.random() * 0.9,
      inflow,
    })
    particles = []
    for (let f = 0; f < count; f++) {
      for (let k = 0; k < OUT_PER_FAN; k++) particles.push(make(f, k, OUT_PER_FAN, false))
      for (let k = 0; k < IN_PER_FAN; k++) particles.push(make(f, k, IN_PER_FAN, true))
    }
    ventParticles = []
    ventBasis.forEach((_, f) => {
      for (let k = 0; k < VENT_PARTICLES; k++) ventParticles.push(make(f, k, VENT_PARTICLES, false))
    })
    root.add(points)
    applyParticleStyle()
    buildRibbons(ts)
    v.scene.primitives.add(root)
  }

  /** 外部透视看穿结构；巡游时改成车道低空流向，近处放大、仍被洞壁遮挡 */
  function applyParticleStyle() {
    const scale = state.roamView
      ? new Cesium.NearFarScalar(1.2, 2.4, 28, 0.85)
      : new Cesium.NearFarScalar(8, 1.5, 420, 0.4)
    const depth = state.seeThrough ? Number.POSITIVE_INFINITY : state.roamView ? 5 : 0
    const style = (p: Particle) => {
      p.point.pixelSize = state.roamView ? (p.inflow ? 7 : 10) : p.inflow ? 3 : 4.2
      p.point.scaleByDistance = scale
      p.point.disableDepthTestDistance = depth
    }
    particles.forEach(style)
    ventParticles.forEach(style)
  }

  function offsetAlongRoute(
    points: Cesium.Cartesian3[],
    height: number,
    lateral: number,
  ): Cesium.Cartesian3[] {
    return points.map((p, i) => {
      const a = points[Math.max(0, i - 1)]
      const b = points[Math.min(points.length - 1, i + 1)]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return new Cesium.Cartesian3(
        p.x + (-dy / len) * lateral,
        p.y + (dx / len) * lateral,
        p.z + height,
      )
    })
  }

  function deckDirection(deck: FanDeck): Cesium.Cartesian3 {
    const sum = new Cesium.Cartesian3()
    rigs.forEach((r) => {
      if (r.deck === deck) Cesium.Cartesian3.add(sum, new Cesium.Cartesian3(...r.axis), sum)
    })
    return Cesium.Cartesian3.magnitude(sum) > 0
      ? Cesium.Cartesian3.normalize(sum, sum)
      : Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Y)
  }

  function buildRibbons(ts: Cesium.Cesium3DTileset) {
    if (!root) return
    ribbons.forEach((r) => root!.remove(r.primitive))
    ribbons = []
    const lanes = state.roamView
      ? [
          { height: 0.32, lateral: -1.75, width: 8 },
          { height: 0.32, lateral: 1.75, width: 8 },
        ]
      : [{ height: RIBBON_HEIGHT, lateral: 0, width: 12 }]
    PARTIAL_ROAMING_ROUTES.forEach((route) => {
      const deck = route.id as FanDeck
      if (!rigs.some((r) => r.deck === deck)) return
      if (state.roamView && deck !== roamDeck) return
      const base = route.points.map((p) => new Cesium.Cartesian3(p[0], p[1], p[2]))
      if (base.length < 2) return
      lanes.forEach((lane) => addRibbon(ts, deck, offsetAlongRoute(base, lane.height, lane.lateral), lane.width))
    })
  }

  function addRibbon(
    ts: Cesium.Cesium3DTileset,
    deck: FanDeck,
    local: Cesium.Cartesian3[],
    width: number,
  ) {
    if (!root || local.length < 2) return
    const transform = ts.root.computedTransform
    let length = 0
    for (let i = 1; i < local.length; i++)
      length += Cesium.Cartesian3.distance(local[i - 1], local[i])
    const along = Cesium.Cartesian3.subtract(
      local[local.length - 1],
      local[0],
      new Cesium.Cartesian3(),
    )
    const sign: 1 | -1 =
      Cesium.Cartesian3.dot(along, deckDirection(deck)) >= 0 ? 1 : -1
    const positions = local.map((p) =>
      Cesium.Matrix4.multiplyByPoint(transform, p, new Cesium.Cartesian3()),
    )
    const material = createFlowMaterial(
      Cesium.Color.fromCssColorString('#5fe8ff').withAlpha(0),
      length / RIBBON_DASH,
    )
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions,
          width,
          arcType: Cesium.ArcType.NONE,
          vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new Cesium.PolylineMaterialAppearance({
        material,
        translucent: true,
        renderState: state.seeThrough
          ? { depthTest: { enabled: false }, depthMask: false }
          : undefined,
      }),
      asynchronous: false,
      allowPicking: false,
    })
    root.add(primitive)
    ribbons.push({ deck, primitive, material, sign, length })
  }

  const scratch = new Cesium.Cartesian3()
  const scratchColor = new Cesium.Color()

  function particleTint(): Cesium.Color {
    if (override?.tint) return override.tint
    return activeMode() === 'exhaust' ? COLOR_EXHAUST : COLOR_NORMAL
  }

  function placeParticle(p: Particle, basis: Basis, s: number, r: number, theta: number) {
    const { c, a, e1, e2 } = basis
    scratch.x = c.x + a.x * s + (e1.x * Math.cos(theta) + e2.x * Math.sin(theta)) * r
    scratch.y = c.y + a.y * s + (e1.y * Math.cos(theta) + e2.y * Math.sin(theta)) * r
    scratch.z = c.z + a.z * s + (e1.z * Math.cos(theta) + e2.z * Math.sin(theta)) * r
    p.point.position = scratch
  }

  function updateParticles(dt: number) {
    if (!points) return
    const show = state.airflow
    const tint = particleTint()
    for (const p of particles) {
      const L = level[p.fan]
      if (!show || L < 0.03) {
        if (p.point.show) p.point.show = false
        continue
      }
      const rig = rigs[p.fan]
      const sign = dirSign[p.fan]
      const u = fract(p.phase + clock * 0.42 * (0.35 + L))
      let s: number
      let r: number
      let alpha: number
      const theta = p.theta + angle[p.fan] * 0.12 * sign + u * 2.4 * sign
      if (p.inflow) {
        s = -(rig.length / 2 + (1 - u) * 5.2)
        r = rig.radius * (1.9 - 1.3 * u) * p.spread
        alpha = Math.min(1, u * 3) * 0.55
      } else {
        s = rig.length / 2 + u * PLUME_LENGTH * (0.35 + 0.65 * L)
        r = rig.radius * (0.45 + 1.7 * u) * p.spread
        alpha = Math.min(1, u * 8) * Math.pow(1 - u, 1.25) * 0.9
      }
      placeParticle(p, fanBasis[p.fan], s * sign, r, theta)
      p.point.color = Cesium.Color.clone(tint, scratchColor).withAlpha(alpha * Math.min(1, L * 1.4), scratchColor)
      if (!p.point.show) p.point.show = true
    }
    for (const p of ventParticles) {
      const dev = vents[p.fan]
      if (!show || ventLevel < 0.03) {
        if (p.point.show) p.point.show = false
        continue
      }
      const u = fract(p.phase + clock * 0.65)
      const s = dev.length / 2 + u * 5.5
      const r = dev.radius * (0.25 + 0.95 * u) * p.spread
      placeParticle(p, ventBasis[p.fan], s, r, p.theta + u * 0.6)
      p.point.color = Cesium.Color.clone(COLOR_VENT, scratchColor).withAlpha(
        Math.min(1, u * 6) * (1 - u) * 0.85 * ventLevel,
        scratchColor,
      )
      if (!p.point.show) p.point.show = true
    }
    ribbons.forEach((rb) => {
      let sum = 0
      let n = 0
      for (let i = 0; i < count; i++)
        if (rigs[i].deck === rb.deck) {
          sum += level[i] * dirSign[i]
          n++
        }
      const avg = n ? sum / n : 0
      const u = rb.material.uniforms as { offset: number; color: Cesium.Color }
      // 视觉风速约 4.5 m/s × 负荷；offset 单位为箭头周期
      u.offset += (dt * avg * 4.5 * rb.sign) / RIBBON_DASH
      u.color = Cesium.Color.clone(tint, scratchColor).withAlpha(
        show
          ? state.roamView
            ? Math.min(0.95, 0.55 + Math.abs(avg) * 0.45)
            : Math.min(0.85, Math.abs(avg) * 1.1)
          : 0,
        new Cesium.Color(),
      )
      rb.primitive.show = show && Math.abs(avg) > 0.02
    })
  }

  function syncSummary(now: number) {
    if (now - summaryAt < 250) return
    summaryAt = now
    let running = 0
    let sum = 0
    for (let i = 0; i < count; i++) {
      if (level[i] > 0.05) running++
      sum += level[i]
    }
    state.runningFans = running
    state.avgLevel = count ? Math.round((sum / count) * 100) / 100 : 0
  }

  /* ---------------- 主循环 ---------------- */

  function visible(v: Cesium.Viewer): boolean {
    return (
      !!partial &&
      !partial.isDestroyed() &&
      partial.show &&
      v.scene.mode === Cesium.SceneMode.SCENE3D
    )
  }

  function tick(now: number) {
    raf = 0
    const v = viewer()
    if (!v || !partial || partial.isDestroyed()) return
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    clock += dt
    const moving = step(dt)
    if (normalShader) writeUniforms(normalShader)
    if (selectedShader) writeUniforms(selectedShader)
    const show = visible(v)
    if (root) root.show = show
    if (show) updateParticles(dt)
    syncSummary(now)
    if (show) v.scene.requestRender()
    if (moving) raf = requestAnimationFrame(tick)
    else {
      last = 0
      syncSummary(Number.POSITIVE_INFINITY)
      summaryAt = 0
    }
  }

  function ensureLoop() {
    if (raf || !partial) return
    last = 0
    raf = requestAnimationFrame(tick)
  }

  /* ---------------- 生命周期 ---------------- */

  function attach(ts: Cesium.Cesium3DTileset) {
    const v = viewer()
    if (!v) return
    partial = ts
    buildVisuals(v, ts)
    removeMorph?.()
    removeMorph = v.scene.morphComplete.addEventListener(() => ensureLoop())
    ensureLoop()
  }

  function disposeVisuals(v: Cesium.Viewer | null) {
    if (root) {
      if (v && !v.isDestroyed()) v.scene.primitives.remove(root)
      else if (!root.isDestroyed()) root.destroy()
    }
    root = null
    points = null
    particles = []
    ventParticles = []
    ribbons = []
  }

  function detach() {
    cancelAnimationFrame(raf)
    raf = 0
    removeMorph?.()
    removeMorph = null
    disposeVisuals(viewer())
    partial = null
  }

  function destroy() {
    detach()
    // CustomShader.destroy 仅释放其纹理；调用方负责先把 tileset.customShader 置空
    normalShader?.destroy()
    selectedShader?.destroy()
    normalShader = null
    selectedShader = null
    override = null
  }

  /* ---------------- 控制接口 ---------------- */

  function setSpin(on: boolean) {
    state.spin = on
    ensureLoop()
  }

  function setAirflow(on: boolean) {
    state.airflow = on
    ensureLoop()
    if (!on) viewer()?.scene.requestRender()
  }

  function setMode(mode: VentilationMode) {
    state.mode = mode
    ensureLoop()
  }

  function setSpeed(speed: number) {
    state.speed = Math.max(0.2, Math.min(1, speed))
    ensureLoop()
  }

  function setSeeThrough(on: boolean) {
    if (state.seeThrough === on) return
    state.seeThrough = on
    applyParticleStyle()
    if (partial && !partial.isDestroyed()) buildRibbons(partial)
    ensureLoop()
    viewer()?.scene.requestRender()
  }

  /** 内部巡游专用气流：当前层两侧车道贴地流向，近处可见、不被洞壁穿透 */
  function setRoamView(on: boolean, deck?: FanDeck) {
    const nextDeck = deck ?? roamDeck
    if (state.roamView === on && (!on || nextDeck === roamDeck)) return
    roamDeck = nextDeck
    state.roamView = on
    applyParticleStyle()
    if (partial && !partial.isDestroyed()) buildRibbons(partial)
    ensureLoop()
    viewer()?.scene.requestRender()
  }

  function setOverride(next: VentilationOverride | null) {
    override = next
    state.overridden = !!next
    state.overrideLabel = next?.label ?? ''
    ensureLoop()
  }

  /** 构件中心（世界坐标）附近 6m 内的风机实时工况，用于点击弹窗 */
  function fanTelemetryNear(world: Cesium.Cartesian3): FanTelemetry | null {
    if (!partial || partial.isDestroyed()) return null
    const m = mcToWorld(partial)
    let best = -1
    let bestD = 6
    rigs.forEach((rig, i) => {
      const c = Cesium.Matrix4.multiplyByPoint(m, fanBasis[i].c, new Cesium.Cartesian3())
      const d = Cesium.Cartesian3.distance(c, world)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best < 0 ? null : telemetryOf(best)
  }

  function telemetryOf(i: number): FanTelemetry {
    const L = level[i]
    const rig = rigs[i]
    const deckName = rig.deck === 'upper' ? '上层' : '下层'
    return {
      name: rig.name,
      deck: rig.deck,
      level: L,
      rpm: Math.round(L * RATED_RPM),
      frequency: Math.round(L * RATED_HZ * 10) / 10,
      outletSpeed: Math.round(L * RATED_OUTLET * 10) / 10,
      direction: `${deckName}车道 · ${dirSign[i] > 0 ? '正向射流' : '反向射流'}`,
      running: L > 0.05,
    }
  }

  /** 网格局部坐标 → 世界坐标（仿真特效定位复用） */
  function rigWorldCenter(i: number): Cesium.Cartesian3 | null {
    if (!partial || partial.isDestroyed()) return null
    return Cesium.Matrix4.multiplyByPoint(mcToWorld(partial), fanBasis[i].c, new Cesium.Cartesian3())
  }

  return {
    state,
    rigs,
    shaderFor,
    attach,
    detach,
    destroy,
    setSpin,
    setAirflow,
    setMode,
    setSpeed,
    setSeeThrough,
    setRoamView,
    setOverride,
    fanTelemetryNear,
    telemetryOf,
    rigWorldCenter,
  }
}

export type PartialTunnelFx = ReturnType<typeof usePartialTunnelFx>
