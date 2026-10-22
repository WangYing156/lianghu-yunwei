<template>
  <div class="overview-root map-layout-full">
    <!-- 三维场景铺满 -->
    <div class="scene-wrap">
      <TunnelScene ref="sceneRef" map-mode :points="points" height="100%" />
    </div>

    <!-- 左侧悬浮面板列 -->
    <div class="map-side-rail map-side-rail--left">
      <div class="panel side-panel">
        <AlarmPanel :items="DEMO_ALERTS" @locate="locateAlarm" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">交通状况</div>
        <div class="traffic-now">
          <span>断面流量 <b class="num-blue">1,860</b> 辆/时</span>
          <el-tag type="success" size="small">畅通</el-tag>
        </div>
        <VChart :option="trafficOption" height="130px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">重点监控</div>
        <p class="panel-sub">关键断面 · 点击放大并定位</p>
        <div class="cam-grid">
          <button v-for="c in cams" :key="c.id" type="button" class="cam-cell" :aria-label="`打开${c.name}监控画面并定位`" @click="openVideoPreview(c)">
            <div class="cam-view" :class="c.alarm ? 'cam-alarm' : ''" :style="camThumbStyle(c)">
              <span class="cam-live">模拟画面</span><span class="cam-expand" aria-hidden="true">↗</span>
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
        <div class="panel-title">设施设备状态</div>
        <div class="dev-cards">
          <div v-for="d in devices" :key="d.name" class="dev-card">
            <div class="dc-icon">{{ d.icon }}</div>
            <div class="dc-name">{{ d.name }}</div>
            <div class="dc-line"><span class="num-green">{{ d.ok }}</span>/<span>{{ d.total }}</span></div>
            <div v-if="d.fault" class="dc-fault">故障 {{ d.fault }}</div>
            <div v-else class="dc-fault ok">正常</div>
          </div>
        </div>
        <VChart :option="devicePieOption" height="120px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">运维养护工单状态</div>
        <div class="ticket-stats">
          <div class="ts-item"><b class="num-orange">6</b><span>待派发</span></div>
          <div class="ts-item"><b class="num-blue">14</b><span>处理中</span></div>
          <div class="ts-item"><b class="num-orange">3</b><span>待验收</span></div>
          <div class="ts-item"><b class="num-green">128</b><span>已完成</span></div>
        </div>
        <VChart :option="ticketOption" height="120px" />
      </div>

      <div class="panel side-panel">
        <div class="panel-title">公众服务</div>
        <div class="pub-row">
          <div class="pub-item"><b class="num-blue">37</b><span>今日反馈</span></div>
          <div class="pub-item"><b class="num-green">92.4%</b><span>满意度</span></div>
          <div class="pub-item"><b class="num-orange">4</b><span>在发预警</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AlarmPanel from '../components/AlarmPanel.vue'
import { DEMO_ALERTS, type TunnelAlert } from '../config/alerts'
import TunnelScene from '../components/TunnelScene.vue'
import VChart from '../components/VChart.vue'
import { BASE_SCENE_POINTS } from '../config/scenePoints'
import { CCTV_CAMERAS } from '../config/cctvGallery'
import { openVideoPreview } from '../composables/useVideoPreview'

const points = BASE_SCENE_POINTS

const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const devices = [
  { name: '视频监控', icon: '📹', ok: 86, total: 88, fault: 2 },
  { name: '环境感知', icon: '📡', ok: 61, total: 64, fault: 1 },
  { name: '通风设备', icon: '🌀', ok: 23, total: 24, fault: 1 },
  { name: '排涝设备', icon: '⚙️', ok: 18, total: 18, fault: 0 },
  { name: '照明系统', icon: '💡', ok: 94, total: 96, fault: 2 },
  { name: '诱导屏', icon: '🚹', ok: 44, total: 48, fault: 4 }
]

const cams = CCTV_CAMERAS

function camThumbStyle(c: (typeof cams)[number]) {
  return {
    backgroundImage: `url(${c.src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: c.alarm ? 'saturate(1.2) contrast(1.05)' : undefined
  }
}

const devicePieOption = {
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, itemWidth: 10, textStyle: { fontSize: 10 } },
  series: [{
    type: 'pie', radius: ['40%', '65%'], center: ['50%', '42%'],
    label: { show: false },
    data: [
      { value: 326, name: '正常运行', itemStyle: { color: '#00b42a' } },
      { value: 8, name: '故障/告警', itemStyle: { color: '#f53f3f' } },
      { value: 4, name: '离线', itemStyle: { color: '#c9cdd4' } }
    ]
  }]
}

const trafficOption = {
  grid: { left: 38, right: 8, top: 18, bottom: 22 },
  xAxis: { type: 'category', data: ['8时', '10时', '12时', '14时', '16时', '18时', '20时'], axisLabel: { fontSize: 9 } },
  yAxis: { type: 'value', name: '辆/时', axisLabel: { fontSize: 9 } },
  series: [
    { type: 'line', smooth: true, name: '北行', data: [820, 1100, 1560, 1860, 1720, 2050, 1300], lineStyle: { color: '#165dff' }, itemStyle: { color: '#165dff' }, areaStyle: { color: 'rgba(22,93,255,0.08)' } },
    { type: 'line', smooth: true, name: '南行', data: [760, 980, 1400, 1690, 1610, 1980, 1180], lineStyle: { color: '#00b42a' }, itemStyle: { color: '#00b42a' } }
  ]
}

const ticketOption = {
  grid: { left: 38, right: 8, top: 18, bottom: 22 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '今日'], axisLabel: { fontSize: 9 } },
  yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
  series: [
    { name: '新增', type: 'bar', stack: 't', data: [8, 12, 9, 15, 11, 6, 10], itemStyle: { color: '#165dff' }, barWidth: 12 },
    { name: '完成', type: 'bar', stack: 't', data: [7, 10, 11, 12, 13, 8, 6], itemStyle: { color: '#00b42a' }, barWidth: 12 }
  ]
}

function locateAlarm(alert: TunnelAlert) {
  sceneRef.value?.locatePoint(alert.pointId)
}
</script>

<style scoped lang="scss">
.overview-root {
  position: relative;
  height: 100%;
  overflow: hidden;
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
  .panel-title { font-size: 14px; margin-bottom: 10px; }
}

.traffic-now {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; margin-bottom: 2px;
}

.dev-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
.dev-card {
  text-align: center; border: 1px solid rgba(70, 140, 230, 0.25); border-radius: 4px; padding: 6px 2px;
  .dc-icon { font-size: 16px; }
  .dc-name { font-size: 10px; color: #aebcd8; margin: 2px 0; }
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
