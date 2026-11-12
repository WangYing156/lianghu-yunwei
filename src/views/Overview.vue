<template>
  <div class="overview-root map-layout-full">
    <!-- 三维场景铺满 -->
    <div class="scene-wrap">
      <TunnelScene ref="sceneRef" map-mode :points="scenePoints" height="100%" />
    </div>

    <!-- 数据来源角标 -->
    <div class="data-source" :class="source">
      <span class="dot"></span>{{ sourceLabel(source) }}
      <span v-if="summary.data.value?.generatedAt" class="ts">{{ formatClock(summary.data.value?.generatedAt) }}</span>
    </div>

    <!-- 左侧悬浮面板列 -->
    <div class="map-side-rail map-side-rail--left">
      <div class="panel side-panel">
        <AlarmPanel :items="panelAlerts" @locate="locateAlarm" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">交通状况</div>
        <div class="traffic-now">
          <span>主线断面流量 <b class="num-blue">{{ mainFlow.toLocaleString() }}</b> 辆/时</span>
          <el-tag :type="congestionTagType" size="small">{{ congestionLabel }}</el-tag>
        </div>
        <VChart :option="trafficOption" height="130px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">重点监控</div>
        <p class="panel-sub">关键断面 · 点击放大并定位</p>
        <div class="cam-grid">
          <button
            v-for="c in cams"
            :key="c.id"
            type="button"
            class="cam-cell"
            :aria-label="`打开${c.name}监控画面并定位`"
            @click="openCamera(c)"
          >
            <div class="cam-view" :class="c.alarm ? 'cam-alarm' : ''" :style="camThumbStyle(c)">
              <span class="cam-live">{{ c.live ? 'LIVE' : '模拟画面' }}</span>
              <span class="cam-expand" aria-hidden="true">↗</span>
              <span v-if="c.alarm" class="cam-event">{{ c.event }}</span>
            </div>
            <div class="cam-name">{{ c.name }}</div>
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧悬浮面板列 -->
    <div class="map-side-rail map-side-rail--right">
      <div class="panel side-panel">
        <div class="panel-title">
          设施设备状态
          <span class="panel-extra">在线 {{ devices.onlineRate }}%</span>
        </div>
        <div class="dev-cards">
          <div v-for="d in devices.cards" :key="d.group" class="dev-card">
            <div class="dc-icon">{{ d.icon }}</div>
            <div class="dc-name">{{ d.label }}</div>
            <div class="dc-line"><span class="num-green">{{ d.ok }}</span>/<span>{{ d.total }}</span></div>
            <div v-if="d.fault" class="dc-fault">故障 {{ d.fault }}</div>
            <div v-else class="dc-fault ok">正常</div>
          </div>
        </div>
        <VChart :option="devicePieOption" height="120px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">
          运维养护工单状态
          <span class="panel-extra">超时 <b class="num-orange">{{ workOrders.overdue }}</b></span>
        </div>
        <div class="ticket-stats">
          <div v-for="item in orderTiles" :key="item.key" class="ts-item">
            <b :class="item.cls">{{ item.value }}</b><span>{{ item.label }}</span>
          </div>
        </div>
        <VChart :option="ticketOption" height="120px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">公众服务</div>
        <div class="pub-row">
          <div class="pub-item"><b class="num-blue">{{ publicService.feedbackToday }}</b><span>今日反馈</span></div>
          <div class="pub-item"><b class="num-green">{{ publicService.satisfactionRate }}%</b><span>满意度</span></div>
          <div class="pub-item"><b class="num-orange">{{ publicService.activeNotices }}</b><span>在发预警</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AlarmPanel from '../components/AlarmPanel.vue'
import TunnelScene from '../components/TunnelScene.vue'
import type { ScenePoint } from '../types/scene'
import { BASE_SCENE_POINTS } from '../config/scenePoints'
import VChart from '../components/VChart.vue'
import { useOverviewData, alertToPanelAlert, demoPanelAlerts, formatClock, sourceLabel } from '../api/usePageData'
import { api } from '../api/client'
import { openVideoPreview } from '../composables/useVideoPreview'
import type { CameraItem } from '../api/client'

const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const { summary, alerts, points, pointIdOf, source, load } = useOverviewData()

onMounted(load)

/* ----------------------------- 三维点位 ----------------------------- */

/** 后端 /scene/overview 的字段与前端 ScenePoint 对齐；无数据时用本地目录兜底，场景不至于空白 */
const scenePoints = computed<ScenePoint[]>(() => {
  const list = points.value
  if (!list.length) return BASE_SCENE_POINTS
  return list.map((point) => ({
    id: point.id,
    name: point.name,
    kind: point.kind as ScenePoint['kind'],
    group: point.group as ScenePoint['group'],
    status: point.status,
    left: point.left,
    top: point.top,
    leftNum: point.leftNum,
    scale: point.scale,
    stake: point.stake ?? '—',
    value: point.value ?? undefined,
    inspect: point.inspect ?? undefined,
    alarm: point.alarm ?? undefined,
    alertId: point.alertCode ?? undefined,
    unit: point.unit ?? undefined,
  }))
})

