import { shallowRef } from 'vue'
import type { MonitoringCamera } from '../config/cctvGallery'
import { requestSceneFocus } from './useSceneNavigation'

export const previewCamera = shallowRef<MonitoringCamera | null>(null)
export function openVideoPreview(camera: MonitoringCamera) {
  previewCamera.value = camera
  requestSceneFocus(camera.pointId)
}
export function closeVideoPreview() {
  previewCamera.value = null
}
