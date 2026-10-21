import * as Cesium from 'cesium'

export interface BimAxisFrame {
  /** 沿模型长轴采样的世界坐标中心线（来自 tileset OBB） */
  path: Cesium.Cartesian3[]
  center: Cesium.Cartesian3
  longDir: Cesium.Cartesian3
  sideDir: Cesium.Cartesian3
  upDir: Cesium.Cartesian3
  /** 真实 OBB 半长/半宽/半高（米）——施工/竣工范围线必须用这组 */
  halfLength: number
  halfWidth: number
  halfHeight: number
  /** 内部通行管径（第一人称 / 霓虹描边），不参与范围线 */
  tubeHalfWidth: number
  tubeHalfHeight: number
}

/**
 * 从施工/竣工 3D Tiles 解析世界系 OBB 轴系。
 * half* = 真实包围盒；tube* = 内部漫游用管径近似。
 */
export function extractBimAxisFrame(
  tileset: Cesium.Cesium3DTileset,
  samples = 56
): BimAxisFrame | null {
  const obb = resolveOrientedBox(tileset) ?? buildObbFromRootTransform(tileset)
  if (!obb) {
    const s = tileset.boundingSphere
    if (!s) return null
    return fallbackSphereFrame(s, samples)
  }

  const axes = [0, 1, 2].map(i => {
    const c = Cesium.Matrix3.getColumn(obb.halfAxes, i, new Cesium.Cartesian3())
    return { axis: c, len: Cesium.Cartesian3.magnitude(c) }
  })

  const geodeticUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(obb.center, new Cesium.Cartesian3())
  let upIdx = 0
  let bestAbs = -1
  axes.forEach((a, i) => {
    if (a.len < 1e-6) return
    const dir = Cesium.Cartesian3.normalize(a.axis, new Cesium.Cartesian3())
    const d = Math.abs(Cesium.Cartesian3.dot(dir, geodeticUp))
    if (d > bestAbs) {
      bestAbs = d
      upIdx = i
    }
  })
  const rest = axes.filter((_, i) => i !== upIdx).sort((a, b) => b.len - a.len)
  const long = rest[0]
  const side = rest[1] ?? rest[0]
  const up = axes[upIdx]

  const longDir = Cesium.Cartesian3.normalize(long.axis, new Cesium.Cartesian3())
  const sideDir = Cesium.Cartesian3.normalize(side.axis, new Cesium.Cartesian3())
  let upDir = Cesium.Cartesian3.normalize(up.axis, new Cesium.Cartesian3())
  if (Cesium.Cartesian3.dot(upDir, geodeticUp) < 0) {
    Cesium.Cartesian3.negate(upDir, upDir)
  }

  const halfLength = long.len
  const halfWidth = side.len
  const halfHeight = up.len
  // 管径：取真实半宽/半高的合理上限，供内部视角；范围线仍用真实 half*
  const tubeHalfWidth = Math.min(halfWidth, Math.max(6, Math.min(halfWidth * 0.08, 16)))
  const tubeHalfHeight = Math.min(halfHeight, Math.max(5, Math.min(halfHeight, 18)))

  const path: Cesium.Cartesian3[] = []
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : (i / (samples - 1)) * 2 - 1
    const offset = Cesium.Cartesian3.multiplyByScalar(longDir, halfLength * t, new Cesium.Cartesian3())
    path.push(Cesium.Cartesian3.add(obb.center, offset, new Cesium.Cartesian3()))
  }

  return {
    path,
    center: Cesium.Cartesian3.clone(obb.center),
    longDir,
    sideDir,
    upDir,
    halfLength,
    halfWidth,
    halfHeight,
    tubeHalfWidth,
    tubeHalfHeight
  }
}

export function pointOnBimPath(frame: BimAxisFrame, t: number): {
  position: Cesium.Cartesian3
  heading: number
} {
  const clamped = Math.max(0, Math.min(0.999, t))
  const n = frame.path.length
  const f = clamped * (n - 1)
  const i = Math.floor(f)
  const r = f - i
  const a = frame.path[i]
  const b = frame.path[Math.min(n - 1, i + 1)]
  const position = Cesium.Cartesian3.lerp(a, b, r, new Cesium.Cartesian3())
  const next = frame.path[Math.min(n - 1, i + 1)]
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position)
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4())
  const localNext = Cesium.Matrix4.multiplyByPoint(inv, next, new Cesium.Cartesian3())
  const heading = Math.atan2(localNext.x, localNext.y)
  return { position, heading }
}

