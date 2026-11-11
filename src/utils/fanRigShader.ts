/**
 * 局部竣工模型射流风机叶轮旋转 GLSL 生成器（与渲染引擎解耦，便于单测）。
 *
 * 原理：叶轮在 3D Tiles 1.1 中是独立 feature（_FEATURE_ID_0），顶点阶段按
 * featureId + 圆柱空间守卫（防止同 id 的其它瓦片误命中）绕各自真实轴心做 Rodrigues 旋转；
 * 顶点阶段无法回写法线，故经 varying 把旋转轴/角传到片元阶段再旋转 material.normalEC，
 * 保证转动时高光随叶片走。角度由 CPU 积分（支持启停惯性），GPU 只做纯函数旋转。
 */
import type { PartialFanRig } from '../config/partialFanRig'

const COMPONENTS = ['x', 'y', 'z', 'w'] as const

/** 每 4 台风机共用一个 vec4 uniform */
export function fanUniformSlots(count: number): number {
  return Math.max(1, Math.ceil(count / 4))
}

/** 第 index 台风机的 uniform 分量引用，如 u_fanAngle2.z */
export function fanUniformRef(prefix: 'u_fanAngle' | 'u_fanLevel', index: number) {
  return `${prefix}${Math.floor(index / 4)}.${COMPONENTS[index % 4]}`
}

/** GLSL 浮点字面量：保证带小数点，避免 int/float 隐式转换报错 */
export function glslFloat(n: number, digits = 5): string {
  if (!Number.isFinite(n)) return '0.0'
  const s = n.toFixed(digits)
  return s.includes('.') ? s : `${s}.0`
}

const vec3 = (v: readonly number[]) =>
  `vec3(${glslFloat(v[0])}, ${glslFloat(v[1])}, ${glslFloat(v[2])})`

/** 风机特效共用 varying 名称 */
export const FAN_VARYINGS = ['v_fanMask', 'v_fanLevel', 'v_fanAngle', 'v_fanAxis'] as const

/** 生成顶点着色器：仅改写叶轮顶点，其余构件零开销早退 */
export function buildFanVertexShader(rigs: readonly PartialFanRig[]): string {
  const ids = rigs.map((r) => r.featureId)
  const minId = ids.length ? Math.min(...ids) : 0
  const maxId = ids.length ? Math.max(...ids) : -1
  const branches = rigs
    .map((rig, i) => {
      // 守卫略大于叶轮包络：长度 +10cm，半径 ×1.08 + 2cm
      const halfLen = rig.length / 2 + 0.1
      const radius = rig.radius * 1.08 + 0.02
      return `${i === 0 ? 'if' : 'else if'} (fid == ${rig.featureId}) { c = ${vec3(rig.center)}; a = ${vec3(rig.axis)}; halfLen = ${glslFloat(halfLen)}; radius = ${glslFloat(radius)}; ang = ${fanUniformRef('u_fanAngle', i)}; lvl = ${fanUniformRef('u_fanLevel', i)}; }`
    })
    .join('\n  ')
  return /* glsl */ `
void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
  v_fanMask = 0.0;
  v_fanLevel = 0.0;
  v_fanAngle = 0.0;
  v_fanAxis = vec3(0.0, 0.0, 1.0);
  int fid = int(vsInput.featureIds.featureId_0);
  if (fid < ${minId} || fid > ${maxId}) return;
  vec3 c = vec3(0.0);
  vec3 a = vec3(0.0, 0.0, 1.0);
  float halfLen = 0.0;
  float radius = 0.0;
  float ang = 0.0;
  float lvl = 0.0;
  ${branches || 'if (false) {}'}
  else { return; }
  vec3 d = vsOutput.positionMC - c;
  float along = dot(d, a);
  vec3 radial = d - a * along;
  if (abs(along) > halfLen || dot(radial, radial) > radius * radius) return;
  float cs = cos(ang);
  float sn = sin(ang);
  vsOutput.positionMC = c + a * along + radial * cs + cross(a, radial) * sn;
  v_fanMask = 1.0;
  v_fanLevel = lvl;
  v_fanAngle = ang;
  v_fanAxis = a;
}
`
}

/** 片元：旋转法线 + 运行发光；selectedBody 为选中态 Fresnel 片段（可选） */
export function buildFanFragmentShader(selectedBody = ''): string {
  return /* glsl */ `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  if (v_fanMask > 0.5) {
    vec3 axisEC = normalize(czm_normal * v_fanAxis);
    vec3 nf = material.normalEC;
    float fc = cos(v_fanAngle);
    float fsn = sin(v_fanAngle);
    nf = nf * fc + cross(axisEC, nf) * fsn + axisEC * dot(axisEC, nf) * (1.0 - fc);
    material.normalEC = normalize(nf);
    material.emissive += vec3(0.05, 0.62, 0.88) * 0.22 * clamp(v_fanLevel, 0.0, 1.0);
  }
${selectedBody}
}
`
}
