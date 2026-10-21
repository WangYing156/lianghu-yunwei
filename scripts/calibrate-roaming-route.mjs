/**
 * 从竣工 GLB 中名为 malu 的道路上表面提取双层巡游路线。
 * 路线保留 tileset 局部坐标；运行时再应用 root.computedTransform。
 * 替换模型后运行 npm run calibrate:roaming，并现场复核路线。
 */
import { readFile, writeFile } from 'node:fs/promises'

const source = new URL('../public/三维数据/局部隧道竣工模型/NoLod_7.glb', import.meta.url)
const bytes = await readFile(source)
if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('不是有效 GLB')
const jsonLength = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
const binary = bytes.subarray(28 + jsonLength)
const view = (index) => {
  const v = gltf.bufferViews[index]
  return binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
}
const accessor = (index) => {
  const a = gltf.accessors[index]
  const components = { SCALAR: 1, VEC3: 3 }[a.type]
  const readers = { 5126: ['readFloatLE', 4], 5125: ['readUInt32LE', 4], 5123: ['readUInt16LE', 2] }
  const [reader, size] = readers[a.componentType] ?? []
  if (!reader || !components) throw new Error('不支持的道路 accessor')
  const v = gltf.bufferViews[a.bufferView]
  const data = view(a.bufferView)
  return Array.from({ length: a.count * components }, (_, i) =>
    data[reader](
      (a.byteOffset ?? 0) +
        Math.floor(i / components) * (v.byteStride ?? size * components) +
        (i % components) * size,
    ),
  )
}
const table = gltf.extensions.EXT_structural_metadata.propertyTables[0]
const nameProperty = table.properties.name
const offsets = view(nameProperty.stringOffsets)
const names = view(nameProperty.values)
const readOffset = nameProperty.stringOffsetType === 'UINT32' ? 'readUInt32LE' : 'readUInt16LE'
const offsetSize = nameProperty.stringOffsetType === 'UINT32' ? 4 : 2
const featureNames = Array.from({ length: table.count }, (_, i) =>
  names.toString(
    'utf8',
    offsets[readOffset](i * offsetSize),
    offsets[readOffset]((i + 1) * offsetSize),
  ),
)
const roadId = featureNames.indexOf('malu')
if (roadId < 0) throw new Error('未找到 malu 道路构件')
const triangles = []
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    const positions = accessor(primitive.attributes.POSITION)
    const normals = accessor(primitive.attributes.NORMAL)
    const ids = accessor(primitive.attributes._FEATURE_ID_0)
    const indices = accessor(primitive.indices)
    for (let i = 0; i < indices.length; i += 3) {
      const tri = indices.slice(i, i + 3)
      if (tri.some((j) => ids[j] !== roadId || normals[j * 3 + 2] < 0.7)) continue
      triangles.push(tri.map((j) => positions.slice(j * 3, j * 3 + 3)))
    }
  }
}
const routes = [[], []]
// 只覆盖含设备的内部路段，不把进出口外部坡道当作室内路线。
for (let y = -270; y <= 120; y += 15) {
  const segments = []
  for (const triangle of triangles) {
    if (Math.min(...triangle.map((p) => p[1])) >= y || Math.max(...triangle.map((p) => p[1])) <= y)
      continue
    const points = []
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3]
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) {
        const t = (y - a[1]) / (b[1] - a[1])
        points.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t])
      }
    }
    if (points.length === 2) segments.push(points)
  }
  const levels = []
  for (const s of segments.sort((a, b) => a[0][1] + a[1][1] - (b[0][1] + b[1][1]))) {
    const z = (s[0][1] + s[1][1]) / 2
    if (!levels.length || z - levels.at(-1).z > 1) levels.push({ z, segments: [s] })
    else levels.at(-1).segments.push(s)
  }
  const slices = levels.flatMap(({ segments }) => {
    const xs = segments.flatMap((s) => s.map((p) => p[0]))
    const width = Math.max(...xs) - Math.min(...xs)
    const x = (Math.min(...xs) + Math.max(...xs)) / 2
    const zs = segments.flatMap(([a, b]) => {
      if (
        x < Math.min(a[0], b[0]) - 0.01 ||
        x > Math.max(a[0], b[0]) + 0.01 ||
        Math.abs(b[0] - a[0]) < 0.001
      )
        return []
      return [a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
    })
    return zs.length && width > 6 ? [[+x.toFixed(3), y, +Math.max(...zs).toFixed(3)]] : []
  })
  if (slices.length !== 2) throw new Error(`道路断面 ${y} 未识别出两个通行层，请人工校核`)
  slices.forEach((p, i) => routes[i].push(p))
}
const content = `// 由 npm run calibrate:roaming 从竣工模型真实路面提取；单位：米，tileset 局部坐标。\n// 这里记录路面高程，眼高在运行时叠加，不能用包围盒底面代替路面。\nexport const PARTIAL_ROAMING_ROUTES = ${JSON.stringify(
  routes.map((points, i) => ({
    id: i === 0 ? 'lower' : 'upper',
    label: i === 0 ? '下层通道' : '上层通道',
    points,
  })),
  null,
  2,
)} as const\n`
await writeFile(new URL('../src/config/partialRoamingRoutes.ts', import.meta.url), content)
console.log(`已校准 ${routes.length} 条路线，每条 ${routes[0].length} 个路面采样点`)
