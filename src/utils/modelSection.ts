export type SectionAxis = 'x' | 'y' | 'z'
export type SectionTarget = 'all' | 'partial' | 'bim'
export interface SectionState {
  enabled: boolean
  axis: SectionAxis
  position: number
  reverse: boolean
  target: SectionTarget
  ready: boolean
  error: string
}
/** 3D Tiles OBB 在根节点局部系内的平面；支持非轴对齐半轴，按投影求真实范围。 */
export function sectionLocalPlane(
  box: readonly number[],
  axis: SectionAxis,
  position: number,
  reverse: boolean,
) {
  if (box.length !== 12 || !box.every(Number.isFinite))
    throw new Error('无效的模型包围盒')
  const index = { x: 0, y: 1, z: 2 }[axis]
  const extent =
    Math.abs(box[3 + index]) +
    Math.abs(box[6 + index]) +
    Math.abs(box[9 + index])
  const t = Math.min(1, Math.max(0, Number.isFinite(position) ? position : 0.5))
  const coordinate = box[index] + extent * (2 * t - 1)
  const sign = reverse ? -1 : 1
  const normal: [number, number, number] = [0, 0, 0]
  normal[index] = sign
  return { normal, distance: -coordinate * sign, coordinate, extent }
}
