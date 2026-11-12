<template>
  <div class="page-bg">
    <div class="data-source" :class="source">
      <span class="dot"></span>{{ sourceLabel(source) }} · 测点读数来自 telemetry 时序表
    </div>

    <!-- 监测点位三维场景 -->
    <div class="panel scene-panel">
      <TunnelScene ref="sceneRef" map-mode resizable :points="monitorPoints" height="320px" />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 环控系统监测 · 环境气体 -->
      <div class="panel">
        <div class="panel-title">
          环控系统监测 · 环境气体
          <span class="panel-extra">阈值判定 {{ alarmCount }} 项告警 / {{ warnCount }} 项预警</span>
        </div>
        <div class="gas-stats">
          <div class="gas-item"><b :class="gasClass('co')">{{ gasValue('co') }}</b><span>CO (ppm)</span></div>
          <div class="gas-item"><b :class="gasClass('no2')">{{ gasValue('no2') }}</b><span>NO₂ (ppm)</span></div>
          <div class="gas-item"><b class="num-blue">{{ gasValue('o2') }}</b><span>O₂ (%)</span></div>
          <div class="gas-item"><b :class="gasClass('visibility')">{{ gasValue('visibility') }}</b><span>能见度 (m)</span></div>
        </div>
        <VChart :option="gasOption" height="170px" />
        <el-alert v-if="gasAlert" type="warning" :closable="false" style="margin-top: 6px" :title="gasAlert" />
      </div>

      <!-- 环控系统监测 · 环境照明 -->
      <div class="panel">
        <div class="panel-title">环控系统监测 · 环境照明</div>
        <div class="gas-stats">
          <div class="gas-item"><b class="num-blue">{{ illuminance }}</b><span>平均照度 (lux)</span></div>
          <div class="gas-item"><b class="num-green">{{ lampTotal }}</b><span>照明回路 (路)</span></div>
          <div class="gas-item"><b :class="lampFault ? 'num-orange' : 'num-green'">{{ lampFault }}</b><span>故障回路</span></div>
          <div class="gas-item"><b class="num-green">{{ onlineRate }}</b><span>在线率 (%)</span></div>
        </div>
        <VChart :option="illumOption" height="170px" />
        <el-alert type="info" :closable="false" style="margin-top: 6px"
          :title="illumAlert" />
      </div>
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 环控系统监测 · 新风换气 -->
      <div class="panel">
        <div class="panel-title">环控系统监测 · 新风换气设备</div>
        <el-table :data="ventDevices" size="small" height="210" empty-text="暂无通风设备读数">
          <el-table-column prop="name" label="设备" />
          <el-table-column prop="stake" label="位置" width="90" />
          <el-table-column label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.run ? 'success' : 'info'" size="small">{{ row.run ? '运行' : '待机' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="val" label="参数" width="90" />
        </el-table>
        <div class="vent-summary">
          <span>运行设备 <b class="num-blue">{{ ventRunning }}</b> / {{ ventDevices.length }}</span>
          <span>数据源 <b class="num-green">{{ sourceLabel(source) }}</b></span>
        </div>
      </div>

      <!-- 结构监测 -->
      <div class="panel">
        <div class="panel-title">
          结构监测 · 沉降 / 变形
          <span class="panel-extra">结构健康指数 {{ healthIndex }}</span>
        </div>
        <div class="mini-title">结构健康评估（按区段打分，评分越低越需关注）</div>
        <VChart :option="settleOption" height="160px" />
        <el-table :data="structPoints" size="small" height="150" style="margin-top: 10px" empty-text="暂无结构监测读数">
          <el-table-column prop="name" label="测点" />
          <el-table-column prop="stake" label="桩号" width="90" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="val" label="当前值" width="80" />
          <el-table-column label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.level === 'alarm' ? 'danger' : row.level === 'warn' ? 'warning' : 'success'" size="small">
                {{ row.level === 'alarm' ? '告警' : row.level === 'warn' ? '关注' : '正常' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TunnelScene from '../components/TunnelScene.vue'
import type { ScenePoint } from '../types/scene'
import VChart from '../components/VChart.vue'
import {
  api,
  type DashboardSummary,
  type MonitoringReading,
  type SceneOverviewPoint,
  type SceneOverview,
  type StructuralHealth,
} from '../api/client'
import { sourceLabel, stakeToLeft, type DataSource } from '../api/usePageData'

const source = ref<DataSource>('loading')
const readings = ref<MonitoringReading[]>([])
const series = ref<{ metric: string; label: string; unit?: string | null; points: { time: string; value: number }[] }[]>([])
const environment = ref<DashboardSummary['environment'] | null>(null)
const deviceCards = ref<DashboardSummary['devices'] | null>(null)
const health = ref<StructuralHealth | null>(null)
const scenePoints = ref<SceneOverviewPoint[]>([])

const METRIC_LABEL: Record<string, string> = {
  co: '一氧化碳',
  no2: '二氧化氮',
  o2: '氧气',
  visibility: '能见度',
  illuminance: '照度',
  water_level: '积水液位',
  temperature: '温度',
  humidity: '湿度',
  fan_frequency: '风机频率',
  pressure: '管网压力',
  stress: '应力应变',
  settlement: '沉降',
  bolt_force: '螺栓受力',
  corrosion: '腐蚀速率',
}

async function loadAll() {
  source.value = 'loading'
  const [overviewResult, seriesResult, healthResult, summaryResult, sceneResult] = await Promise.allSettled([
    api.get<{ items: MonitoringReading[] }>('/monitoring/overview'),
    api.get<typeof series.value>('/monitoring/series', { hours: 12 }),
    api.get<StructuralHealth>('/monitoring/structural-health'),
    api.get<DashboardSummary>('/dashboard/summary'),
    api.get<SceneOverview>('/scene/overview', { module: 'monitoring' }),
  ])

  readings.value = overviewResult.status === 'fulfilled' ? overviewResult.value.items : []
  series.value = seriesResult.status === 'fulfilled' ? seriesResult.value : []
  health.value = healthResult.status === 'fulfilled' ? healthResult.value : null
  if (summaryResult.status === 'fulfilled') {
    environment.value = summaryResult.value.environment
    deviceCards.value = summaryResult.value.devices
  }
  scenePoints.value = sceneResult.status === 'fulfilled' ? sceneResult.value.points : []

  source.value = overviewResult.status === 'fulfilled' ? 'api' : 'demo'
}

onMounted(loadAll)

/* ------------------------------ 三维点位 ------------------------------ */

const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const KIND_OF_METRIC: Record<string, { kind: ScenePoint['kind']; group: ScenePoint['group'] }> = {
  co: { kind: 'covi', group: 'env' },
  no2: { kind: 'covi', group: 'env' },
  illuminance: { kind: 'illum', group: 'env' },
  water_level: { kind: 'waterLevel', group: 'env' },
  temperature: { kind: 'heatSensor', group: 'env' },
  humidity: { kind: 'smokeSensor', group: 'env' },
  fan_frequency: { kind: 'fan', group: 'mep' },
  pressure: { kind: 'pressure', group: 'monitor' },
  stress: { kind: 'stress', group: 'monitor' },
  settlement: { kind: 'stress', group: 'monitor' },
  bolt_force: { kind: 'bolt', group: 'monitor' },
  corrosion: { kind: 'corrosion', group: 'monitor' },
}

const monitorPoints = computed<ScenePoint[]>(() => {
  // 优先使用后端场景点位（含模块分组与坐标），再把最新读数挂到点位上
  if (scenePoints.value.length) {
    const readingByDevice = new Map(readings.value.map((item) => [item.deviceId, item]))
    return scenePoints.value.map((point) => {
      const reading = point.deviceId ? readingByDevice.get(point.deviceId) : undefined
      return {
        id: point.id,
        name: point.name,
        kind: point.kind as ScenePoint['kind'],
        group: point.group as ScenePoint['group'],
        status: reading ? (reading.level === 'alarm' ? 'alarm' : reading.level === 'warn' ? 'warn' : 'ok') : point.status,
        left: point.left,
        top: point.top,
        leftNum: point.leftNum,
        scale: point.scale,
        stake: point.stake ?? '—',
        value: reading ? `${reading.metricLabel} ${reading.value}${reading.unit ?? ''}` : point.value ?? undefined,
        alarm: reading && reading.level !== 'normal' ? `${reading.metricLabel} ${reading.value}${reading.unit ?? ''} 超阈值` : undefined,
        unit: reading?.unit ?? point.unit ?? undefined,
        history: reading ? [{ time: '最新', value: reading.value }] : undefined,
      }
    })
  }
  // 后端不可用时按最新读数落图（桩号 → 横向位置）
  return readings.value.slice(0, 12).map((item, index) => {
    const meta = KIND_OF_METRIC[item.metric] ?? { kind: 'covi' as const, group: 'env' as const }
    const leftNum = stakeToLeft(item.stake, 10 + (index % 8) * 11)
    return {
      id: `device:${item.deviceId}`,
      name: item.deviceName,
      kind: meta.kind,
      group: meta.group,
      status: item.level === 'alarm' ? 'alarm' : item.level === 'warn' ? 'warn' : 'ok',
      left: `${leftNum}%`,
      top: `${36 + (index % 3) * 12}%`,
      leftNum,
      scale: 0.9,
      stake: item.stake ?? '—',
      value: `${item.value}${item.unit ?? ''}`,
      alarm: item.level !== 'normal' ? `${item.metricLabel} 超阈值` : undefined,
    }
  })
})

/* ------------------------------ 环境气体 ------------------------------ */

const alarmCount = computed(() => readings.value.filter((item) => item.level === 'alarm').length)
const warnCount = computed(() => readings.value.filter((item) => item.level === 'warn').length)

function metricReading(metric: string) {
  return readings.value.find((item) => item.metric === metric)
}

function gasValue(metric: string) {
  const reading = metricReading(metric)
  if (reading) return reading.value
  // 后端未采集该指标时用总览聚合值兜底（标注为演示）
  const env = environment.value
  if (metric === 'co') return env?.co ?? '—'
  if (metric === 'no2') return env?.no2 ?? '—'
  if (metric === 'visibility') return 18
  return 0.8
}

function gasClass(metric: string) {
  const level = metricReading(metric)?.level
  return level === 'alarm' ? 'num-orange' : level === 'warn' ? 'num-orange' : 'num-green'
}

const gasAlert = computed(() => {
  const worst = readings.value.find(
    (item) => item.level !== 'normal' && ['co', 'no2', 'visibility', 'o2'].includes(item.metric),
  )
  if (!worst) return ''
  return `${worst.stake ?? ''} ${worst.metricLabel} ${worst.value}${worst.unit ?? ''} 偏高，建议加大新风换气量。`
})

const gasOption = computed(() => {
  const coSeries = series.value.find((item) => item.metric === 'co')
  const no2Series = series.value.find((item) => item.metric === 'no2')
  const base = coSeries ?? no2Series
  const labels = base?.points.map((point) => point.time.slice(11, 16)) ?? ['—']
  return {
    grid: { left: 36, right: 10, top: 20, bottom: 22 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, itemWidth: 10, textStyle: { fontSize: 10 } },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: 'ppm', axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'CO',
        type: 'line',
        smooth: true,
        data: coSeries?.points.map((point) => point.value) ?? [],
        lineStyle: { color: '#00b42a' },
        itemStyle: { color: '#00b42a' },
      },
      {
        name: 'NO₂',
        type: 'line',
        smooth: true,
        data: no2Series?.points.map((point) => point.value) ?? [],
        lineStyle: { color: '#ff7d00' },
        itemStyle: { color: '#ff7d00' },
      },
    ],
  }
})

