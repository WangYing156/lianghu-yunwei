<template>
  <div class="overview-root map-layout-full">
    <!-- 三维场景铺满 -->
    <div class="scene-wrap">
      <MarkPoint :index="1" doc-key="overview.scene" />
      <TunnelScene map-mode :points="points" height="100%" />
    </div>

    <!-- 左侧悬浮面板列 -->
    <div class="map-side-rail map-side-rail--left">
      <div class="panel side-panel">
        <MarkPoint :index="2" doc-key="overview.alarm" />
        <div class="panel-title">全局告警面板</div>
        <p class="panel-sub">聚焦：紧急/重要告警处置入口</p>
        <div class="alarm-stats">
          <div class="as-item red"><div class="as-num">2</div><div>紧急</div></div>
          <div class="as-item orange"><div class="as-num">5</div><div>重要</div></div>
          <div class="as-item blue"><div class="as-num">12</div><div>一般</div></div>
          <div class="as-item gray"><div class="as-num">28</div><div>提示</div></div>
        </div>
        <el-table :data="alarms" size="small" height="150" @row-click="locateAlarm">
          <el-table-column prop="time" label="时间" width="62" />
          <el-table-column prop="level" label="级别" width="54">
            <template #default="{ row }"><el-tag :type="row.lvType" size="small">{{ row.level }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="desc" label="告警内容" />
        </el-table>
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
        <p class="panel-sub">聚焦：关键断面实时画面</p>
        <div class="cam-grid">
          <div v-for="c in cams" :key="c.name" class="cam-cell">
            <div class="cam-view" :class="c.alarm ? 'cam-alarm' : ''" :style="camThumbStyle(c)">
              <span class="cam-live">LIVE</span>
              <span v-if="c.alarm" class="cam-event">{{ c.event }}</span>
            </div>
            <div class="cam-name">{{ c.name }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧悬浮面板列 -->
    <div class="map-side-rail map-side-rail--right">
      <div class="panel side-panel">
        <MarkPoint :index="3" doc-key="overview.device" />
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
        <MarkPoint :index="4" doc-key="overview.ticket" />
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
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'
import VChart from '../components/VChart.vue'
import MarkPoint from '../components/MarkPoint.vue'
import { pickRandomCctvImages } from '../config/cctvGallery'

const points: ScenePoint[] = [
  // 隧道环境（主体）
  { id: 'st1', name: '结构上层 K2+100~K4+300', kind: 'structureUp', group: 'structure', status: 'ok', left: '40%', top: '30%', leftNum: 40, scale: 0.9, stake: 'K2+100~K4+300', value: '正常', inspect: '2026-10-10' },
  { id: 'st2', name: '结构下层 K3+600', kind: 'structureDown', group: 'structure', status: 'ok', left: '70%', top: '44%', leftNum: 70, scale: 0.8, stake: 'K3+600', value: '正常', inspect: '2026-10-08' },
  { id: 'pipe1', name: '机电管线廊', kind: 'pipe', group: 'structure', status: 'ok', left: '55%', top: '70%', leftNum: 55, scale: 0.75, stake: 'K3+200', value: '正常', inspect: '2026-10-05' },
  { id: 'pass1', name: '应急通道口', kind: 'passage', group: 'structure', status: 'ok', left: '30%', top: '66%', leftNum: 30, scale: 0.8, stake: 'K2+600', value: '畅通', inspect: '2026-10-06' },
  { id: 'oc1', name: '隧道运管中心', kind: 'opsCenter', group: 'structure', status: 'ok', left: '14%', top: '14%', leftNum: 14, scale: 1.05, stake: '南湖段管理中心', value: '运行', inspect: '2026-10-15' },
  { id: 'rp1', name: '雨水泵房', kind: 'rainPump', group: 'structure', status: 'ok', left: '38%', top: '84%', leftNum: 38, scale: 0.95, stake: 'K3+000 东侧', value: '待机', inspect: '2026-10-14' },
  { id: 'fs1', name: '消防泵房', kind: 'fireStation', group: 'structure', status: 'ok', left: '48%', top: '82%', leftNum: 48, scale: 0.95, stake: 'K3+000', value: '待机', inspect: '2026-10-14' },
  { id: 'wp1', name: '废水泵房', kind: 'wastePump', group: 'structure', status: 'ok', left: '58%', top: '84%', leftNum: 58, scale: 0.95, stake: 'K3+000 西侧', value: '运行', inspect: '2026-10-14' },
  { id: 'ss1', name: '变电所', kind: 'substation', group: 'structure', status: 'ok', left: '20%', top: '26%', leftNum: 20, scale: 0.95, stake: 'K2+400', value: '供电正常', inspect: '2026-10-13' },
  // 交通管控
  { id: 'c1', name: '固定摄像机 K2+300', kind: 'camera', group: 'traffic', status: 'ok', left: '18%', top: '30%', leftNum: 18, scale: 1.1, stake: 'K2+300', value: '1080P', inspect: '2026-10-14' },
  { id: 'c2', name: '固定摄像机 K3+050', kind: 'camera', group: 'traffic', status: 'alarm', left: '46%', top: '26%', leftNum: 46, scale: 0.95, stake: 'K3+050', value: 'AI事件', alarm: '违停事件未确认', inspect: '2026-10-15', unit: '辆/min', history: [
    { time: '14:00', value: 42 }, { time: '14:05', value: 38 }, { time: '14:10', value: 55 }, { time: '14:12', value: 88 }, { time: '14:15', value: 61 }
  ] },
  { id: 'dome1', name: '球形摄像机 K3+800', kind: 'dome', group: 'traffic', status: 'ok', left: '74%', top: '32%', leftNum: 74, scale: 0.8, stake: 'K3+800', value: '在线', inspect: '2026-10-13' },
  { id: 'sc1', name: '可变情报板 K2+600', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '24%', top: '62%', leftNum: 24, scale: 1.05, stake: 'K2+600', value: '限速60', inspect: '2026-10-11' },
  { id: 'sc2', name: '可变情报板 K3+400', kind: 'infoBoard', group: 'traffic', status: 'offline', left: '60%', top: '64%', leftNum: 60, scale: 0.85, stake: 'K3+400', value: '离线 32min', inspect: '2026-10-08' },
  { id: 'lane1', name: '车道指示器 K3+100', kind: 'laneInd', group: 'traffic', status: 'ok', left: '42%', top: '58%', leftNum: 42, scale: 0.85, stake: 'K3+100', value: '绿灯', inspect: '2026-10-10' },
  { id: 'vd1', name: '车辆检测器 K2+800', kind: 'vehicleDet', group: 'traffic', status: 'ok', left: '34%', top: '74%', leftNum: 34, scale: 0.8, stake: 'K2+800', value: '正常', inspect: '2026-10-07' },
  { id: 'ph1', name: '紧急电话 K3+300', kind: 'phone', group: 'traffic', status: 'ok', left: '52%', top: '68%', leftNum: 52, scale: 0.8, stake: 'K3+300', value: '正常', inspect: '2026-10-09' },
  { id: 'spk1', name: '广播扬声器 K2+500', kind: 'speaker', group: 'traffic', status: 'ok', left: '28%', top: '52%', leftNum: 28, scale: 0.8, stake: 'K2+500', value: '正常', inspect: '2026-10-07' },
  // 环控系统
  { id: 's1', name: 'CO/VI检测器', kind: 'covi', group: 'env', status: 'ok', left: '24%', top: '46%', leftNum: 24, scale: 1, stake: 'K2+500', value: 'CO 12ppm', inspect: '2026-10-10', unit: 'ppm', history: [
    { time: '08:00', value: 8 }, { time: '10:00', value: 11 }, { time: '12:00', value: 14 }, { time: '14:00', value: 12 }, { time: '16:00', value: 10 }
  ] },
  { id: 'wind1', name: '风速风向仪 K3+000', kind: 'wind', group: 'env', status: 'ok', left: '44%', top: '20%', leftNum: 44, scale: 0.9, stake: 'K3+000', value: '2.4m/s', inspect: '2026-10-11' },
  { id: 's2', name: '照度计', kind: 'illum', group: 'env', status: 'warn', left: '58%', top: '50%', leftNum: 58, scale: 0.9, stake: 'K3+200', value: '86 lux', inspect: '2026-10-09', alarm: '照度偏低预警' },
  { id: 'fl1', name: '火焰探测器 K3+500', kind: 'flame', group: 'env', status: 'ok', left: '64%', top: '22%', leftNum: 64, scale: 0.85, stake: 'K3+500', value: '正常', inspect: '2026-10-12' },
  { id: 'tmp1', name: '感温探测器', kind: 'heatSensor', group: 'env', status: 'ok', left: '62%', top: '18%', leftNum: 62, scale: 0.8, stake: 'K3+400', value: '24.6℃', inspect: '2026-10-12' },
  { id: 'smk1', name: '感烟探测器 K2+900', kind: 'smokeSensor', group: 'env', status: 'ok', left: '36%', top: '22%', leftNum: 36, scale: 0.8, stake: 'K2+900', value: '正常', inspect: '2026-10-12' },
  { id: 'w1', name: '积水监测 W1', kind: 'waterLevel', group: 'env', status: 'ok', left: '66%', top: '80%', leftNum: 66, scale: 0.8, stake: 'K3+700', value: '2.1cm', inspect: '2026-10-15' },
  // 结构监测
  { id: 'set1', name: '应力应变监测点', kind: 'stress', group: 'monitor', status: 'ok', left: '50%', top: '44%', leftNum: 50, scale: 0.8, stake: 'K3+200', value: '0.6mm', inspect: '2026-10-12', unit: 'mm', history: [
    { time: '周一', value: 0.52 }, { time: '周二', value: 0.55 }, { time: '周三', value: 0.58 }, { time: '周四', value: 0.6 }, { time: '周五', value: 0.59 }
  ] },
  { id: 'def1', name: '应力应变监测点', kind: 'stress', group: 'monitor', status: 'ok', left: '80%', top: '46%', leftNum: 80, scale: 0.75, stake: 'K3+900', value: '0.3mm', inspect: '2026-10-12' },
  { id: 'cor1', name: '结构腐蚀监测 K3+100', kind: 'corrosion', group: 'monitor', status: 'ok', left: '40%', top: '40%', leftNum: 40, scale: 0.8, stake: 'K3+100', value: '正常', inspect: '2026-10-11' },
  { id: 'blt1', name: '螺栓受力监测 K3+600', kind: 'bolt', group: 'monitor', status: 'ok', left: '68%', top: '40%', leftNum: 68, scale: 0.8, stake: 'K3+600', value: '正常', inspect: '2026-10-11' },
  { id: 'prs1', name: '压力监测 K2+700', kind: 'pressure', group: 'monitor', status: 'ok', left: '30%', top: '40%', leftNum: 30, scale: 0.8, stake: 'K2+700', value: '0.25MPa', inspect: '2026-10-11' },
  // 隧道机电
  { id: 'f1', name: '风机 1#', kind: 'fan', group: 'mep', status: 'ok', left: '36%', top: '18%', leftNum: 36, scale: 0.95, stake: 'K2+900', value: '运行', inspect: '2026-10-06' },
  { id: 'f2', name: '风机 2#', kind: 'fan', group: 'mep', status: 'ok', left: '68%', top: '16%', leftNum: 68, scale: 0.8, stake: 'K3+600', value: '待机', inspect: '2026-10-06' },
  { id: 'dm1', name: '风阀 K2+800', kind: 'damper', group: 'mep', status: 'ok', left: '32%', top: '24%', leftNum: 32, scale: 0.8, stake: 'K2+800', value: '开启', inspect: '2026-10-06' },
  { id: 'vt1', name: '风口 K3+200', kind: 'vent', group: 'mep', status: 'ok', left: '50%', top: '26%', leftNum: 50, scale: 0.8, stake: 'K3+200', value: '正常', inspect: '2026-10-06' },
  { id: 'fp1', name: '消防水泵 K3+000', kind: 'firePump', group: 'mep', status: 'ok', left: '44%', top: '78%', leftNum: 44, scale: 0.85, stake: '泵房K3+000', value: '待机', inspect: '2026-10-01' },
  { id: 'fv1', name: '消防闸阀 K3+000', kind: 'fireValve', group: 'mep', status: 'ok', left: '50%', top: '80%', leftNum: 50, scale: 0.8, stake: '泵房K3+000', value: '开启', inspect: '2026-10-01' },
  { id: 'p1', name: '排水泵 P1', kind: 'pump', group: 'mep', status: 'ok', left: '40%', top: '82%', leftNum: 40, scale: 0.9, stake: '泵房K3+000', value: '0.4MPa', inspect: '2026-10-01' },
  { id: 'lamp1', name: '照明灯组 K2+400', kind: 'lamp', group: 'mep', status: 'ok', left: '26%', top: '34%', leftNum: 26, scale: 0.85, stake: 'K2+400', value: '96回路', inspect: '2026-10-05' }
]

const alarms = [
  { time: '14:12', level: '紧急', lvType: 'danger', src: '安全应急', desc: 'K3+050 积水液位快速上升，触发红色预警' },
  { time: '13:48', level: '重要', lvType: 'warning', src: '智能交通', desc: 'K3+050 AI 识别违停事件，超时未确认' },
  { time: '13:20', level: '重要', lvType: 'warning', src: '智慧养护', desc: '诱导屏 K3+400 离线超过 30 分钟' },
  { time: '12:55', level: '一般', lvType: 'primary', src: '智慧养护', desc: 'K3+200 照度偏低，建议检查照明回路' },
  { time: '11:30', level: '一般', lvType: 'primary', src: '智能交通', desc: '断面流量骤降 40%，疑似拥堵' }
]

const devices = [
  { name: '视频监控', icon: '📹', ok: 86, total: 88, fault: 2 },
  { name: '环境感知', icon: '📡', ok: 61, total: 64, fault: 1 },
  { name: '通风设备', icon: '🌀', ok: 23, total: 24, fault: 1 },
  { name: '排涝设备', icon: '⚙️', ok: 18, total: 18, fault: 0 },
  { name: '照明系统', icon: '💡', ok: 94, total: 96, fault: 2 },
  { name: '诱导屏', icon: '🚹', ok: 44, total: 48, fault: 4 }
]

const camImgs = pickRandomCctvImages(4)

const cams = [
  { name: '北口 K2+100', alarm: false, event: '', stake: 'K2+100', src: camImgs[0] },
  { name: 'K3+050 事件', alarm: true, event: '违停', stake: 'K3+050', src: camImgs[1] },
  { name: '泵房 K3+000', alarm: false, event: '', stake: 'K3+000', src: camImgs[2] },
  { name: '南口 K4+300', alarm: false, event: '', stake: 'K4+300', src: camImgs[3] }
]

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

function locateAlarm(row: any) {
  console.log('locate', row.desc)
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

.alarm-stats { display: flex; gap: 6px; margin-bottom: 8px; }
.as-item {
  flex: 1; text-align: center; border-radius: 4px; padding: 5px 0; font-size: 11px;
  &.red { background: rgba(245, 63, 63, 0.18); color: #ff5f6b; }
  &.orange { background: rgba(255, 125, 0, 0.18); color: #ffb03a; }
  &.blue { background: rgba(22, 93, 255, 0.2); color: #4ea6ff; }
  &.gray { background: rgba(30, 50, 80, 0.5); color: #7188a8; }
  .as-num { font-size: 18px; font-weight: 800; }
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
.cam-cell { .cam-view {
    position: relative; height: 78px; border-radius: 5px; overflow: hidden;
    background-color: #0b1220;
    border: 1px solid rgba(100, 160, 220, 0.35);
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
