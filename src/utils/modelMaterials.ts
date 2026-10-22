/** HIGHLIGHT 模式下白色为中性乘色，保留 GLB 的原始 PBR/贴图。 */
export const ROAD_FEATURE_EXPRESSION =
  "${name} !== undefined && regExp('malu|road|路面|道路|铺装|行车道', 'i').test(${name})"
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
      "color('#ffdfa3', 1.0)",
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
  conditions.push(['true', `color('#ffffff', ${alpha.toFixed(3)})`])
  return conditions
}
