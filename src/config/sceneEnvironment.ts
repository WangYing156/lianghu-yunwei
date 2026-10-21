export type SceneEnvironmentId = 'default' | 'day' | 'dusk' | 'night'

export interface SceneEnvironment {
  id: SceneEnvironmentId
  label: string
  icon: string
  description: string
  /** 场景背景色 */
  background: string
  /** 地球底色 */
  globeBase: string
  /** 是否显示太阳 */
  sun: boolean
  /** 是否显示月亮 */
  moon: boolean
  /** 方向光强度系数（叠加 preset.ambientBoost） */
  lightFactor: number
  /** 是否启用雾效 */
  fog: boolean
  /** 雾效密度（雾开启时生效） */
  fogDensity: number
  /** 雾色 */
  fogColor: string
  /** 是否开启泛光 */
  bloomBoost: number
}

export const SCENE_ENVIRONMENTS: SceneEnvironment[] = [
  {
    id: 'default',
    label: '深蓝主题',
    icon: '🌌',
    description: '默认暗色氛围，突出 BIM 模型',
    background: '#061224',
    globeBase: '#081830',
    sun: false,
    moon: false,
    lightFactor: 1,
    fog: false,
    fogDensity: 1e-4,
    fogColor: '#061224',
    bloomBoost: 1
  },
  {
    id: 'day',
    label: '白天',
    icon: '☀️',
    description: '明亮自然光，利于工程检视',
    background: '#9fc0e8',
    globeBase: '#8fb2d8',
    sun: true,
    moon: false,
    lightFactor: 1.55,
    fog: false,
    fogDensity: 2e-5,
    fogColor: '#dcebf7',
    bloomBoost: 0.4
  },
  {
    id: 'dusk',
    label: '黄昏',
    icon: '🌇',
    description: '暖色低照度，营造暮色氛围',
    background: '#2a1f3d',
    globeBase: '#332344',
    sun: true,
    moon: false,
    lightFactor: 1.05,
    fog: true,
    fogDensity: 4e-5,
    fogColor: '#d9a06a',
    bloomBoost: 1.1
  },
  {
    id: 'night',
    label: '夜晚',
    icon: '🌙',
    description: '暗色夜景，霓虹与监测灯更突出',
    background: '#050b1a',
    globeBase: '#081226',
    sun: false,
    moon: true,
    lightFactor: 0.82,
    fog: false,
    fogDensity: 2e-5,
    fogColor: '#0a1428',
    bloomBoost: 1.25
  }
]

export function getSceneEnvironment(id: SceneEnvironmentId): SceneEnvironment {
  return SCENE_ENVIRONMENTS.find(e => e.id === id) ?? SCENE_ENVIRONMENTS[0]
}
