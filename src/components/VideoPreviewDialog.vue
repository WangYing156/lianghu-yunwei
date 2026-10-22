<template>
  <el-dialog
    :model-value="!!previewCamera"
    :width="maximized ? 'calc(100vw - 40px)' : 'min(940px, 92vw)'"
    top="8vh"
    :modal="false"
    append-to-body
    draggable
    destroy-on-close
    class="video-preview-dialog"
    @update:model-value="!$event && closeVideoPreview()"
    @closed="stopMedia"
  >
    <template #header>
      <div class="video-dialog-head">
        <span class="camera-indicator"></span
        ><strong>{{ previewCamera?.name }}</strong
        ><span class="video-camera-id">{{ previewCamera?.id }}</span
        ><button
          type="button"
          :aria-label="maximized ? '还原视频窗口' : '放大视频窗口'"
          @click="maximized = !maximized"
        >
          <el-icon><FullScreen /></el-icon>
        </button>
      </div>
    </template>
    <template v-if="previewCamera">
      <div class="video-stage" :class="{ maximized }">
        <video
          v-if="previewCamera.streamUrl && !mediaError"
          ref="videoRef"
          :src="previewCamera.streamUrl"
          controls
          autoplay
          muted
          playsinline
          @error="mediaError = true"
        />
        <img
          v-else-if="!mediaError"
          :src="previewCamera.src"
          :alt="`${previewCamera.name}模拟监控画面`"
          @error="mediaError = true"
        />
        <div v-else class="video-unavailable" role="status">
          <el-icon><VideoCamera /></el-icon><strong>画面暂时不可用</strong
          ><span>请检查媒体资源或稍后重试</span
          ><button type="button" @click="mediaError = false">重新加载</button>
        </div>
        <div class="video-osd">
          <span>{{
            previewCamera.streamUrl ? '授权视频流' : '模拟监控画面'
          }}</span
          ><span>{{ previewCamera.stake }}</span>
        </div>
        <div v-if="previewCamera.event" class="video-event">
          {{ previewCamera.event }}
        </div>
      </div>
      <footer class="video-dialog-foot">
        <span
          ><i></i
          >{{
            previewCamera.streamUrl
              ? '视频监看'
              : '示例图片 / GIF · 未接入实时流'
          }}</span
        ><button
          type="button"
          @click="requestSceneFocus(previewCamera.pointId)"
        >
          <el-icon><Aim /></el-icon>重新定位
        </button>
      </footer>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { Aim, FullScreen, VideoCamera } from '@element-plus/icons-vue'
import {
  previewCamera,
  closeVideoPreview,
} from '../composables/useVideoPreview'
import { requestSceneFocus } from '../composables/useSceneNavigation'
const maximized = ref(false)
const mediaError = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
function stopMedia() {
  videoRef.value?.pause()
}
watch(previewCamera, () => {
  stopMedia()
  mediaError.value = false
  maximized.value = false
})
</script>
<style lang="scss">
.video-preview-dialog.el-dialog {
  padding: 0;
  border: 1px solid #80adc54a;
  border-radius: 12px;
  background: #091c2c;
  box-shadow: 0 24px 90px #0009;
  overflow: hidden;
  --el-dialog-title-font-size: 14px;
  --el-text-color-primary: #d8e8f4;
  .el-dialog__header {
    margin: 0;
    padding: 15px 48px 15px 20px;
    border-bottom: 1px solid #8ab3cf22;
  }
  .el-dialog__body {
    padding: 0;
  }
  .el-dialog__headerbtn {
    top: 0;
    height: 50px;
  }
}
.video-dialog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #d6e5ef;
  font-size: 13px;
  strong {
    font-weight: 500;
  }
  .camera-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8fc5d4;
  }
  .video-camera-id {
    color: #6b8ca3;
    font-size: 10px;
    margin-left: 3px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button {
    margin-left: auto;
    border: none;
    background: transparent;
    color: #8baabf;
    cursor: pointer;
    padding: 2px 8px;
    display: flex;
  }
}
.video-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  max-height: 69vh;
  background: #02090f;
  display: grid;
  place-items: center;
  overflow: hidden;
  &.maximized {
    max-height: 75vh;
  }
  > img,
  > video {
    width: 100%;
    height: 100%;
    max-height: 69vh;
    object-fit: contain;
    display: block;
  }
}
.video-osd {
  position: absolute;
  inset: 16px 18px auto;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  font-size: 11px;
  letter-spacing: 1px;
  color: #e1eaf1;
  text-shadow: 0 1px 4px #000;
  span:first-child {
    padding: 4px 8px;
    background: #071b2bc9;
    border: 1px solid #97c1d22b;
    border-radius: 3px;
    font-size: 10px;
  }
}
.video-event {
  position: absolute;
  bottom: 18px;
  left: 18px;
  padding: 5px 9px;
  border-radius: 3px;
  color: #ffd8ac;
  font-size: 11px;
  background: #5e351ac9;
  border: 1px solid #b77b3b66;
}
.video-dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  color: #728fa5;
  font-size: 11px;
  border-top: 1px solid #88b1c321;
  > span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  i {
    height: 4px;
    width: 4px;
    border-radius: 50%;
    background: #87b3c3;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #a0c5d3;
    border: 1px solid #8bb6ca30;
    border-radius: 5px;
    background: #86b3c60b;
    cursor: pointer;
    padding: 5px 10px;
    font-size: 11px;
  }
}
.video-unavailable {
  display: grid;
  gap: 14px;
  justify-items: center;
  color: #8097ac;
  font-size: 12px;
  .el-icon {
    font-size: 38px;
  }
  strong {
    color: #b6cbd9;
    font-weight: 500;
  }
  button {
    color: #9cc8d5;
    background: #1a3747;
    border: 1px solid #61879966;
    border-radius: 5px;
    padding: 7px 15px;
    cursor: pointer;
  }
}
</style>
