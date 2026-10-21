<template>
  <section
    class="alarm-feed"
    aria-label="全局告警面板"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="blur"
  >
    <div class="alarm-heading">
      <h2>全局告警</h2>
      <span class="feed-status"><i></i>示例轮播</span
      ><button
        type="button"
        class="feed-toggle"
        :aria-label="manualPaused ? '继续告警轮播' : '暂停告警轮播'"
        :aria-pressed="manualPaused"
        @click="togglePause"
      >
        <el-icon><VideoPlay v-if="manualPaused || reducedMotion" /><VideoPause v-else /></el-icon>
      </button>
    </div>
    <div class="alarm-summary">
      <div
        v-for="(meta, level) in ALERT_LEVELS"
        :key="level"
        :style="{ '--level-color': meta.color }"
      >
        <strong>{{
          items
            .filter((item) => item.level === level)
            .length.toString()
            .padStart(2, '0')
        }}</strong
        ><span>{{ meta.label }}</span>
      </div>
    </div>
    <div
      v-if="active"
      class="alarm-featured"
      :style="{ '--level-color': ALERT_LEVELS[active.level].color }"
    >
      <Transition name="alarm-swap" mode="out-in"
        ><button
          :key="active.id"
          type="button"
          class="featured-event"
          :aria-label="`定位告警：${active.title}`"
          @click="emit('locate', active)"
        >
          <span class="featured-meta"
            ><span><i></i>{{ ALERT_LEVELS[active.level].label }} · {{ active.source }}</span
            ><time>{{ active.time }}</time></span
          ><strong>{{ active.title }}</strong
          ><span class="featured-description">{{ active.description }}</span
          ><span class="featured-location"
            ><el-icon><Location /></el-icon>{{ active.stake
            }}<small
              >定位查看 <el-icon><ArrowRight /></el-icon></small
          ></span></button
      ></Transition>
      <div class="event-duration" aria-hidden="true">
        <span :style="{ transform: `scaleX(${progress})` }"></span>
      </div>
    </div>
    <div v-else class="alarm-empty">暂无告警信息</div>
    <div class="alarm-list-title">
      <span>告警队列</span><span>{{ items.length }} 条</span>
    </div>
    <TransitionGroup name="alarm-list" tag="div" class="alarm-list"
      ><button
        v-for="item in queue"
        :key="item.id"
        type="button"
        class="alarm-row"
        :style="{ '--level-color': ALERT_LEVELS[item.level].color }"
        @click="emit('locate', item)"
      >
        <i></i><span>{{ item.title }}</span
        ><time>{{ item.time }}</time>
      </button></TransitionGroup
    >
    <div class="alarm-pagination">
      <span>鼠标悬停 / 聚焦暂停</span>
      <div>
        <button
          v-for="(item, i) in items"
          :key="item.id"
          type="button"
          :class="{ active: index === i }"
          :aria-label="`查看第 ${i + 1} 条告警`"
          :aria-current="index === i ? 'true' : undefined"
          @click="select(i)"
        ></button>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Location, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { ALERT_LEVELS, type TunnelAlert } from '../config/alerts'
import { useRotatingFeed } from '../composables/useRotatingFeed'
const props = defineProps<{ items: readonly TunnelAlert[] }>()
const emit = defineEmits<{ locate: [item: TunnelAlert] }>()
const {
  active,
  index,
  progress,
  manualPaused,
  hovered,
  focused,
  reducedMotion,
  blur,
  select,
  togglePause,
} = useRotatingFeed(() => props.items)
const queue = computed(() => {
  const rotated = [...props.items.slice(index.value + 1), ...props.items.slice(0, index.value)]
  return rotated.slice(0, 3)
})
</script>
<style scoped lang="scss">
.alarm-feed {
  position: relative;
}
.alarm-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  h2 {
    font-size: 14px;
    font-weight: 600;
    color: #dceaf6;
    letter-spacing: 1px;
  }
}
.feed-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  color: #7995aa;
  i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #78c5b5;
    animation: feed-breathe 2.8s infinite;
  }
}
.feed-toggle {
  border: 0;
  padding: 3px;
  background: transparent;
  color: #8ba8be;
  cursor: pointer;
  display: flex;
}
.alarm-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 14px;
  > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 9px 0 8px;
    text-align: center;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--level-color) 7%, transparent),
      transparent
    );
    border-bottom: 1px solid color-mix(in srgb, var(--level-color) 22%, transparent);
  }
  strong {
    font-size: 22px;
    font-weight: 500;
    color: var(--level-color);
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
  }
  span {
    font-size: 10px;
    color: #7c97ad;
  }
}
.alarm-featured {
  position: relative;
  min-height: 157px;
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--level-color) 8%, transparent),
    #0b1c2c44
  );
  border: 1px solid color-mix(in srgb, var(--level-color) 20%, transparent);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.4s;
}
.featured-event {
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: #ffffff03;
  }
  > strong {
    font-size: 14px;
    color: #e1e9ef;
    font-weight: 500;
    margin: 10px 0 7px;
  }
}
.featured-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 9px;
  color: #7891a6;
  > span {
    color: var(--level-color);
    display: flex;
    gap: 5px;
    align-items: center;
  }
  i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--level-color);
  }
  time {
    font-variant-numeric: tabular-nums;
  }
}
.featured-description {
  color: #8fa7ba;
  font-size: 11px;
  line-height: 1.8;
  min-height: 40px;
}
.featured-location {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  font-size: 10px;
  color: #9fb8cb;
  margin-top: 9px;
  small {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    margin-left: auto;
    color: #8cb4cb;
    font-size: 9px;
  }
}
.event-duration {
  position: absolute;
  bottom: 0;
  height: 1px;
  width: 100%;
  span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    background: var(--level-color);
    transition: transform 0.2s linear;
    opacity: 0.7;
  }
}
.alarm-list-title {
  display: flex;
  justify-content: space-between;
  color: #647f96;
  font-size: 9px;
  margin: 15px 0 6px;
  letter-spacing: 0.5px;
}
.alarm-list {
  position: relative;
  height: 99px;
}
.alarm-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid #87b0cc0d;
  color: #9ab1c4;
  font-size: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  &:hover {
    color: #e0eef9;
  }
  i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--level-color);
  }
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  time {
    margin-left: auto;
    color: #627f98;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
}
.alarm-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 11px;
  > span {
    font-size: 9px;
    color: #536e86;
  }
  > div {
    display: flex;
    gap: 4px;
  }
  button {
    width: 14px;
    height: 12px;
    padding: 0;
    border: 0;
    cursor: pointer;
    background: transparent;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      height: 2px;
      left: 2px;
      right: 2px;
      top: 5px;
      background: #344d63;
      transition: background 0.2s;
    }
    &.active::after {
      background: #8ec9cc;
    }
  }
}
.alarm-empty {
  color: #85a5ba;
  font-size: 12px;
  padding: 20px 0;
}
.alarm-swap-enter-active,
.alarm-swap-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.alarm-swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.alarm-swap-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.alarm-list-move,
.alarm-list-enter-active,
.alarm-list-leave-active {
  transition:
    opacity 0.4s,
    transform 0.4s;
}
.alarm-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.alarm-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.alarm-list-leave-active {
  position: absolute;
}
@keyframes feed-breathe {
  50% {
    opacity: 0.35;
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