/**
 * 施工/竣工模型内部第一人称：沿真实 OBB 中线，落在模型内部通行层。
 * 关键修正：机位高度按「OBB 底部上方约 0.1×半高（夹取 1.4~2.4m）」计算，
 * 而不是用估算的 tubeHalfHeight，确保相机真正位于隧道内部路面附近。
 */
export function bimInteriorEye(
  frame: BimAxisFrame,
  t = 0.45
): { eye: Cesium.Cartesian3; heading: number; pitch: number } {
  const { position, heading } = pointOnBimPath(frame, t)
  // 眼睛高度：贴近 OBB 底面，站在隧道内部
  const eyeH = Math.min(2.4, Math.max(1.4, frame.halfHeight * 0.1))
  const fromBottom = Cesium.Cartesian3.multiplyByScalar(
    frame.upDir,
    -frame.halfHeight + eyeH,
    new Cesium.Cartesian3()
  )
  const eye = Cesium.Cartesian3.add(position, fromBottom, new Cesium.Cartesian3())
  return { eye, heading, pitch: Cesium.Math.toRadians(-2) }
}

/** 与 bimInteriorEye 保持一致的眼部高度（米），供引导箭头对齐 */
export function bimInteriorEyeHeight(frame: BimAxisFrame): number {
  return Math.min(2.4, Math.max(1.4, frame.halfHeight * 0.1))
}

export interface BimGlowShellOptions {
  color?: string
  intensity?: number
  idPrefix?: string
}

/** 伪发光盒已废弃；发光改挂施工范围两侧。 */
export function attachBimGlowShell(
  _viewer: Cesium.Viewer,
  _frame: BimAxisFrame,
  _options: BimGlowShellOptions = {}
): () => void {
  return () => undefined
}

/**
 * 施工模型透明时的「显眼」描边：沿 OBB 12 条边绘制发光线框，
 * 让半透明模型在暗背景下仍清晰可辨（模型越透明，线框越醒目）。
 */
export function attachBimGlowFrame(
  viewer: Cesium.Viewer,
  frame: BimAxisFrame,
  options: { color?: string; width?: number; idPrefix?: string } = {}
): () => void {
  const color = options.color ?? '#67e8f9'
  const width = options.width ?? 3
  const prefix = options.idPrefix ?? 'bim-glowframe'

  const hL = frame.halfLength
  const hW = frame.halfWidth
  const hH = frame.halfHeight
  const corner = (sl: number, sw: number, su: number) => {
    const l = Cesium.Cartesian3.multiplyByScalar(frame.longDir, sl * hL, new Cesium.Cartesian3())
    const w = Cesium.Cartesian3.multiplyByScalar(frame.sideDir, sw * hW, new Cesium.Cartesian3())
    const u = Cesium.Cartesian3.multiplyByScalar(frame.upDir, su * hH, new Cesium.Cartesian3())
    return Cesium.Cartesian3.add(
      Cesium.Cartesian3.add(Cesium.Cartesian3.add(frame.center, l, new Cesium.Cartesian3()), w, new Cesium.Cartesian3()),
      u,
      new Cesium.Cartesian3()
    )
  }
  // 8 角点：long(-1/1) × side(-1/1) × up(-1/1)
  const corners = [
    corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1),
    corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)
  ]
  // 12 条边
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ]
  const entities: Cesium.Entity[] = []
  edges.forEach(([a, b], i) => {
    entities.push(
      viewer.entities.add({
        id: `${prefix}-${i}`,
        polyline: {
          positions: [corners[a], corners[b]],
          width,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: Cesium.Color.fromCssColorString(color).withAlpha(0.95)
          })
        }
      })
    )
  })
  return () => {
    entities.forEach(e => viewer.entities.remove(e))
  }
}

export interface BimFocusFxOptions {
  glowColor?: string
  rimColor?: string
  /** 相对真实半宽的外扩（米）；范围贴模型时建议 0 */
  corridorExtra?: number
  showCorridor?: boolean
  outlineWidth?: number
  idPrefix?: string
  corridorLabel?: string
  /** 范围线颜色 */
  rangeColor?: string
}