/* ----------------------------- 告警 ----------------------------- */

/** 真实告警 → 告警面板所需的字段；接口不可用时回落到本地示例并保持页面可用 */
const panelAlerts = computed(() =>
  alerts.value.length ? alerts.value.map(alertToPanelAlert) : demoPanelAlerts(),
)

function locateAlarm(alert: { pointId: string; id: string }) {
  const target = alerts.value.find((item) => (item.code || String(item.id)) === alert.id)
  const id = target ? pointIdOf(target) : alert.pointId
  if (id) sceneRef.value?.locatePoint(id)
}

/* ----------------------------- 交通 ----------------------------- */

const traffic = computed(() => summary.data.value?.traffic)
const mainFlow = computed(() => traffic.value?.flowVph ?? 0)
const congestionLabel = computed(() => traffic.value?.congestion ?? '—')
const congestionTagType = computed<'success' | 'warning' | 'danger'>(() => {
  const label = congestionLabel.value
  return label === '畅通' ? 'success' : label === '缓行' ? 'warning' : label === '拥堵' ? 'danger' : 'success'
})

const trafficOption = computed(() => {
  const hourly = traffic.value?.hourly ?? []
  return {
    grid: { left: 38, right: 8, top: 18, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: hourly.map((h) => h.hour),
      axisLabel: { fontSize: 9 },
    },
    yAxis: { type: 'value', name: '辆/时', axisLabel: { fontSize: 9 } },
    series: [
      {
        type: 'line',
        smooth: true,
        name: '北行',
        data: hourly.map((h) => h.north),
        lineStyle: { color: '#165dff' },
        itemStyle: { color: '#165dff' },
        areaStyle: { color: 'rgba(22,93,255,0.08)' },
      },
      {
        type: 'line',
        smooth: true,
        name: '南行',
        data: hourly.map((h) => h.south),
        lineStyle: { color: '#00b42a' },
        itemStyle: { color: '#00b42a' },
      },
    ],
  }
})

/* ----------------------------- 设备 ----------------------------- */

const devices = computed(
  () =>
    summary.data.value?.devices ?? {
      total: 0,
      online: 0,
      fault: 0,
      offline: 0,
      onlineRate: 0,
      cards: [],
      byStatus: [],
    },
)

const devicePieOption = computed(() => {
  const byStatus = devices.value.byStatus ?? []
  const colorOf: Record<string, string> = {
    ok: '#00b42a',
    warn: '#ff7d00',
    alarm: '#f53f3f',
    offline: '#c9cdd4',
  }
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, itemWidth: 10, textStyle: { fontSize: 10 } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '42%'],
        label: { show: false },
        data: byStatus.map((item) => ({
          value: item.value,
          name: item.label,
          itemStyle: { color: colorOf[item.key] ?? '#165dff' },
        })),
      },
    ],
  }
})

/* ----------------------------- 工单 ----------------------------- */

const workOrders = computed(
  () => summary.data.value?.workOrders ?? { byStatus: [], total: 0, overdue: 0, last7Days: [] },
)

const orderTiles = computed(() => {
  const map = new Map(workOrders.value.byStatus.map((item) => [item.key, item.value]))
  return [
    { key: 'pending', label: '待派发', value: map.get('pending') ?? 0, cls: 'num-orange' },
    { key: 'processing', label: '处理中', value: map.get('processing') ?? 0, cls: 'num-blue' },
    { key: 'reviewing', label: '待验收', value: map.get('reviewing') ?? 0, cls: 'num-orange' },
    { key: 'completed', label: '已完成', value: map.get('completed') ?? 0, cls: 'num-green' },
  ]
})

