/**
 * 孪生仿真 / 风机气流共用的程序化素材：流向材质、水面材质、粒子贴图。
 * 全部程序生成，不依赖 Cesium Assets 静态资源，内网 / 信创环境可直接运行。
 */
import * as Cesium from 'cesium'

/** 流向箭头材质：沿折线 s 方向滚动的 V 形箭头；offset 每帧递增即可驱动流动 */
const FLOW_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  float t = abs(st.t - 0.5) * 2.0;
  float s = fract(st.s * repeat - offset + t * 0.28);
  float head = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.18, 0.62, s));
  float core = 1.0 - t * t;
  m.diffuse = color.rgb;
  m.emission = color.rgb * (0.35 + head * 0.9);
  m.alpha = color.a * clamp(0.1 * core + head * core, 0.0, 1.0);
  return m;
}
`

export function createFlowMaterial(
  color: Cesium.Color,
  repeat: number,
): Cesium.Material {
  return new Cesium.Material({
    translucent: true,
    fabric: {
      uniforms: { color, repeat: Math.max(1, repeat), offset: 0 },
      source: FLOW_SOURCE,
    },
  })
}

/** 水平积水：深处偏青、岸边变浅、掠射角有一层反光，不用沿路重复条纹。 */
const WATER_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec2 uv = materialInput.st;
  vec2 centered = (uv - 0.5) * 2.0;
  float rad = length(centered);
  float shore = smoothstep(0.42, 0.9, rad);
  float edge = 1.0 - smoothstep(0.86, 1.0, rad);
  vec3 n = normalize(materialInput.normalEC);
  vec3 eye = normalize(materialInput.positionToEyeEC);
  float fres = pow(1.0 - clamp(abs(dot(n, eye)), 0.0, 1.0), 1.5);
  float swell = 0.5 + 0.5 * sin(time * 0.8 + rad * 5.0 - atan(centered.y, centered.x));
  vec3 deep = vec3(0.03, 0.26, 0.46);
  vec3 lit = vec3(0.16, 0.58, 0.78);
  vec3 col = mix(deep, lit, 0.62 + shore * 0.16 + swell * 0.1);
  col = mix(col, vec3(0.55, 0.82, 0.92), fres * 0.2 + shore * 0.1);
  m.diffuse = col;
  m.specular = 0.32;
  m.shininess = 16.0;
  m.emission = col * (0.62 + fres * 0.08);
  m.alpha = edge * 0.94;
  return m;
}
`

export function createWaterMaterial(color: Cesium.Color): Cesium.Material {
  return new Cesium.Material({
    translucent: true,
    fabric: { uniforms: { color, time: 0 }, source: WATER_SOURCE },
  })
}

export type SpriteKind =
  | 'smoke'
  | 'flame'
  | 'glow'
  | 'drop'
  | 'beacon'
  | 'laneClosed'
  | 'laneOpen'

const spriteCache = new Map<SpriteKind, string>()

/** 车道指示器：红叉 / 绿色下箭头（与隧道 LCS 车道指示器一致） */
function drawLaneSign(ctx: CanvasRenderingContext2D, open: boolean) {
  ctx.fillStyle = 'rgba(6,14,28,0.92)'
  ctx.fillRect(4, 4, 56, 56)
  ctx.strokeStyle = 'rgba(160,190,230,0.6)'
  ctx.lineWidth = 2
  ctx.strokeRect(4, 4, 56, 56)
  ctx.lineCap = 'round'
  ctx.lineWidth = 7
  if (open) {
    ctx.strokeStyle = '#2ee6a0'
    ctx.beginPath()
    ctx.moveTo(32, 14)
    ctx.lineTo(32, 48)
    ctx.moveTo(18, 34)
    ctx.lineTo(32, 48)
    ctx.lineTo(46, 34)
    ctx.stroke()
  } else {
    ctx.strokeStyle = '#ff4d5e'
    ctx.beginPath()
    ctx.moveTo(17, 17)
    ctx.lineTo(47, 47)
    ctx.moveTo(47, 17)
    ctx.lineTo(17, 47)
    ctx.stroke()
  }
}

/** 径向渐变粒子贴图，dataURL 作为图集 key，同类粒子只占一个图集槽位 */
export function spriteUrl(kind: SpriteKind): string {
  const hit = spriteCache.get(kind)
  if (hit) return hit
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  if (kind === 'laneClosed' || kind === 'laneOpen') {
    drawLaneSign(ctx, kind === 'laneOpen')
    const url = canvas.toDataURL('image/png')
    spriteCache.set(kind, url)
    return url
  }
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  if (kind === 'smoke') {
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else if (kind === 'flame') {
    g.addColorStop(0, 'rgba(255,255,235,1)')
    g.addColorStop(0.25, 'rgba(255,214,90,0.95)')
    g.addColorStop(0.6, 'rgba(255,96,24,0.55)')
    g.addColorStop(1, 'rgba(255,40,0,0)')
  } else if (kind === 'drop') {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else if (kind === 'beacon') {
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.2, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.42, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const url = canvas.toDataURL('image/png')
  spriteCache.set(kind, url)
  return url
}

/** 平面四边形几何（局部 XY 平面，中心原点，边长 1），用于水面 / 地面标识 */
const vmsCache = new Map<string, string>()

/** 隧道可变情报板：黑底 LED 点阵 + 两行诱导文字 */
export function vmsBoardUrl(line1: string, line2: string, tone: 'warn' | 'stop' | 'pass'): string {
  const key = `${tone}|${line1}|${line2}`
  const hit = vmsCache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 180
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#070d16'
  ctx.fillRect(0, 0, 640, 180)
  ctx.strokeStyle = '#8eb4d4'
  ctx.lineWidth = 8
  ctx.strokeRect(6, 6, 628, 168)
  const accent = tone === 'pass' ? '#3dffb0' : tone === 'stop' ? '#ff5a68' : '#ffd24a'
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.strokeRect(16, 16, 608, 148)
  ctx.fillStyle = 'rgba(255,255,255,0.045)'
  for (let x = 24; x < 620; x += 8) {
    for (let y = 24; y < 160; y += 8) ctx.fillRect(x, y, 2, 2)
  }
  ctx.fillStyle = accent
  ctx.font = '700 42px "Microsoft YaHei", sans-serif'
  ctx.fillText(line1, 36, 78)
  ctx.font = '700 32px "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#fff4c8'
  ctx.fillText(line2, 36, 132)
  const url = canvas.toDataURL('image/png')
  vmsCache.set(key, url)
  return url
}

export function createUnitQuadGeometry(): Cesium.Geometry {
  const positions = new Float64Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ])
  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      normal: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      }),
    } as unknown as Cesium.GeometryAttributes,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, 0.75),
  })
}
