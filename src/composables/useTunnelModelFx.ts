import * as Cesium from 'cesium'

/** 使用 Cesium 公共属性，切换已加载和后续加载瓦片的背面剔除。 */
export function setTilesetBackFaceCulling(tileset: Cesium.Cesium3DTileset, enabled: boolean): () => void {
  const previous = tileset.backFaceCulling
  tileset.backFaceCulling = enabled
  return () => { if (!tileset.isDestroyed()) tileset.backFaceCulling = previous }
}

/** 短暂、克制的选中反馈；按真实时间播放，不再生成任何包围盒或发光线框。 */
export function spawnClickPulse(viewer: Cesium.Viewer, position: Cesium.Cartesian3, color = '#7dd3fc'): () => void {
  const start = performance.now()
  const marker = viewer.entities.add({
    position,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => 8 + Math.sin(Math.min(1, (performance.now() - start) / 900) * Math.PI) * 8, false),
      color: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
      outlineColor: Cesium.Color.WHITE.withAlpha(0.85), outlineWidth: 1.5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  })
  let disposed = false
  let remove: (() => void) | undefined
  const dispose = () => {
    if (disposed) return
    disposed = true
    remove?.()
    if (!viewer.isDestroyed()) viewer.entities.remove(marker)
  }
  remove = viewer.scene.postRender.addEventListener(() => {
    if (performance.now() - start >= 900) dispose()
  })
  return dispose
}