/**
 * 施工/竣工范围两侧发光线 + 虚线范围边 + 端头封口虚线。
 * 已移除中心主线霓虹：视觉主线回归三维模型本体，
 * 仅保留「范围边界」辅助线来表达施工/竣工区间。
 */
export function attachBimModelFocusFx(
  viewer: Cesium.Viewer,
  frame: BimAxisFrame,
  options: BimFocusFxOptions = {}
): () => void {
  const extra = options.corridorExtra ?? 0
  const showCorridor = options.showCorridor ?? true
  const prefix = options.idPrefix ?? 'bim-fx'
  const corridorLabel = options.corridorLabel ?? '施工范围'
  const rangeColor = options.rangeColor ?? '#fbbf24'
  const intensity = options.outlineWidth ? Math.min(1, options.outlineWidth / 8) : 0.85

  const entities: Cesium.Entity[] = []

  const addEntity = (id: string, opts: Cesium.Entity.ConstructorOptions) => {
    const existed = viewer.entities.getById(id)
    if (existed) viewer.entities.remove(existed)
    entities.push(viewer.entities.add({ ...opts, id }))
  }

  if (showCorridor) {
    const sideOff = frame.halfWidth + extra
    const lift = 2.0
    ;[-1, 1].forEach((sign, idx) => {
      const positions = frame.path.map(p => {
        const lat = Cesium.Cartesian3.multiplyByScalar(frame.sideDir, sideOff * sign, new Cesium.Cartesian3())
        const up = Cesium.Cartesian3.multiplyByScalar(frame.upDir, lift, new Cesium.Cartesian3())
        return Cesium.Cartesian3.add(Cesium.Cartesian3.add(p, lat, new Cesium.Cartesian3()), up, new Cesium.Cartesian3())
      })
      // 范围两侧发光线（替代伪发光盒）
      addEntity(`${prefix}-side-glow-${idx}`, {
        polyline: {
          positions,
          width: 7 + intensity * 5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.32,
            color: Cesium.Color.fromCssColorString(rangeColor).withAlpha(0.9)
          })
        }
      })
      // 虚线范围边
      addEntity(`${prefix}-range-${idx}`, {
        polyline: {
          positions,
          width: 2.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(rangeColor).withAlpha(0.98),
            dashLength: 16
          })
        }
      })
      addEntity(`${prefix}-range-label-${idx}`, {
        position: positions[Math.floor(positions.length / 2)],
        label: {
          text: sign < 0 ? `${corridorLabel}（左）` : `${corridorLabel}（右）`,
          font: '600 12px "Microsoft YaHei", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#fef3c7'),
          outlineColor: Cesium.Color.fromCssColorString('#78350f'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(20, 12, 4, 0.72)'),
          backgroundPadding: new Cesium.Cartesian2(8, 4)
        }
      })
    })
    ;[0, frame.path.length - 1].forEach((pi, ei) => {
      const p = frame.path[pi]
      const mk = (s: number) => {
        const lat = Cesium.Cartesian3.multiplyByScalar(frame.sideDir, sideOff * s, new Cesium.Cartesian3())
        const up = Cesium.Cartesian3.multiplyByScalar(frame.upDir, lift, new Cesium.Cartesian3())
        return Cesium.Cartesian3.add(Cesium.Cartesian3.add(p, lat, new Cesium.Cartesian3()), up, new Cesium.Cartesian3())
      }
      addEntity(`${prefix}-range-end-${ei}`, {
        polyline: {
          positions: [mk(-1), mk(1)],
          width: 2.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(rangeColor).withAlpha(0.92),
            dashLength: 12
          })
        }
      })
    })
  }

  return () => {
    entities.forEach(e => viewer.entities.remove(e))
  }
}

/**
 * 关闭/恢复 3D Tiles 的背面剔除，使第一人称进入模型内部时，
 * 内壁表面可见（隧道模型多为单面墙，默认从内部会被裁剪掉）。
 * 返回恢复函数，退出内部漫游时可还原。
 */
