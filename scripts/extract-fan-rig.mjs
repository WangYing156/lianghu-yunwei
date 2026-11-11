/**
 * 从局部竣工模型 glb 中提取射流风机叶轮 / 加压送风口的真实几何（glb 网格局部坐标 positionMC）：
 * 旋转中心、旋转轴、长度、半径、上下层、出风方向、所在瓦片与 featureId。
 * 输出 src/config/partialFanRig.ts，供 CustomShader 原位旋转叶轮、生成气流动效。
 *
 * 用法：node scripts/extract-fan-rig.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelDir = join(root, 'public', '三维数据', '局部隧道竣工模型')
const outFile = join(root, 'src', 'config', 'partialFanRig.ts')
const FAN_KEYWORD = '扭转叶轮'
const VENT_KEYWORD = '加压送风口'

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const READERS = {
  5120: (dv, o) => dv.getInt8(o),
  5121: (dv, o) => dv.getUint8(o),
  5122: (dv, o) => dv.getInt16(o, true),
  5123: (dv, o) => dv.getUint16(o, true),
  5125: (dv, o) => dv.getUint32(o, true),
  5126: (dv, o) => dv.getFloat32(o, true),
}
const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

function parseGlb(file) {
  const buf = readFileSync(file)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const bin = buf.subarray(20 + jsonLen + 8)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  return { json, bin, dv }
}

function readAccessor(glb, index) {
  const { json, dv } = glb
  const acc = json.accessors[index]
  const view = json.bufferViews[acc.bufferView]
  const n = COMPONENTS[acc.type]
  const size = SIZES[acc.componentType]
  const stride = view.byteStride || n * size
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0)
  const read = READERS[acc.componentType]
  const out = new Float64Array(acc.count * n)
  for (let i = 0; i < acc.count; i++)
    for (let c = 0; c < n; c++)
      out[i * n + c] = read(dv, base + i * stride + c * size)
  return out
}

function readStrings(glb, table, prop) {
  const { json, bin } = glb
  const p = table.properties[prop]
  const values = json.bufferViews[p.values]
  const offsets = json.bufferViews[p.stringOffsets]
  const wide = p.stringOffsetType === 'UINT32'
  const odv = new DataView(
    bin.buffer,
    bin.byteOffset + (offsets.byteOffset || 0),
    offsets.byteLength,
  )
  const at = (i) => (wide ? odv.getUint32(i * 4, true) : odv.getUint16(i * 2, true))
  const out = []
  for (let i = 0; i < table.count; i++) {
    const start = bin.byteOffset + (values.byteOffset || 0) + at(i)
    out.push(Buffer.from(bin.buffer, start, at(i + 1) - at(i)).toString('utf8'))
  }
  return out
}

/* ---------- 小型线性代数 ---------- */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const norm = (a) => Math.hypot(a[0], a[1], a[2])
/** 列主序 4x4 × 点 */
const mulPoint = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
const mulVec = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2])
const mulMat = (a, b) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}

/** 3x3 对称矩阵特征分解（Jacobi），按特征值升序 */
function eigenSym(m) {
  const a = m.map((r) => [...r])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 80; sweep++) {
    let p = 0,
      q = 1
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(a[i][j]) > Math.abs(a[p][q])) (p = i), (q = j)
    if (Math.abs(a[p][q]) < 1e-14) break
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1),
      s = t * c
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p],
        akq = a[k][q]
      a[k][p] = c * akp - s * akq
      a[k][q] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k],
        aqk = a[q][k]
      a[p][k] = c * apk - s * aqk
      a[q][k] = s * apk + c * aqk
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p],
        vkq = v[k][q]
      v[k][p] = c * vkp - s * vkq
      v[k][q] = s * vkp + c * vkq
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: a[i][i], vector: [v[0][i], v[1][i], v[2][i]] }))
    .sort((x, y) => x.value - y.value)
}

/** PCA 包围：返回中心（包围盒中心）、三个主轴与各轴全长 */
function pca(pts) {
  const n = pts.length
  const mean = [0, 0, 0]
  pts.forEach((p) => p.forEach((x, k) => (mean[k] += x / n)))
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  pts.forEach((p) => {
    const d = sub(p, mean)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += (d[i] * d[j]) / n
  })
  const axes = eigenSym(cov).map((e) => e.vector)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  pts.forEach((p) => {
    const d = sub(p, mean)
    axes.forEach((a, k) => {
      const t = dot(d, a)
      lo[k] = Math.min(lo[k], t)
      hi[k] = Math.max(hi[k], t)
    })
  })
  let center = [...mean]
  axes.forEach((a, k) => {
    center = center.map((x, i) => x + a[i] * ((lo[k] + hi[k]) / 2))
  })
  return { center, axes, extent: hi.map((h, k) => h - lo[k]) }
}

