<template>
  <el-popover
    :width="340"
    trigger="click"
    placement="top"
    popper-class="layer-pop scene-settings-pop"
    :disabled="disabled"
  >
    <template #reference>
      <button
        type="button"
        class="scene-settings-trigger"
        :disabled="disabled"
        title="展开底图、视图、材质与环境设置"
      >
        <el-icon><Setting /></el-icon><span>场景设置</span>
      </button>
    </template>
    <div class="settings-head">
      <span>场景设置</span><small>按需展开 · 保持视野简洁</small>
    </div>
    <el-collapse v-model="expanded" class="scene-settings">
      <el-collapse-item title="底图与二 / 三维视图" name="map">
        <label class="setting-label">视图维度</label>
        <el-radio-group v-model="viewMode" size="small" :disabled="!ready">
          <el-radio-button value="3d">三维模型</el-radio-button>
          <el-radio-button value="2d">二维路线</el-radio-button>
        </el-radio-group>
        <label class="setting-label">底图模式</label>
        <el-radio-group v-model="basemap" size="small">
          <el-radio-button value="reality">实景</el-radio-button>
          <el-radio-button value="satellite">卫星</el-radio-button>
          <el-radio-button value="vector">矢量</el-radio-button>
        </el-radio-group>
        <el-checkbox v-model="basemapEnabled" size="small"
          >显示在线底图</el-checkbox
        >
        <label class="setting-label"
          >正射影像透明度 <span>{{ orthophotoAlpha }}%</span></label
        >
        <el-slider
          v-model="orthophotoAlpha"
          size="small"
          aria-label="正射影像透明度"
        />
        <label class="setting-label"
          >倾斜摄影透明度 <span>{{ obliqueAlpha }}%</span></label
        >
        <el-slider
          v-model="obliqueAlpha"
          size="small"
          aria-label="倾斜摄影透明度"
        />
      </el-collapse-item>
      <el-collapse-item title="模型显示与材质" name="models">
        <div class="model-switches">
          <el-checkbox v-model="showFullTunnel" size="small"
            >完整施工模型</el-checkbox
          >
          <el-checkbox v-model="showPartialTunnel" size="small"
            >局部竣工模型</el-checkbox
          >
        </div>
        <label class="setting-label"
          >施工模型透明度 <span>{{ bimOpacity }}%</span></label
        >
        <el-slider
          v-model="bimOpacity"
          :min="10"
          size="small"
          aria-label="施工模型透明度"
        />
        <label class="setting-label"
          >模型照明强度 <span>{{ bimBrightness }}%</span></label
        >
        <el-slider
          v-model="bimBrightness"
          :min="20"
          size="small"
          aria-label="模型照明强度"
        />
        <el-checkbox v-model="partialXray" size="small"
          >竣工结构透视</el-checkbox
        >
        <el-checkbox v-model="roadXray" size="small">路面透视</el-checkbox>
        <p class="setting-note">
          路面默认保留原始贴图与不透明材质，结构透视不会把道路变成玻璃。
        </p>
        <p class="setting-note">
          内部巡游时将独立显示竣工模型，退出后恢复当前设置。
        </p>
      </el-collapse-item>
      <el-collapse-item title="场景环境" name="environment">
        <el-radio-group
          v-model="environment"
          size="small"
          class="environment-options"
        >
          <el-radio-button
            v-for="item in SCENE_ENVIRONMENTS"
            :key="item.id"
            :value="item.id"
            >{{ item.label }}</el-radio-button
          >
        </el-radio-group>
        <p class="setting-note">
          {{
            SCENE_ENVIRONMENTS.find((e) => e.id === environment)?.description
          }}
        </p>
      </el-collapse-item>
    </el-collapse>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import {
  SCENE_ENVIRONMENTS,
  type SceneEnvironmentId,
} from '../config/sceneEnvironment'
import type {
  BasemapMode,
  MapViewMode,
} from '../composables/useCesiumTunnelMap'

defineProps<{ ready: boolean; disabled: boolean }>()
const expanded = ref<string[]>([])
const basemap = defineModel<BasemapMode>('basemap', { required: true })
const viewMode = defineModel<MapViewMode>('viewMode', { required: true })
const basemapEnabled = defineModel<boolean>('basemapEnabled', {
  required: true,
})
const orthophotoAlpha = defineModel<number>('orthophotoAlpha', {
  required: true,
})
const obliqueAlpha = defineModel<number>('obliqueAlpha', { required: true })
const showFullTunnel = defineModel<boolean>('showFullTunnel', {
  required: true,
})
const showPartialTunnel = defineModel<boolean>('showPartialTunnel', {
  required: true,
})
const bimOpacity = defineModel<number>('bimOpacity', { required: true })
const bimBrightness = defineModel<number>('bimBrightness', { required: true })
const partialXray = defineModel<boolean>('partialXray', { required: true })
const roadXray = defineModel<boolean>('roadXray', { required: true })
const environment = defineModel<SceneEnvironmentId>('environment', {
  required: true,
})
</script>

<style scoped lang="scss">
.scene-settings-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #b2c6da;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #ffffff0c;
    color: #e7f5ff;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e6f1fa;
  font-weight: 600;
  margin-bottom: 10px;
}
.settings-head small {
  font-size: 10px;
  font-weight: 400;
  color: #6e8ba6;
}
.scene-settings {
  --el-collapse-border-color: #97b9d81a;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-header-text-color: #b7d0e7;
  --el-collapse-content-text-color: #91aac2;
  --el-collapse-header-height: 43px;
  :deep(.el-collapse-item__content) {
    padding: 0 4px 14px;
  }
  :deep(.el-checkbox) {
    display: flex;
    margin: 0;
    --el-checkbox-text-color: #a8c0d5;
  }
  :deep(.el-slider) {
    padding: 0 5px;
  }
  :deep(.el-radio-button__inner) {
    font-size: 11px;
    padding: 7px 10px;
  }
}
.setting-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #92abc2;
  margin: 12px 0 8px;
  span {
    color: #cadbe9;
    font-variant-numeric: tabular-nums;
  }
}
.setting-note {
  margin: 10px 0 0;
  color: #718da6;
  font-size: 11px;
  line-height: 1.7;
}
.model-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
}
.environment-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