const ticketOption = computed(() => {
  const days = workOrders.value.last7Days ?? []
  return {
    grid: { left: 38, right: 8, top: 18, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days.map((d) => d.date), axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
    series: [
      { name: '新增', type: 'bar', stack: 't', data: days.map((d) => d.created), itemStyle: { color: '#165dff' }, barWidth: 12 },
      { name: '完成', type: 'bar', stack: 't', data: days.map((d) => d.completed), itemStyle: { color: '#00b42a' }, barWidth: 12 },
    ],
  }
})

/* ----------------------------- 公众服务 ----------------------------- */

const publicService = computed(
  () =>
    summary.data.value?.publicService ?? {
      feedbackToday: 0,
      feedbackPending: 0,
      satisfactionRate: 0,
      activeNotices: 0,
      reach24h: 0,
    },
)

/* ----------------------------- 视频点位 ----------------------------- */

interface WallCamera {
  id: string
  pointId: string
  name: string
  stake: string
  src: string
  alarm: boolean
  event: string
  live: boolean
}

const FALLBACK_THUMB = '/img/cctv-placeholder.svg'

/** 摄像机台账来自后端 /cameras（previewUrl 为占位示例画面） */
const cameraRows = ref<CameraItem[]>([])

const cams = computed<WallCamera[]>(() => {
  if (!cameraRows.value.length) {
    return [
      { id: 'cam-demo-1', pointId: 'c1', name: '北口 K2+100', stake: 'K2+100', src: FALLBACK_THUMB, alarm: false, event: '', live: false },
      { id: 'cam-demo-2', pointId: 'c2', name: '事件断面 K3+050', stake: 'K3+050', src: FALLBACK_THUMB, alarm: true, event: '违停', live: false },
    ]
  }
  return cameraRows.value.slice(0, 4).map((cam) => ({
    id: cam.code,
    pointId: cam.pointId ?? '',
    name: cam.name,
    stake: cam.stake ?? '—',
    src: cam.previewUrl ?? FALLBACK_THUMB,
    alarm: cam.status === 'alarm',
    event: cam.status === 'alarm' ? 'AI事件' : '',
    live: cam.live,
  }))
})

function camThumbStyle(c: WallCamera) {
  return {
    backgroundImage: `url(${c.src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: c.alarm ? 'saturate(1.2) contrast(1.05)' : undefined,
  }
}

function openCamera(c: WallCamera) {
  if (c.pointId) sceneRef.value?.locatePoint(c.pointId)
  openVideoPreview({
    id: c.id,
    pointId: c.pointId,
    name: c.name,
    stake: c.stake,
    src: c.src,
    alarm: c.alarm,
    event: c.event,
  })
}

/* 摄像机台账与告警并行拉取，失败时不影响大屏其它面板 */
onMounted(async () => {
  try {
    const result = await api.get<{ items: CameraItem[] } | CameraItem[]>('/cameras')
    cameraRows.value = Array.isArray(result) ? result : result.items
  } catch {
    cameraRows.value = []
  }
})
</script>

<style scoped lang="scss">
.overview-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.data-source {
  position: absolute;
  left: 12px;
  top: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(6, 20, 40, 0.78);
  border: 1px solid rgba(120, 190, 255, 0.28);
  color: #cfe4ff;
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #00b42a; }
  &.demo .dot { background: #ff7d00; }
  &.loading .dot { background: #7188a8; }
  .ts { color: #7188a8; }
}

.scene-wrap {
  position: absolute;
  inset: 0;
  z-index: 0;
  :deep(.tunnel-scene) {
    border-radius: 0;
    background: #061428;
  }
}

.side-panel {
  .panel-title { font-size: 14px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
  .panel-extra { font-size: 11px; color: #7188a8; font-weight: 400; }
}

.traffic-now {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; margin-bottom: 2px;
}

.dev-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
.dev-card {
  text-align: center;
  border: 1px solid rgba(120, 190, 255, 0.22);
  border-radius: 10px;
  padding: 8px 4px 7px;
  background: linear-gradient(180deg, rgba(28, 64, 120, 0.45), rgba(8, 22, 48, 0.35));
  .dc-icon {
    width: 28px; height: 28px; margin: 0 auto 4px;
    display: grid; place-items: center; font-size: 15px; line-height: 1;
    border-radius: 8px;
    background: rgba(8, 24, 48, 0.72);
    border: 1px solid rgba(150, 210, 255, 0.35);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }
  .dc-name { font-size: 10px; color: #d5e6ff; margin: 2px 0; }
  .dc-line { font-size: 10px; color: #cfe4ff; }
  .dc-fault { font-size: 9px; color: #ff5f6b; &.ok { color: #2ee6a0; } }
}

.ticket-stats { display: flex; gap: 6px; margin-bottom: 6px; }
.ts-item {
  flex: 1; text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 4px; padding: 6px 0;
  b { display: block; font-size: 17px; }
  span { font-size: 10px; color: #7188a8; }
}

.cam-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.cam-cell {
  padding: 0; font: inherit; text-align: left; color: inherit; background: transparent; cursor: pointer;
  &:focus-visible { outline: 1px solid #9ec9d8; outline-offset: 3px; }
 .cam-view {
    position: relative; height: 78px; border-radius: 5px; overflow: hidden;
    background-color: #0b1220;
    border: 1px solid rgba(100, 160, 220, 0.35);
    .cam-expand { position: absolute; right: 7px; top: 5px; color: #c6e0ec; font-size: 16px; text-shadow: 0 1px 5px #000; }
.cam-live {
      position: absolute; top: 5px; left: 6px; z-index: 2;
      font-size: 10px; color: #fff; font-weight: 800;
      background: rgba(220, 38, 38, 0.9); padding: 1px 5px; border-radius: 3px;
      letter-spacing: 0.5px;
    }
    &.cam-alarm { outline: 2px solid #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.45); }
    .cam-event {
      position: absolute; bottom: 5px; right: 5px; z-index: 2;
      font-size: 11px; color: #fff; font-weight: 700;
      background: #ef4444; border-radius: 3px; padding: 1px 6px;
    }
  }
  .cam-name { font-size: 12px; color: #e2eefc; font-weight: 600; text-align: center; margin-top: 4px; }
}

.pub-row { display: flex; }
.pub-item {
  flex: 1; text-align: center;
  b { display: block; font-size: 16px; }
  span { font-size: 10px; color: #7188a8; }
}
</style>
