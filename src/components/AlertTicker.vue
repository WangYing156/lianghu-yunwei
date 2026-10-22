<template>
  <section
    v-if="active"
    class="alert-ticker"
    :style="{ '--alert-color': ALERT_LEVELS[active.level].color }"
    aria-label="预警信息轮播"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="blur"
  >
    <div class="ticker-label">
      <span class="ticker-pulse"></span><el-icon><Warning /></el-icon
      ><strong>预警信息</strong><small>示例轮播</small>
    </div>
    <div class="ticker-viewport" aria-live="off">
      <Transition name="warning-slide" mode="out-in"
        ><button
          :key="active.id"
          type="button"
          class="ticker-content"
          title="定位该预警的模拟点位"
          @click="emit('locate', active)"
        >
          <span class="ticker-level">{{
            ALERT_LEVELS[active.level].label
          }}</span
          ><b>{{ active.title }}</b
          ><span class="ticker-description">{{ active.description }}</span
          ><span class="ticker-locate">定位 ↗</span>
        </button></Transition
      >
    </div>
    <div class="ticker-controls">
      <span class="ticker-counter"
        >{{ String(index + 1).padStart(2, '0') }}
        <small>/ {{ String(items.length).padStart(2, '0') }}</small></span
      ><button
        type="button"
        aria-label="上一条预警"
        title="上一条预警"
        @click="previous"
      >
        <el-icon><ArrowLeft /></el-icon></button
      ><button
        type="button"
        :aria-label="manualPaused ? '继续预警轮播' : '暂停预警轮播'"
        :aria-pressed="manualPaused"
        @click="togglePause"
      >
        <el-icon
          ><VideoPlay v-if="manualPaused || reducedMotion" /><VideoPause v-else
        /></el-icon></button
      ><button
        type="button"
        aria-label="下一条预警"
        title="下一条预警"
        @click="next"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>
    </div>
    <div class="ticker-timeline" aria-hidden="true">
      <span :style="{ transform: `scaleX(${progress})` }"></span>
    </div>
  </section>
</template>
<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  VideoPause,
  VideoPlay,
  Warning,
} from '@element-plus/icons-vue'
import { ALERT_LEVELS, type TunnelAlert } from '../config/alerts'
import { useRotatingFeed } from '../composables/useRotatingFeed'
const props = defineProps<{ items: readonly TunnelAlert[] }>()
const emit = defineEmits<{ locate: [alert: TunnelAlert] }>()
const {
  active,
  index,
  progress,
  manualPaused,
  hovered,
  focused,
  reducedMotion,
  blur,
  previous,
  next,
  togglePause,
} = useRotatingFeed(() => props.items, 8000)
</script>
<style scoped lang="scss">
.alert-ticker {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 18px;
  height: 46px;
  margin: 9px 16px 0;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--alert-color) 25%, transparent);
  border-radius: 7px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--alert-color) 8%, #0b1a2b),
    #09192b
  );
  color: #bdcdd9;
  transition:
    border-color 0.6s,
    background 0.6s;
}
.ticker-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  color: var(--alert-color);
  strong {
    font-size: 12px;
    letter-spacing: 1px;
  }
  small {
    font-size: 9px;
    color: #7e8d9d;
    padding-left: 4px;
  }
}
.ticker-pulse {
  height: 4px;
  width: 4px;
  border-radius: 50%;
  background: var(--alert-color);
  animation: warning-breathe 3s ease-in-out infinite;
}
.ticker-viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.ticker-content {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  padding: 0;
  cursor: pointer;
  &:focus-visible {
    outline: 1px solid var(--alert-color);
    outline-offset: 3px;
  }

  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
  font-size: 12px;
  b {
    color: #d9e3ea;
    font-weight: 500;
  }
}
.ticker-level {
  color: var(--alert-color);
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--alert-color) 12%, transparent);
}
.ticker-description {
  color: #8fa4b7;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ticker-locate {
  flex: none;
  margin-left: auto;
  color: var(--alert-color);
  font-size: 10px;
  opacity: 0.8;
}
.ticker-controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  button {
    display: grid;
    place-items: center;
    width: 25px;
    height: 26px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: #8fa8bb;
    cursor: pointer;
    &:hover {
      color: #f0f6fa;
      background: #ffffff0a;
    }
  }
}
.ticker-counter {
  font-size: 11px;
  margin-right: 10px;
  font-variant-numeric: tabular-nums;
  color: #d2dde6;
  small {
    color: #647d93;
  }
}
.ticker-timeline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: #ffffff05;
  span {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--alert-color);
    opacity: 0.6;
    transform-origin: left;
    transition: transform 0.2s linear;
  }
}
.warning-slide-enter-active,
.warning-slide-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.warning-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.warning-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
@keyframes warning-breathe {
  50% {
    opacity: 0.35;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--alert-color) 8%, transparent);
  }
}
@media (max-width: 900px) {
  .ticker-label small,
  .ticker-description {
    display: none;
  }
  .alert-ticker {
    margin: 6px 10px 0;
    gap: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-pulse {
    animation: none;
  }
  *,
  *::before,
  *::after {
    transition: none !important;
  }
}
</style>
