<template>
  <el-popover
    :width="316"
    trigger="click"
    placement="top"
    popper-class="layer-pop section-pop"
    :disabled="disabled || !ready"
  >
    <template #reference>
      <button
        type="button"
        class="section-trigger"
        :class="{ active: state.enabled }"
        :disabled="disabled || !ready"
        :aria-pressed="state.enabled"
        :title="
          disabled ? '剖切仅在外部三维视图使用' : '模型剖切 · 查看内部结构'
        "
      >
        <el-icon><Crop /></el-icon><span>剖切</span><i v-if="state.enabled"></i>
      </button>
    </template>
    <div class="section-head">
      <strong>模型剖切</strong
      ><el-switch
        :model-value="state.enabled"
        :disabled="!state.ready"
        size="small"
        aria-label="启用模型剖切"
        @update:model-value="emit('update', { enabled: !!$event })"
      />
    </div>
    <p v-if="state.error" class="section-note" role="alert">
      {{ state.error }}
    </p>
    <div class="section-controls" :class="{ muted: !state.enabled }">
      <label>作用模型</label>
      <el-radio-group
        :model-value="state.target"
        size="small"
        @update:model-value="
          emit('update', { target: $event as SectionTarget })
        "
      >
        <el-radio-button value="all">全部 BIM</el-radio-button
        ><el-radio-button value="partial">竣工段</el-radio-button
        ><el-radio-button value="bim">施工模型</el-radio-button>
      </el-radio-group>
      <label>剖切方向</label>
      <el-radio-group
        :model-value="state.axis"
        size="small"
        @update:model-value="emit('update', { axis: $event as SectionAxis })"
      >
        <el-radio-button value="x">X 轴</el-radio-button
        ><el-radio-button value="y">Y 轴</el-radio-button
        ><el-radio-button value="z">水平 Z</el-radio-button>
      </el-radio-group>
      <label
        >剖切位置 <b>{{ Math.round(state.position * 100) }}%</b></label
      >
      <el-slider
        :model-value="state.position * 100"
        :min="0"
        :max="100"
        :step="0.5"
        size="small"
        aria-label="剖切位置"
        @update:model-value="emit('update', { position: Number($event) / 100 })"
      />
      <div class="section-actions">
        <el-checkbox
          :model-value="state.reverse"
          size="small"
          @update:model-value="emit('update', { reverse: !!$event })"
          >反向保留</el-checkbox
        ><button type="button" @click="emit('reset')">重置剖切</button>
      </div>
    </div>
    <p class="section-note">
      拖动平面查看真实模型内部；全部 BIM
      以竣工段为移动范围。二维/巡游时暂停，返回后恢复。
    </p>
  </el-popover>
</template>
<script setup lang="ts">
import { Crop } from '@element-plus/icons-vue'
import type {
  SectionAxis,
  SectionState,
  SectionTarget,
} from '../utils/modelSection'
defineProps<{ state: SectionState; ready: boolean; disabled: boolean }>()
const emit = defineEmits<{
  update: [
    patch: Partial<
      Pick<SectionState, 'enabled' | 'axis' | 'position' | 'reverse' | 'target'>
    >,
  ]
  reset: []
}>()
</script>
<style scoped lang="scss">
.section-trigger {
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
  &:hover:not(:disabled),
  &.active {
    color: #b6e5d8;
    background: #73c4b414;
  }
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  i {
    height: 4px;
    width: 4px;
    border-radius: 50%;
    background: #8dcdbd;
  }
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #e1edf4;
  font-size: 13px;
  margin-bottom: 10px;
}
.section-controls {
  transition: opacity 0.2s;
  &.muted {
    opacity: 0.65;
  }
  > label {
    display: flex;
    justify-content: space-between;
    color: #98b0c5;
    font-size: 11px;
    margin: 12px 0 8px;
    b {
      color: #c9dedf;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
  }
  :deep(.el-radio-button__inner) {
    padding: 7px 13px;
    font-size: 11px;
  }
}
.section-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  button {
    background: #8fbbcf0d;
    color: #9bbdca;
    padding: 5px 9px;
    border: 1px solid #89adc52b;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
  }
  :deep(.el-checkbox__label) {
    color: #a4bccd;
    font-size: 11px;
  }
}
.section-note {
  margin: 10px 0 0;
  font-size: 10px;
  color: #708c9f;
  line-height: 1.7;
}
</style>
