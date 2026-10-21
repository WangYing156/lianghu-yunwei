<template>
  <div ref="el" class="v-chart" :style="{ width: '100%', height: height || '160px' }"></div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ option: any; height?: string }>()
const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null
let pending = false

/* ============================================================
 * 平台玻璃态图表主题：浅色透明底，避免 ECharts 默认 dark 主题
 * 带来的「黑底」问题；文字/轴线/网格统一为面板可读的浅蓝灰。
 * ============================================================ */
const GLASS_THEME = 'tunnel-glass'
let themeRegistered = false
function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  try {
    echarts.registerTheme(GLASS_THEME, {
    backgroundColor: 'transparent',
    color: ['#4ee6ff', '#2ee6a0', '#ffb03a', '#ff5f6b', '#165dff', '#b08cff'],
    textStyle: { color: '#a8c4e8', fontSize: 10 },
    legend: { textStyle: { color: '#b8cbe8', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    tooltip: {
      backgroundColor: 'rgba(12, 32, 68, 0.96)',
      borderColor: 'rgba(78, 160, 255, 0.4)',
      textStyle: { color: '#e8f4ff', fontSize: 11 }
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: 'rgba(120, 170, 230, 0.35)' } },
      axisTick: { show: false },
      axisLabel: { color: '#8fa8c8' },
      splitLine: { show: false }
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8fa8c8' },
      splitLine: { lineStyle: { color: 'rgba(120, 170, 230, 0.12)' } },
      nameTextStyle: { color: '#8fa8c8', fontSize: 10 }
    }
    })
  } catch {
    /* theme already registered */
  }
}

/* 归一化：补上可读的 y 轴单位与默认配色，避免各页面遗漏 */
function normalizeOption(option: any): any {
  if (!option) return option
  const o = { ...option, backgroundColor: 'transparent' }
  // y 轴单位：默认顶部展示，避免与刻度重叠
  const isArr = Array.isArray(o.yAxis)
  const axes = isArr ? o.yAxis : o.yAxis ? [o.yAxis] : null
  if (axes) {
    const next = axes.map((axis: any) => {
      if (!axis || !axis.name) return axis
      return {
        ...axis,
        nameLocation: axis.nameLocation ?? 'end',
        nameGap: axis.nameGap ?? 4,
        nameTextStyle: {
          ...(axis.nameTextStyle || {}),
          color: axis.nameTextStyle?.color ?? '#8fa8c8',
          fontSize: 10
        }
      }
    })
    o.yAxis = isArr ? next : next[0]
  }
  return o
}

function ensureChart() {
  const host = el.value
  if (!host) return
  if (host.clientWidth <= 0 || host.clientHeight <= 0) {
    if (!pending) {
      pending = true
      requestAnimationFrame(() => {
        pending = false
        ensureChart()
      })
    }
    return
  }
  if (!chart) {
    ensureTheme()
    chart = echarts.init(host, GLASS_THEME)
  }
  // 以 merge 方式写入，保留主题的透明背景与默认样式
  chart.setOption(normalizeOption(props.option), { notMerge: false })
  chart.resize()
}

onMounted(() => {
  ensureChart()
  if (el.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => ensureChart())
    ro.observe(el.value)
  }
  window.addEventListener('resize', ensureChart)
})

watch(() => props.option, () => ensureChart(), { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', ensureChart)
  ro?.disconnect()
  ro = null
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.v-chart {
  min-height: 80px;
  min-width: 40px;
}
</style>