/* ---------- 读取所有瓦片 ---------- */
const tiles = readdirSync(modelDir)
  .filter((f) => /^NoLod_\d+\.glb$/.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
const devices = []
const tileFeatureIds = new Map()
let nodeChain = null
for (const tile of tiles) {
  const glb = parseGlb(join(modelDir, tile))
  const table = glb.json.extensions?.EXT_structural_metadata?.propertyTables?.[0]
  if (!table) continue
  const names = readStrings(glb, table, 'name')
  const ids = readStrings(glb, table, 'id')
  const nodeMatrix = (node) => {
    if (node.matrix) return node.matrix
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    if (node.translation) [m[12], m[13], m[14]] = node.translation
    return m
  }
  // cesiumlab 输出固定为 rootNode → rtc → mesh
  const chain = glb.json.nodes
    .slice()
    .reverse()
    .reduce((acc, node) => mulMat(acc, nodeMatrix(node)), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  if (nodeChain && nodeChain.some((x, i) => Math.abs(x - chain[i]) > 1e-9))
    throw new Error(`${tile} 节点变换与其它瓦片不一致，无法共享 positionMC 坐标系`)
  nodeChain = chain
  const wanted = new Map()
  names.forEach((name, fid) => {
    if (name.includes(FAN_KEYWORD) || name.includes(VENT_KEYWORD))
      wanted.set(fid, { name, id: ids[fid], pts: [] })
  })
  const prims = []
  for (const mesh of glb.json.meshes)
    for (const prim of mesh.primitives) {
      if (prim.attributes._FEATURE_ID_0 == null) continue
      const pos = readAccessor(glb, prim.attributes.POSITION)
      const fids = readAccessor(glb, prim.attributes._FEATURE_ID_0)
      prims.push({ pos, fids })
      for (let i = 0; i < fids.length; i++) {
        const hit = wanted.get(Math.round(fids[i]))
        if (hit) hit.pts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
      }
    }
  tileFeatureIds.set(tile, prims)
  for (const [featureId, f] of wanted) {
    if (!f.pts.length) continue
    const kind = f.name.includes(FAN_KEYWORD) ? 'fan' : 'vent'
    const { center, axes, extent } = pca(f.pts)
    // 风机：长轴即叶轮旋转轴 / 气流轴线；送风口：最薄方向即出风法向
    const axisIndex = kind === 'fan' ? 2 : 0
    devices.push({
      kind,
      tile,
      featureId,
      elementId: f.id,
      name: f.name,
      center,
      axis: axes[axisIndex],
      length: extent[axisIndex],
      radius: kind === 'fan' ? (extent[0] + extent[1]) / 4 : (extent[1] + extent[2]) / 4,
      deck: '',
    })
  }
}
if (!nodeChain) throw new Error('未找到含 EXT_structural_metadata 的瓦片')

/* ---------- 校验坐标链：positionMC → ECEF，与 scenetree 包围球比对 ---------- */
const tileset = JSON.parse(readFileSync(join(modelDir, 'tileset.json'), 'utf8'))
const rootTransform = tileset.root.transform ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
// Cesium 对 glTF 默认 Y-up → Z-up 轴校正（绕 X 轴 +90°）
const Y_UP_TO_Z_UP = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]
const candidates = {
  axisCorrected: mulMat(mulMat(rootTransform, Y_UP_TO_Z_UP), nodeChain),
  raw: mulMat(rootTransform, nodeChain),
}
const sceneSpheres = new Map()
const scenetree = JSON.parse(readFileSync(join(modelDir, 'scenetree.json'), 'utf8'))
const visit = (n) => {
  if (n.id && n.sphere) sceneSpheres.set(n.id, n.sphere)
  n.children?.forEach(visit)
}
scenetree.scenes?.forEach(visit)
const errors = Object.fromEntries(
  Object.entries(candidates).map(([key, m]) => {
    const errs = devices
      .filter((d) => sceneSpheres.has(d.elementId))
      .map((d) => norm(sub(mulPoint(m, d.center), sceneSpheres.get(d.elementId).slice(0, 3))))
    return [key, errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length)]
  }),
)
const chainKey = errors.axisCorrected <= errors.raw ? 'axisCorrected' : 'raw'
console.log('坐标链平均偏差(m)：', errors, '→ 采用', chainKey)
const toTileFrame = chainKey === 'axisCorrected' ? mulMat(Y_UP_TO_Z_UP, nodeChain) : nodeChain