export function setTilesetBackFaceCulling(
  tileset: Cesium.Cesium3DTileset,
  enabled: boolean
): () => void {
  const touched: Array<{ model: any; prev: boolean }> = []

  const patchModel = (model: any) => {
    if (!model || typeof model.backFaceCulling !== 'boolean') return
    touched.push({ model, prev: model.backFaceCulling })
    model.backFaceCulling = enabled
  }

  const patchContent = (content: any) => {
    if (!content) return
    patchModel(content)
    patchModel(content.model)
    patchModel(content._model)
  }

  const visit = (tile: Cesium.Cesium3DTile) => {
    if (!tile) return
    patchContent((tile as any).content)
    const children = tile.children || []
    for (let i = 0; i < children.length; i++) visit(children[i])
  }

  const onTileLoad = (tile: Cesium.Cesium3DTile) => {
    patchContent((tile as any).content)
  }

  try {
    if (tileset.root) visit(tileset.root)
    tileset.tileLoad.addEventListener(onTileLoad)
  } catch {
    /* ignore traversal errors */
  }

  return () => {
    try {
      tileset.tileLoad.removeEventListener(onTileLoad)
    } catch {
      /* ignore */
    }
    touched.forEach(({ model, prev }) => {
      try {
        model.backFaceCulling = prev
      } catch {
        /* ignore */
      }
    })
  }
}

export function spawnClickPulse(
  viewer: Cesium.Viewer,
  position: Cesium.Cartesian3,
  color = '#22d3ee'
): () => void {
  const ring = viewer.entities.add({
    position,
    ellipse: {
      semiMajorAxis: 8,
      semiMinorAxis: 8,
      height: undefined,
      heightReference: Cesium.HeightReference.NONE,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.42),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(0.95),
      outlineWidth: 3
    }
  })
  const ring2 = viewer.entities.add({
    position,
    ellipse: {
      semiMajorAxis: 4,
      semiMinorAxis: 4,
      heightReference: Cesium.HeightReference.NONE,
      material: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.18),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(0.7),
      outlineWidth: 1.5
    }
  })
  const point = viewer.entities.add({
    position,
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString(color),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  })
  let scale = 8
  let scale2 = 4
  const remove = viewer.scene.postRender.addEventListener(() => {
    scale += 2.2
    scale2 += 1.6
    if (ring.ellipse) {
      ring.ellipse.semiMajorAxis = new Cesium.ConstantProperty(scale)
      ring.ellipse.semiMinorAxis = new Cesium.ConstantProperty(scale)
      const a = Math.max(0, 0.45 - scale / 70)
      ring.ellipse.material = Cesium.Color.fromCssColorString(color).withAlpha(a) as unknown as Cesium.MaterialProperty
    }
    if (ring2.ellipse) {
      ring2.ellipse.semiMajorAxis = new Cesium.ConstantProperty(scale2)
      ring2.ellipse.semiMinorAxis = new Cesium.ConstantProperty(scale2)
      const a2 = Math.max(0, 0.28 - scale2 / 90)
      ring2.ellipse.material = Cesium.Color.fromCssColorString('#ffffff').withAlpha(a2) as unknown as Cesium.MaterialProperty
    }
    if (point.point) {
      point.point.pixelSize = new Cesium.ConstantProperty(Math.max(6, 16 - scale / 6))
    }
    if (scale > 52) {
      remove()
      viewer.entities.remove(ring)
      viewer.entities.remove(ring2)
      viewer.entities.remove(point)
    }
  })
  return () => {
    remove()
    viewer.entities.remove(ring)
    viewer.entities.remove(ring2)
    viewer.entities.remove(point)
  }
}

export function applyInteriorPointLight(
  viewer: Cesium.Viewer,
  anchor: Cesium.Cartesian3,
  intensity = 2.4
) {
  viewer.scene.light = new Cesium.DirectionalLight({
    direction: Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(anchor, viewer.camera.positionWC, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    ),
    intensity
  })
}

function resolveOrientedBox(tileset: Cesium.Cesium3DTileset): Cesium.OrientedBoundingBox | null {
  const root = tileset.root as unknown as {
    boundingVolume?: {
      boundingVolume?: Cesium.OrientedBoundingBox
      _orientedBoundingBox?: Cesium.OrientedBoundingBox
    }
    _boundingVolume?: {
      _orientedBoundingBox?: Cesium.OrientedBoundingBox
    }
  }
  const bv = root.boundingVolume
  if (bv?.boundingVolume?.halfAxes) return bv.boundingVolume
  if (bv?._orientedBoundingBox) return bv._orientedBoundingBox
  if (root._boundingVolume?._orientedBoundingBox) return root._boundingVolume._orientedBoundingBox
  return null
}

