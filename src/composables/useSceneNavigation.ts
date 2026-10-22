import { shallowRef } from 'vue'

export interface SceneFocusRequest {
  id: string
  sequence: number
}
// 单次、可消费的场景导航；不会在切换模块后重放上一页的定位命令。
export const sceneFocusRequest = shallowRef<SceneFocusRequest | null>(null)
let sequence = 0
export function requestSceneFocus(id: string) {
  sceneFocusRequest.value = { id, sequence: ++sequence }
}
export function consumeSceneFocus(current: number) {
  if (sceneFocusRequest.value?.sequence === current)
    sceneFocusRequest.value = null
}
