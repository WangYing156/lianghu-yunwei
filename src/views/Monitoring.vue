<template>
  <div class="page-bg">
    <!-- 监测点位三维场景 -->
    <div class="panel scene-panel">
      <TunnelScene map-mode resizable :points="monitorPoints" height="320px" />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 环控系统监测 · 环境气体 -->
      <div class="panel">
        <div class="panel-title">环控系统监测 · 环境气体</div>
        <div class="gas-stats">
          <div class="gas-item"><b class="num-green">12</b><span>CO (ppm)</span></div>
          <div class="gas-item"><b class="num-orange">0.12</b><span>NO₂ (ppm)</span></div>
          <div class="gas-item"><b class="num-blue">0.8</b><span>O₂ (%)</span></div>
          <div class="gas-item"><b class="num-green">18</b><span>能见度 (m)</span></div>
        </div>
        <VChart :option="gasOption" height="170px" />
        <el-alert type="warning" :closable="false" style="margin-top: 6px"
          title="K3+800 处 NO₂ 浓度 0.12ppm 偏高，建议加大新风换气量。" />
      </div>

      <!-- 环控系统监测 · 环境照明 -->
      <div class="panel">
        <div class="panel-title">环控系统监测 · 环境照明</div>
        <div class="gas-stats">
          <div class="gas-item"><b class="num-blue">128</b><span>平均照度 (lux)</span></div>
          <div class="gas-item"><b class="num-green">96</b><span>照明回路 (路)</span></div>
          <div class="gas-item"><b class="num-orange">2</b><span>故障回路</span></div>
          <div class="gas-item"><b class="num-green">94</b><span>在线率 (%)</span></div>
        </div>
        <VChart :option="illumOption" height="170px" />
        <el-alert type="info" :closable="false" style="margin-top: 6px"
          title="夜间段照度自动调节正常，出入口加强段照度符合规范。" />
      </div>
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 环控系统监测 · 新风换气 -->
      <div class="panel">
        <div class="panel-title">环控系统监测 · 新风换气设备</div>
        <el-table :data="ventDevices" size="small" height="210">
          <el-table-column prop="name" label="设备" />
          <el-table-column prop="stake" label="位置" width="90" />
          <el-table-column prop="status" label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.run ? 'success' : 'info'" size="small">{{ row.run ? '运行' : '待机' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="val" label="参数" width="90" />
        </el-table>
        <div class="vent-summary">
          <span>新风量合计 <b class="num-blue">42,600</b> m³/h</span>
          <span>换气次数 <b class="num-green">6.2</b> 次/h</span>
        </div>
      </div>

      <!-- 结构监测 -->
      <div class="panel">
        <div class="panel-title">结构监测 · 沉降 / 变形</div>
        <div class="mini-title">结构沉降监测（mm）</div>
        <VChart :option="settleOption" height="160px" />
        <el-table :data="structPoints" size="small" height="150" style="margin-top: 10px">
          <el-table-column prop="name" label="测点" />
          <el-table-column prop="stake" label="桩号" width="90" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="val" label="当前值" width="80" />
          <el-table-column label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.warn ? 'warning' : 'success'" size="small">{{ row.warn ? '关注' : '正常' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'
import VChart from '../components/VChart.vue'