/* ---------- 上下层与出风方向 ---------- */
const fans = devices.filter((d) => d.kind === 'fan')
const vents = devices.filter((d) => d.kind === 'vent')
// tileset 局部坐标系 Z 即当地铅垂方向
const upMC = (() => {
  const inv = invertRotation(toTileFrame)
  const u = mulVec(inv, [0, 0, 1])
  return scale(u, 1 / norm(u))
})()
function invertRotation(m) {
  // 仅旋转（正交）部分的转置
  return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]
}
const reference = fans[0]?.axis ?? [1, 0, 0]
// 同组（水平 15m 内）存在明显高差（>2m）时按组内高差分层；同高并排的组按两层纵断面拟合线归属
const height = (f) => dot(f.center, upMC)
const station = (f) => dot(f.center, reference)
const groupOf = (fan) => fans.filter((o) => norm(sub(o.center, fan.center)) <= 15)
const fitLine = (list) => {
  const n = list.length
  const sx = list.reduce((s, f) => s + station(f), 0) / n
  const sz = list.reduce((s, f) => s + height(f), 0) / n
  const k =
    list.reduce((s, f) => s + (station(f) - sx) * (height(f) - sz), 0) /
    Math.max(1e-9, list.reduce((s, f) => s + (station(f) - sx) ** 2, 0))
  return (x) => sz + k * (x - sx)
}
const layered = { upper: [], lower: [] }
fans.forEach((fan) => {
  const group = groupOf(fan)
  const hs = group.map(height)
  if (Math.max(...hs) - Math.min(...hs) < 2) return
  fan.deck = height(fan) >= (Math.max(...hs) + Math.min(...hs)) / 2 ? 'upper' : 'lower'
  layered[fan.deck].push(fan)
})
const upperLine = layered.upper.length >= 2 ? fitLine(layered.upper) : null
const lowerLine = layered.lower.length >= 2 ? fitLine(layered.lower) : null
fans.forEach((fan) => {
  if (fan.deck) return
  const h = height(fan)
  fan.deck =
    upperLine && lowerLine
      ? Math.abs(h - upperLine(station(fan))) <= Math.abs(h - lowerLine(station(fan)))
        ? 'upper'
        : 'lower'
      : 'upper'
})
fans.forEach((fan) => {
  let axis = dot(fan.axis, reference) >= 0 ? fan.axis : scale(fan.axis, -1)
  // 双层隧道上下层单向行车，射流方向与行车方向一致、上下层相反
  if (fan.deck === 'lower') axis = scale(axis, -1)
  fan.axis = axis
})
vents.forEach((vent) => {
  const nearest = fans.reduce((best, f) =>
    norm(sub(f.center, vent.center)) < norm(sub(best.center, vent.center)) ? f : best,
  )
  if (nearest && dot(sub(nearest.center, vent.center), vent.axis) < 0)
    vent.axis = scale(vent.axis, -1)
})

/* ---------- 着色器空间判定的误命中检查 ---------- */
const fanIds = new Set(fans.map((f) => f.featureId))
let falseHits = 0
for (const [tile, prims] of tileFeatureIds)
  for (const { pos, fids } of prims)
    for (let i = 0; i < fids.length; i++) {
      const fid = Math.round(fids[i])
      if (!fanIds.has(fid)) continue
      const fan = fans.find((f) => f.featureId === fid)
      if (fan.tile === tile) continue
      const d = sub([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], fan.center)
      const along = dot(d, fan.axis)
      const radial = Math.sqrt(Math.max(0, dot(d, d) - along * along))
      if (Math.abs(along) <= fan.length / 2 + 0.05 && radial <= fan.radius + 0.05) falseHits++
    }
console.log(`其它瓦片同 featureId 且落入叶轮包络的顶点：${falseHits}`)
if (falseHits) throw new Error('着色器空间判定存在误命中，需要改用瓦片级区分')

console.table(
  devices.map((d) => ({
    kind: d.kind,
    tile: d.tile,
    featureId: d.featureId,
    name: d.name,
    deck: d.deck,
    length: +d.length.toFixed(3),
    radius: +d.radius.toFixed(3),
  })),
)

const round = (v, n = 4) => v.map((x) => +x.toFixed(n))
const pack = (d) => ({
  tile: d.tile,
  featureId: d.featureId,
  elementId: d.elementId,
  name: d.name,
  center: round(d.center),
  axis: round(d.axis, 6),
  length: +d.length.toFixed(3),
  radius: +d.radius.toFixed(3),
  ...(d.kind === 'fan' ? { deck: d.deck } : {}),
})
const header = `/**
 * 局部竣工模型风机 / 送风口真实几何（由 scripts/extract-fan-rig.mjs 从 glb 自动提取，勿手改）。
 * center / axis 为 glb 网格局部坐标（CustomShader 的 positionMC），所有瓦片共享同一节点变换。
 */
export interface PartialAirDevice {
  tile: string
  /** 瓦片内 _FEATURE_ID_0 */
  featureId: number
  /** scenetree 构件 id */
  elementId: string
  name: string
  center: [number, number, number]
  /** 风机：射流方向（叶轮旋转轴）；送风口：出风法向 */
  axis: [number, number, number]
  length: number
  radius: number
}
export interface PartialFanRig extends PartialAirDevice {
  deck: 'upper' | 'lower'
}
`
const body = `
/** positionMC → tileset 局部坐标（列主序），运行时再乘 tileset.root.computedTransform */
export const PARTIAL_MC_TO_TILESET: readonly number[] = ${JSON.stringify(toTileFrame)}

export const PARTIAL_FAN_RIGS: readonly PartialFanRig[] = ${JSON.stringify(fans.map(pack), null, 2)}

export const PARTIAL_AIR_VENTS: readonly PartialAirDevice[] = ${JSON.stringify(vents.map(pack), null, 2)}
`
writeFileSync(outFile, header + body)
console.log(`写入风机 ${fans.length} 台、送风口 ${vents.length} 个 → ${outFile}`)
