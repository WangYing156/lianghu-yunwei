export interface RoamingState {
  active: boolean
  loading: boolean
  playing: boolean
  progress: number
  speed: number
  direction: 1 | -1
  layer: 'lower' | 'upper'
  eyeHeight: number
  lateralOffset: number
  length: number
  roadXray: boolean
  dimStructure: boolean
  selectedEquipmentId: string
  error: string
}
