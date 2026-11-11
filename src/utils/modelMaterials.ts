import * as Cesium from 'cesium'

/** HIGHLIGHT 模式下白色为中性乘色，保留 GLB 的原始 PBR/贴图。 */
export const ROAD_FEATURE_EXPRESSION =
  "${name} !== undefined && regExp('malu|road|路面|道路|铺装|行车道', 'i').test(${name})"

/** 全局施工模型示意色：#0095FFFF × 4 倍亮度（HDR） */
export const BIM_TINT_CSS = '#0095FF'
export const BIM_TINT_RGB = new Cesium.Cartesian3(0, 149 / 255, 1)
export const BIM_TINT_BRIGHTNESS = 4

/** 设备选中高亮：#FF7702FF × 4 倍亮度（HDR） */
export const SELECTED_TINT_CSS = '#FF7702'
export const SELECTED_TINT_RGB = new Cesium.Cartesian3(1, 119 / 255, 2 / 255)
export const SELECTED_TINT_BRIGHTNESS = 4

export interface ModelMaterialOptions {
  alpha?: number
  roadXray?: boolean
  selectedEquipmentId?: string
  equipmentIds?: readonly string[]
  dimStructure?: boolean
}

/** Cesium 样式解析器不支持 JS 的反斜线转义引号；用不含内部引号的片段拼接。 */
export function styleStringLiteral(value: string): string {
  const parts = value
    .split(/(['"])/)
    .filter(Boolean)
    .map((part) => {
      if (part === "'") return `"'"`
      if (part === '"') return `'"'`
      return `'${part}'`
    })
  return `(${parts.join(' + ') || "''"})`
}

export function modelColorConditions(
  options: ModelMaterialOptions = {},
): string[][] {
  const conditions: string[][] = []
  if (options.selectedEquipmentId)
    conditions.push([
      `\${id} === ${styleStringLiteral(options.selectedEquipmentId)}`,
      `color('${SELECTED_TINT_CSS}', 1.0)`,
    ])
  conditions.push([
    ROAD_FEATURE_EXPRESSION,
    `color('#ffffff', ${options.roadXray ? '0.16' : '1.0'})`,
  ])
  if (options.equipmentIds?.length)
    conditions.push([
      options.equipmentIds
        .map((id) => `\${id} === ${styleStringLiteral(id)}`)
        .join(' || '),
      "color('#ffffff', 1.0)",
    ])
  const alpha = options.dimStructure
    ? 0.025
    : Math.min(1, Math.max(0, options.alpha ?? 1))
  // 施工模型色相/亮度/Fresnel 由 CustomShader 负责；此处仅控制基础透明度
  conditions.push(['true', `color('#ffffff', ${alpha.toFixed(3)})`])
  return conditions
}

/** Fresnel 染色函数体（依赖 u_tint / u_brightness / u_selectMode / u_baseAlpha），可拼入其它 fragmentMain */
export const FRESNEL_FRAGMENT_BODY = /* glsl */ `
  vec3 n = normalize(fsInput.attributes.normalEC);
  vec3 viewDir = normalize(-fsInput.attributes.positionEC);
  float ndotv = clamp(abs(dot(n, viewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.2);
  vec3 tint = u_tint * u_brightness;
  float selectBoost = u_selectMode;
  // 选中模式：仅强化已被样式染成暖橙的构件；全局模式：整模示意染色
  float warmth = material.diffuse.r - material.diffuse.b;
  float isWarm = smoothstep(0.12, 0.35, warmth);
  float mixW = mix(0.78, isWarm, selectBoost);
  material.diffuse = mix(material.diffuse, tint, mixW);
  material.emissive += tint * (0.06 + 0.28 * fresnel) * mix(1.0, isWarm, selectBoost);
  float aBase = clamp(u_baseAlpha, 0.04, 1.0);
  material.alpha = clamp(aBase * mix(0.22, 0.95, fresnel), 0.05, 1.0);
`

const FRESNEL_FRAGMENT = /* glsl */ `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
${FRESNEL_FRAGMENT_BODY}
}
`

/** 选中态 Fresnel 所需 uniform（竣工模型选中 / 风机特效选中共用） */
export function selectedFresnelUniforms(): Record<
  string,
  { type: Cesium.UniformType; value: number | Cesium.Cartesian3 }
> {
  return {
    u_baseAlpha: { type: Cesium.UniformType.FLOAT, value: 0.85 },
    u_tint: { type: Cesium.UniformType.VEC3, value: SELECTED_TINT_RGB },
    u_brightness: {
      type: Cesium.UniformType.FLOAT,
      value: SELECTED_TINT_BRIGHTNESS,
    },
    u_selectMode: { type: Cesium.UniformType.FLOAT, value: 1 },
  }
}

/** 施工模型：#0095FF × 4 + Fresnel 透明度 */
export function createBimFresnelShader(baseAlpha: number): Cesium.CustomShader {
  return new Cesium.CustomShader({
    mode: Cesium.CustomShaderMode.MODIFY_MATERIAL,
    lightingModel: Cesium.LightingModel.PBR,
    translucencyMode: Cesium.CustomShaderTranslucencyMode.TRANSLUCENT,
    uniforms: {
      u_baseAlpha: {
        type: Cesium.UniformType.FLOAT,
        value: Math.max(0.04, Math.min(1, baseAlpha)),
      },
      u_tint: { type: Cesium.UniformType.VEC3, value: BIM_TINT_RGB },
      u_brightness: {
        type: Cesium.UniformType.FLOAT,
        value: BIM_TINT_BRIGHTNESS,
      },
      u_selectMode: { type: Cesium.UniformType.FLOAT, value: 0 },
    },
    fragmentShaderText: FRESNEL_FRAGMENT,
  })
}

/** 竣工选中：#FF7702 × 4 + Fresnel（仅强化暖色选中构件） */
export function createSelectedFresnelShader(): Cesium.CustomShader {
  return new Cesium.CustomShader({
    mode: Cesium.CustomShaderMode.MODIFY_MATERIAL,
    lightingModel: Cesium.LightingModel.PBR,
    translucencyMode: Cesium.CustomShaderTranslucencyMode.TRANSLUCENT,
    uniforms: {
      u_baseAlpha: { type: Cesium.UniformType.FLOAT, value: 0.85 },
      u_tint: { type: Cesium.UniformType.VEC3, value: SELECTED_TINT_RGB },
      u_brightness: {
        type: Cesium.UniformType.FLOAT,
        value: SELECTED_TINT_BRIGHTNESS,
      },
      u_selectMode: { type: Cesium.UniformType.FLOAT, value: 1 },
    },
    fragmentShaderText: FRESNEL_FRAGMENT,
  })
}

export function updateBimFresnelAlpha(
  shader: Cesium.CustomShader | undefined,
  baseAlpha: number,
) {
  if (!shader) return
  try {
    shader.setUniform('u_baseAlpha', Math.max(0.04, Math.min(1, baseAlpha)))
  } catch {
    /* shader disposed */
  }
}
