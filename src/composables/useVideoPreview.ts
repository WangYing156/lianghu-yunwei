import { shallowRef } from 'vue'
import type { MonitoringCamera } from '../config/cctvGallery'

export const previewCamera = shallowRef<MonitoringCamera | null>(null)
/** 仅打开画面，不自动聚焦场景；定位由弹窗内「定位」按钮显式触发 */
export function openVideoPreview(camera: MonitoringCamera) {
  previewCamera.value = camera
}
export function closeVideoPreview() {
  previewCamera.value = null
}