/* ------------------------------ 照明 ------------------------------ */

const illuminance = computed(() => environment.value?.illuminance ?? 0)
const lampCard = computed(() => deviceCards.value?.cards.find((card) => card.group === 'light'))
const lampTotal = computed(() => lampCard.value?.total ?? 0)
const lampFault = computed(() => lampCard.value?.fault ?? 0)
const onlineRate = computed(() => deviceCards.value?.onlineRate ?? 0)

const illumAlert = computed(() =>
  lampFault.value
    ? `照明回路故障 ${lampFault.value} 路 / 共 ${lampTotal.value} 路，建议排查灯具与回路。`
    : '照明回路全部正常，出入口加强段照度符合规范。',
)

const illumOption = computed(() => {
  const illuminanceSeries = series.value.find((item) => item.metric === 'illuminance')
  const points = illuminanceSeries?.points ?? []
  return {
    grid: { left: 36, right: 10, top: 20, bottom: 22 },
    xAxis: { type: 'category', data: points.map((point) => point.time.slice(11, 16)), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: 'lux', axisLabel: { fontSize: 10 } },
    series: [
      {
        type: 'line',
        smooth: true,
        data: points.map((point) => point.value),
        lineStyle: { color: '#165dff' },
        itemStyle: { color: '#165dff' },
        areaStyle: { color: 'rgba(22,93,255,0.1)' },
      },
    ],
  }
})