/* 监测点位三维场景（环控 + 结构监测） */
const monitorPoints: ScenePoint[] = [
  { id: 'ill1', name: '环境亮度 L1', kind: 'illum', group: 'env', status: 'ok', left: '34%', top: '50%', leftNum: 34, scale: 0.9, stake: 'K2+800', value: '128 lux', unit: 'lux', history: [
    { time: '08:00', value: 96 }, { time: '10:00', value: 110 }, { time: '12:00', value: 128 }, { time: '14:00', value: 122 }, { time: '16:00', value: 105 }, { time: '18:00', value: 88 }
  ] },
  { id: 'co1', name: '气体监测 G1', kind: 'covi', group: 'env', status: 'ok', left: '58%', top: '50%', leftNum: 58, scale: 0.9, stake: 'K3+300', value: 'CO 15ppm', unit: 'ppm', history: [
    { time: '08:00', value: 10 }, { time: '10:00', value: 12 }, { time: '12:00', value: 14 }, { time: '14:00', value: 13 }, { time: '16:00', value: 15 }, { time: '18:00', value: 15 }
  ] },
  { id: 'co2', name: '气体监测 G2', kind: 'covi', group: 'env', status: 'warn', left: '72%', top: '52%', leftNum: 72, scale: 0.8, stake: 'K3+800', value: 'NO₂ 0.12', alarm: 'NO₂ 偏高', unit: 'ppm', history: [
    { time: '08:00', value: 0.06 }, { time: '10:00', value: 0.08 }, { time: '12:00', value: 0.09 }, { time: '14:00', value: 0.1 }, { time: '16:00', value: 0.11 }, { time: '18:00', value: 0.12 }
  ] },
  { id: 'wind1', name: '风速风向 W1', kind: 'wind', group: 'env', status: 'ok', left: '46%', top: '38%', leftNum: 46, scale: 0.85, stake: 'K3+100', value: '2.8m/s', unit: 'm/s', history: [
    { time: '08:00', value: 2.2 }, { time: '10:00', value: 2.5 }, { time: '12:00', value: 2.8 }, { time: '14:00', value: 2.6 }, { time: '16:00', value: 2.9 }, { time: '18:00', value: 2.7 }
  ] },
  { id: 'set1', name: '沉降监测 S1', kind: 'stress', group: 'monitor', status: 'ok', left: '24%', top: '40%', leftNum: 24, scale: 0.95, stake: 'K2+400', value: '0.4mm', unit: 'mm', history: [
    { time: '9月', value: 0.2 }, { time: '10月', value: 0.25 }, { time: '11月', value: 0.3 }, { time: '12月', value: 0.35 }, { time: '1月', value: 0.38 }, { time: '2月', value: 0.4 }
  ] },
  { id: 'set2', name: '沉降监测 S2', kind: 'stress', group: 'monitor', status: 'warn', left: '52%', top: '38%', leftNum: 52, scale: 0.9, stake: 'K3+200', value: '1.1mm', alarm: '沉降速率偏高', unit: 'mm', history: [
    { time: '9月', value: 0.4 }, { time: '10月', value: 0.55 }, { time: '11月', value: 0.7 }, { time: '12月', value: 0.85 }, { time: '1月', value: 0.98 }, { time: '2月', value: 1.1 }
  ] },
  { id: 'def1', name: '变形监测 D1', kind: 'stress', group: 'monitor', status: 'ok', left: '70%', top: '40%', leftNum: 70, scale: 0.85, stake: 'K3+800', value: '0.3mm', unit: 'mm', history: [
    { time: '9月', value: 0.15 }, { time: '10月', value: 0.2 }, { time: '11月', value: 0.22 }, { time: '12月', value: 0.25 }, { time: '1月', value: 0.28 }, { time: '2月', value: 0.3 }
  ] },
  { id: 'bolt1', name: '螺栓受力 B1', kind: 'bolt', group: 'monitor', status: 'ok', left: '38%', top: '30%', leftNum: 38, scale: 0.8, stake: 'K3+000', value: '18.2kN', unit: 'kN', history: [
    { time: '9月', value: 17.8 }, { time: '10月', value: 17.9 }, { time: '11月', value: 18.0 }, { time: '12月', value: 18.1 }, { time: '1月', value: 18.2 }, { time: '2月', value: 18.2 }
  ] },
  { id: 'cor1', name: '腐蚀监测 C1', kind: 'corrosion', group: 'monitor', status: 'ok', left: '62%', top: '30%', leftNum: 62, scale: 0.8, stake: 'K3+500', value: '0.02mm/y', unit: 'mm/y', history: [
    { time: '9月', value: 0.015 }, { time: '10月', value: 0.016 }, { time: '11月', value: 0.018 }, { time: '12月', value: 0.019 }, { time: '1月', value: 0.02 }, { time: '2月', value: 0.02 }
  ] }
]

const ventDevices = [
  { name: '轴流风机 JF-1', stake: 'K2+900', run: true, val: '35Hz' },
  { name: '轴流风机 JF-2', stake: 'K3+600', run: true, val: '30Hz' },
  { name: '新风机组 XF-1', stake: 'K2+500', run: true, val: '45Hz' },
  { name: '新风机组 XF-2', stake: 'K3+400', run: false, val: '待机' },
  { name: '排烟风机 PY-1', stake: 'K3+000', run: false, val: '待机' }
]

const structPoints = [
  { name: '沉降监测 S1', stake: 'K2+400', type: '沉降', val: '0.4mm', warn: false },
  { name: '沉降监测 S2', stake: 'K3+200', type: '沉降', val: '1.1mm', warn: true },
  { name: '变形监测 D1', stake: 'K3+800', type: '变形', val: '0.3mm', warn: false },
  { name: '螺栓受力 B1', stake: 'K3+000', type: '受力', val: '18.2kN', warn: false },
  { name: '腐蚀监测 C1', stake: 'K3+500', type: '腐蚀', val: '0.02mm/y', warn: false }
]

const gasOption = {
  grid: { left: 36, right: 10, top: 20, bottom: 22 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['13:20', '13:35', '13:50', '14:05', '14:20'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', name: 'ppm', axisLabel: { fontSize: 10 } },
  series: [
    { name: 'CO', type: 'line', smooth: true, data: [10, 11, 12, 11.5, 12], lineStyle: { color: '#00b42a' }, itemStyle: { color: '#00b42a' } },
    { name: 'NO₂', type: 'line', smooth: true, data: [0.06, 0.08, 0.09, 0.11, 0.12], lineStyle: { color: '#ff7d00' }, itemStyle: { color: '#ff7d00' } }
  ]
}

const illumOption = {
  grid: { left: 36, right: 10, top: 20, bottom: 22 },
  xAxis: { type: 'category', data: ['00时', '04时', '08时', '12时', '16时', '20时'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', name: 'lux', axisLabel: { fontSize: 10 } },
  series: [{
    type: 'line', smooth: true, data: [80, 82, 120, 128, 110, 96],
    lineStyle: { color: '#165dff' }, itemStyle: { color: '#165dff' },
    areaStyle: { color: 'rgba(22,93,255,0.1)' }
  }]
}

const settleOption = {
  grid: { left: 36, right: 10, top: 20, bottom: 22 },
  xAxis: { type: 'category', data: ['K2+2', 'K2+6', 'K3+0', 'K3+4', 'K3+8', 'K4+2'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', name: 'mm', axisLabel: { fontSize: 10 } },
  series: [
    { name: '本期沉降', type: 'bar', data: [0.4, 0.6, 0.9, 1.1, 0.7, 0.5], itemStyle: { color: '#165dff' }, barWidth: 14 },
    { name: '累计沉降', type: 'line', data: [2.1, 2.6, 3.4, 4.2, 4.8, 5.2], lineStyle: { color: '#ff7d00' }, itemStyle: { color: '#ff7d00' } }
  ]
}
</script>

<style scoped lang="scss">
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
