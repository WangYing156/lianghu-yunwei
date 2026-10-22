<template>
  <section
    class="roaming-panel"
    aria-label="竣工模型内部巡游控制"
    @pointerdown.stop
    @wheel.stop
  >
    <div class="roaming-head">
      <div class="roaming-title">
        <span
          class="roaming-indicator"
          :class="{ playing: state.playing }"
        ></span
        ><strong>内部巡游</strong
        ><span class="roaming-subtitle">AS-BUILT INSPECTION</span>
      </div>
      <button
        class="roaming-icon"
        type="button"
        aria-label="退出内部巡游"
        title="退出并恢复外部视角（Esc）"
        @click="emit('exit')"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>
    <div v-if="state.error" class="roaming-message" role="alert">
      <p>{{ state.error }}</p>
      <button
        class="roaming-button primary"
        type="button"
        @click="emit('start')"
      >
        重新尝试
      </button>
    </div>
    <div v-else-if="state.loading" class="roaming-message" role="status">
      <span class="loading-dot"></span>正在准备竣工模型与设备目录…
    </div>
    <template v-else-if="state.active">
      <div class="roaming-route">
        <el-radio-group
          :model-value="state.layer"
          size="small"
          @update:model-value="
            (value) => emit('layer', value as RoamingState['layer'])
          "
        >
          <el-radio-button value="lower">下层通道</el-radio-button
          ><el-radio-button value="upper">上层通道</el-radio-button>
        </el-radio-group>
        <span class="roaming-distance"
          >{{ Math.round(state.progress * state.length) }}
          <small>/ {{ Math.round(state.length) }} m</small></span
        >
      </div>
      <label class="roaming-track"
        ><span class="sr-only">巡游进度</span
        ><input
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="Math.round(state.progress * 1000)"
          :style="{ '--progress': `${state.progress * 100}%` }"
          @input="
            emit(
              'seek',
              Number(($event.target as HTMLInputElement).value) / 1000,
            )
          "
      /></label>
      <div class="roaming-controls">
        <button
          type="button"
          class="roaming-icon"
          aria-label="回到巡游入口端"
          title="回到当前路线末端，从入口朝内部巡游"
          @click="emit('entry')"
        >
          <el-icon><RefreshLeft /></el-icon>
        </button>
        <button
          type="button"
          class="roaming-button primary"
          :aria-label="state.playing ? '暂停巡游' : '继续巡游'"
          @click="emit('play')"
        >
          <el-icon
            ><VideoPause v-if="state.playing" /><VideoPlay v-else /></el-icon
          >{{ state.playing ? '暂停巡游' : '继续巡游' }}
        </button>
        <button
          type="button"
          class="roaming-button"
          title="切换巡游方向"
          @click="emit('reverse')"
        >
          <el-icon><Switch /></el-icon
          >{{ state.direction === -1 ? '向起点' : '向终点' }}
        </button>
        <label class="speed-label"
          ><span class="sr-only">巡游速度</span
          ><select
            :value="state.speed"
            aria-label="巡游速度"
            @change="
              emit('speed', Number(($event.target as HTMLSelectElement).value))
            "
          >
            <option :value="0.8">慢行 0.8 m/s</option>
            <option :value="2">步行 2 m/s</option>
            <option :value="4">巡检 4 m/s</option>
            <option :value="8">快速 8 m/s</option>
          </select></label
        >
      </div>
      <div class="roaming-equipment">
        <el-icon><Aim /></el-icon>
        <el-select
          :model-value="state.selectedEquipmentId || undefined"
          filterable
          placeholder="搜索竣工模型设备 · 风机 / 摄像头 / 消防泵"
          size="small"
          popper-class="roam-equipment-pop"
          @update:model-value="(value) => emit('equipment', String(value))"
        >
          <el-option-group
            v-for="group in groups"
            :key="group.name"
            :label="`${group.name} · ${group.items.length}`"
          >
            <el-option
              v-for="item in group.items"
              :key="item.id"
              :value="item.id"
              :label="item.name"
            />
          </el-option-group>
        </el-select>
        <span class="equipment-count"
          >{{ equipment.length }}<small>构件</small></span
        >
      </div>
      <div class="roaming-footer">
        <el-checkbox
          :model-value="state.dimStructure"
          size="small"
          @update:model-value="(value) => emit('dim', !!value)"
          >结构透视</el-checkbox
        >
        <el-checkbox
          :model-value="state.roadXray"
          size="small"
          @update:model-value="emit('road', !!$event)"
          >路面透视</el-checkbox
        >
        <details class="roaming-adjust">
          <summary>机位微调</summary>
          <div class="adjust-content">
            <label
              >眼高 {{ state.eyeHeight.toFixed(1) }} m<input
                aria-label="巡游眼高"
                type="range"
                min="0.6"
                max="4.2"
                step="0.1"
                :value="state.eyeHeight"
                @input="
                  emit(
                    'height',
                    Number(($event.target as HTMLInputElement).value),
                  )
                " /></label
            ><label
              >横向偏移 {{ state.lateralOffset.toFixed(1) }} m<input
                aria-label="巡游横向偏移"
                type="range"
                min="-3"
                max="3"
                step="0.1"
                :value="state.lateralOffset"
                @input="
                  emit(
                    'offset',
                    Number(($event.target as HTMLInputElement).value),
                  )
                "
            /></label>
          </div>
        </details>
        <span class="roaming-tip">拖拽环视 · 滚轮近看 · Esc 退出</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Aim,
  Close,
  RefreshLeft,
  Switch,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import type { ModelEquipment } from '../utils/modelEquipment'
