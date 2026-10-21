export type SceneVisualPresetId = 'neon-tunnel' | 'engineering'

export interface SceneVisualPreset {
  id: SceneVisualPresetId
  label: string
  description: string
  loadOblique: boolean
  loadBim: boolean
  loadPartial: boolean
  obliqueSse: number
  bimSse: number
  partialSse: number
  /** 倾斜摄影底色（hex，不含透明度）——透明度由 UI 的 obliqueAlpha 实时控制 */
  obliqueTint: string
  /** 竣工模型材质染色（hex）——偏暖色，与施工模型（原始材质）区分 */
  partialTint: string
  /** 施工模型默认不透明度（0-100） */
  bimOpacityDefault: number
  /** 竣工模型默认不透明度（0-100） */
  partialOpacityDefault: number
  bloom: boolean
  bloomIntensity: number
  ambientBoost: number
  pulseLight: boolean
}

export const SCENE_VISUAL_PRESETS: SceneVisualPreset[] = [
  {
    id: 'neon-tunnel',
    label: '霓虹隧道',
    description: '暗色霓虹氛围 · 施工青蓝 / 竣工琥珀 · 实心材质',
    loadOblique: true,
    loadBim: true,
    loadPartial: true,
    obliqueSse: 12,
    bimSse: 5,
    partialSse: 5,
    obliqueTint: '#1e2a3e',
    partialTint: '#ffc87a',
    bimOpacityDefault: 100,
    partialOpacityDefault: 100,
    bloom: true,
    bloomIntensity: 1.15,
    ambientBoost: 1.62,
    pulseLight: true
  },
  {
    id: 'engineering',
    label: '工程检视',
    description: '透视查看内部构造 · 施工/竣工半透明可调',
    loadOblique: true,
    loadBim: true,
    loadPartial: true,
    obliqueSse: 14,
    bimSse: 4,
    partialSse: 4,
    obliqueTint: '#3a4a5f',
    partialTint: '#ffd9a0',
    bimOpacityDefault: 60,
    partialOpacityDefault: 72,
    bloom: false,
    bloomIntensity: 0.55,
    ambientBoost: 1.9,
    pulseLight: false
  }
]

export function getSceneVisualPreset(id: SceneVisualPresetId): SceneVisualPreset {
  return SCENE_VISUAL_PRESETS.find(p => p.id === id) ?? SCENE_VISUAL_PRESETS[0]
}

export const LIANGHU_ORTHO_TMS =
  'https://swks.hysz.co/clab/tile/image/tms/QWHgJUDe/{z}/{x}/{reverseY}.png'

export const LIANGHU_ORTHO_RECT = {
  west: 114.346,
  south: 30.4551,
  east: 114.373,
  north: 30.5326
}
