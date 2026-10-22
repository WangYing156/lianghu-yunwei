<template>
  <div v-show="prd.state.visible" class="mark-badge" :class="{ active: hover }" @click.stop="prd.open(docKey)">
    {{ index }}
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { usePrd } from '../prd'

const props = defineProps<{ index: number; docKey: string }>()
const prd = usePrd()
const hover = ref(false)
let parent: HTMLElement | null = null
const enter = () => (hover.value = true)
const leave = () => (hover.value = false)

onMounted(() => {
  parent = (getCurrentEl()?.parentElement) || null
  parent?.addEventListener('mouseenter', enter)
  parent?.addEventListener('mouseleave', leave)
})
onBeforeUnmount(() => {
  parent?.removeEventListener('mouseenter', enter)
  parent?.removeEventListener('mouseleave', leave)
})

function getCurrentEl(): HTMLElement | null {
  return document.querySelectorAll(`[data-badge="${props.docKey}-${props.index}"]`)[0] as HTMLElement || null
}
</script>

<style scoped lang="scss">
.mark-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 30;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ff7d00;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 0 2px rgba(255, 125, 0, 0.25);
  transition: all 0.2s;
  &:hover, &.active {
    transform: scale(1.25);
    background: #f53f3f;
    box-shadow: 0 0 0 4px rgba(245, 63, 63, 0.3);
  }
}
</style>