import type { RoamingState } from '../types/roaming'
const props = defineProps<{
  state: RoamingState
  equipment: ModelEquipment[]
}>()
const emit = defineEmits<{
  start: []
  entry: []
  road: [value: boolean]
  exit: []
  play: []
  reverse: []
  seek: [value: number]
  speed: [value: number]
  layer: [value: RoamingState['layer']]
  height: [value: number]
  offset: [value: number]
  dim: [value: boolean]
  equipment: [id: string]
}>()
const groups = computed(() =>
  [...new Set(props.equipment.map((e) => e.category))].map((name) => ({
    name,
    items: props.equipment.filter((e) => e.category === name),
  })),
)
</script>

<style scoped lang="scss">
.roaming-panel {
  position: absolute;
  z-index: 45;
  bottom: 82px;
  left: 50%;
  transform: translateX(-50%);
  width: min(540px, calc(100% - 24px));
  padding: 16px 20px 10px;
  color: #cad9e8;
  background: linear-gradient(125deg, #0a1c2ff5, #071423f5);
  backdrop-filter: blur(20px);
  border: 1px solid #8fc3e52b;
  border-radius: 14px;
  box-shadow:
    0 12px 48px #0007,
    inset 0 1px #ffffff08;
}
.roaming-head,
.roaming-title,
.roaming-route,
.roaming-controls,
.roaming-footer,
.roaming-equipment {
  display: flex;
  align-items: center;
}
.roaming-head {
  justify-content: space-between;
  margin-bottom: 14px;
}
.roaming-title {
  gap: 9px;
  strong {
    font-size: 14px;
    letter-spacing: 1px;
    color: #e7f2fb;
  }
}
.roaming-indicator {
  width: 6px;
  height: 6px;
  background: #80b3c9;
  border-radius: 50%;
  &.playing {
    background: #73d9c4;
    animation: roam-breathe 2.4s ease-in-out infinite;
  }
}
.roaming-subtitle {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #597b98;
}
.roaming-route {
  justify-content: space-between;
  :deep(.el-radio-button__inner) {
    padding: 6px 11px;
    font-size: 11px;
  }
}
.roaming-distance {
  font-size: 18px;
  color: #e5f2fa;
  font-variant-numeric: tabular-nums;
  small {
    font-size: 11px;
    color: #6f91aa;
  }
}
.roaming-track {
  display: block;
  padding: 8px 0;
  input {
    appearance: none;
    width: 100%;
    height: 3px;
    border-radius: 2px;
    cursor: pointer;
    background: linear-gradient(
      90deg,
      #70cbbd var(--progress),
      #28445a var(--progress)
    );
    &::-webkit-slider-thumb {
      appearance: none;
      height: 10px;
      width: 10px;
      border-radius: 50%;
      background: #ccf7ef;
      border: 2px solid #6dcbbc;
    }
    &::-moz-range-thumb {
      height: 8px;
      width: 8px;
      border-radius: 50%;
      background: #ccf7ef;
      border: 2px solid #6dcbbc;
    }
  }
}
.roaming-controls {
  gap: 8px;
  margin: 4px 0 15px;
}
.roaming-icon,
.roaming-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  border: 1px solid #8db3d328;
  background: #142c4080;
  color: #adc6da;
  border-radius: 7px;
  height: 30px;
  padding: 0 11px;
  font-size: 11px;
  cursor: pointer;
  &:hover {
    background: #24445e;
    color: #f2f9ff;
  }
}
.roaming-icon {
  padding: 0;
  width: 30px;
}
.roaming-button.primary {
  color: #afe8df;
  background: #60c6b51a;
  border-color: #60c6b540;
}
.speed-label {
  margin-left: auto;
  select {
    height: 30px;
    padding: 0 6px;
    border: 1px solid #8db3d328;
    border-radius: 7px;
    color: #adc6da;
    font-size: 10px;
    background: #102538;
  }
}
.roaming-equipment {
  gap: 10px;
  border-top: 1px solid #95b6d01a;
  padding-top: 12px;
  color: #71b5ca;
  :deep(.el-select) {
    flex: 1;
    min-width: 0;
    --el-fill-color-blank: #0d2335;
    --el-border-color: #2a4358;
    --el-text-color-placeholder: #7592aa;
    --el-text-color-regular: #c7d9e8;
  }
}
.equipment-count {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  small {
    display: block;
    font-size: 9px;
    color: #6b879d;
  }
}
.roaming-footer {
  gap: 12px;
  margin-top: 3px;
  flex-wrap: wrap;
  :deep(.el-checkbox) {
    margin: 0;
    --el-checkbox-text-color: #97b2c8;
    --el-checkbox-font-size: 10px;
  }
}
.roaming-tip {
  margin-left: auto;
  font-size: 9px;
  color: #65859e;
}
.roaming-adjust {
  position: relative;
  font-size: 10px;
  color: #91acbe;
  summary {
    cursor: pointer;
  }
  .adjust-content {
    position: absolute;
    bottom: 26px;
    left: -60px;
    padding: 14px;
    width: 220px;
    border: 1px solid #3f607c;
    border-radius: 10px;
    background: #0c2133;
    box-shadow: 0 8px 30px #0007;
    label {
      display: block;
      margin: 4px 0 10px;
    }
    input {
      display: block;
      width: 100%;
      margin-top: 8px;
      accent-color: #6bc8b9;
    }
  }
}
.roaming-message {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px 0;
  font-size: 12px;
  line-height: 1.7;
  p {
    flex: 1;
    margin: 0;
  }
}
.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #71ccbf;
  animation: roam-breathe 1.6s infinite;
}
@keyframes roam-breathe {
  50% {
    opacity: 0.4;
    box-shadow: 0 0 0 4px #71ccbf12;
  }
}
@media (max-width: 560px) {
  .roaming-panel {
    padding: 12px;
    bottom: 76px;
  }
  .roaming-subtitle {
    display: none;
  }
  .roaming-tip {
    width: 100%;
    margin: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