function buildObbFromRootTransform(tileset: Cesium.Cesium3DTileset): Cesium.OrientedBoundingBox | null {
  const root = tileset.root as unknown as {
    computedTransform?: Cesium.Matrix4
    transform?: Cesium.Matrix4
    _header?: { boundingVolume?: { box?: number[] } }
    boundingVolume?: { _box?: number[] }
  }
  const box =
    root._header?.boundingVolume?.box ??
    (root.boundingVolume as unknown as { _box?: number[] } | undefined)?._box
  const transform = root.computedTransform ?? root.transform
  if (!box || box.length < 12 || !transform) return null

  const localCenter = new Cesium.Cartesian3(box[0], box[1], box[2])
  const localHalf = Cesium.Matrix3.fromArray([
    box[3], box[4], box[5],
    box[6], box[7], box[8],
    box[9], box[10], box[11]
  ])
  const center = Cesium.Matrix4.multiplyByPoint(transform, localCenter, new Cesium.Cartesian3())
  const rot = Cesium.Matrix4.getMatrix3(transform, new Cesium.Matrix3())
  const halfAxes = Cesium.Matrix3.multiply(rot, localHalf, new Cesium.Matrix3())
  return new Cesium.OrientedBoundingBox(center, halfAxes)
}

function fallbackSphereFrame(sphere: Cesium.BoundingSphere, samples: number): BimAxisFrame {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center)
  const longDir = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian3())
  Cesium.Cartesian3.normalize(longDir, longDir)
  const sideDir = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian3())
  Cesium.Cartesian3.normalize(sideDir, sideDir)
  const upDir = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian3())
  Cesium.Cartesian3.normalize(upDir, upDir)
  const halfLength = Math.max(sphere.radius * 0.85, 80)
  const halfWidth = sphere.radius * 0.12
  const halfHeight = 18
  const path: Cesium.Cartesian3[] = []
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : (i / (samples - 1)) * 2 - 1
    const offset = Cesium.Cartesian3.multiplyByScalar(longDir, halfLength * t, new Cesium.Cartesian3())
    path.push(Cesium.Cartesian3.add(sphere.center, offset, new Cesium.Cartesian3()))
  }
  return {
    path,
    center: Cesium.Cartesian3.clone(sphere.center),
    longDir,
    sideDir,
    upDir,
    halfLength,
    halfWidth,
    halfHeight,
    tubeHalfWidth: Math.min(halfWidth, 14),
    tubeHalfHeight: Math.min(halfHeight, 12)
  }
}

function buildLongitudinalEdges(frame: BimAxisFrame, heightScale: number): Cesium.Cartesian3[][] {
  const h = heightScale
  const w = frame.halfWidth * 0.98
  const offsets: Array<[number, number]> = [
    [-w, h],
    [w, h],
    [-w, -h * 0.2],
    [w, -h * 0.2]
  ]
  return offsets.map(([sw, uh]) =>
    frame.path.map(p => {
      const s = Cesium.Cartesian3.multiplyByScalar(frame.sideDir, sw, new Cesium.Cartesian3())
      const u = Cesium.Cartesian3.multiplyByScalar(frame.upDir, uh, new Cesium.Cartesian3())
      return Cesium.Cartesian3.add(Cesium.Cartesian3.add(p, s, new Cesium.Cartesian3()), u, new Cesium.Cartesian3())
    })
  )
}

function buildEndFrames(frame: BimAxisFrame): Cesium.Cartesian3[][] {
  const ends = [frame.path[0], frame.path[frame.path.length - 1]]
  const w = frame.halfWidth * 0.98
  const h = frame.halfHeight * 0.9
  return ends.map(origin => {
    const corners = [
      [-w, -h * 0.15],
      [-w, h],
      [w, h],
      [w, -h * 0.15],
      [-w, -h * 0.15]
    ]
    return corners.map(([sw, uh]) => {
      const s = Cesium.Cartesian3.multiplyByScalar(frame.sideDir, sw, new Cesium.Cartesian3())
      const u = Cesium.Cartesian3.multiplyByScalar(frame.upDir, uh, new Cesium.Cartesian3())
      return Cesium.Cartesian3.add(Cesium.Cartesian3.add(origin, s, new Cesium.Cartesian3()), u, new Cesium.Cartesian3())
    })
  })
}