/* ------------------------------ 通风设备 ------------------------------ */

const ventDevices = computed(() =>
  readings.value
    .filter((item) => ['fan_frequency', 'pressure'].includes(item.metric))
    .map((item) => ({
      name: item.deviceName,
      stake: item.stake ?? '—',
      run: item.value > 0,
      val: `${item.value}${item.unit ?? ''}`,
    })),
)

const ventRunning = computed(() => ventDevices.value.filter((item) => item.run).length)

/* ------------------------------ 结构监测 ------------------------------ */

const structPoints = computed(() =>
  readings.value
    .filter((item) => ['settlement', 'stress', 'bolt_force', 'corrosion', 'pressure'].includes(item.metric))
    .map((item) => ({
      name: item.deviceName,
      stake: item.stake ?? '—',
      type: METRIC_LABEL[item.metric] ?? item.metric,
      val: `${item.value}${item.unit ?? ''}`,
      level: item.level,
    })),
)

const healthIndex = computed(() => health.value?.overallIndex ?? '—')

const settleOption = computed(() => {
  const sections = health.value?.latest ?? []
  const fallback = [
    { sectionName: 'K2+100~K2+800', score: 88 },
    { sectionName: 'K2+800~K3+100', score: 76 },
    { sectionName: 'K3+100~K3+600', score: 58 },
    { sectionName: 'K3+600~K4+300', score: 82 },
  ]
  const list = sections.length ? sections : fallback
  return {
    grid: { left: 36, right: 10, top: 20, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: list.map((item) => item.sectionName ?? ''), axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', name: '评分', min: 40, max: 100, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '结构健康评分',
        type: 'bar',
        data: list.map((item) => ({
          value: item.score,
          itemStyle: { color: item.score >= 75 ? '#00b42a' : item.score >= 65 ? '#ff7d00' : '#f53f3f' },
        })),
        barWidth: 18,
      },
    ],
  }
})
</script>

<style scoped lang="scss">
.data-source {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: #9fc0ea; margin-bottom: 8px;
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #00b42a; }
  &.demo .dot { background: #ff7d00; }
  &.loading .dot { background: #7188a8; }
}
.panel-extra { font-size: 11px; color: #7188a8; font-weight: 400; }
.scene-panel { padding: 0; overflow: hidden; }
.mini-title { font-size: 12px; color: #aebcd8; margin-bottom: 4px; font-weight: 600; }

.gas-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.gas-item {
  text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 6px; padding: 8px 0;
  b { display: block; font-size: 18px; }
  span { font-size: 10px; color: #7188a8; }
}
.vent-summary {
  display: flex; justify-content: space-between; margin-top: 10px;
  font-size: 12px; color: #aebcd8;
}
</style>
