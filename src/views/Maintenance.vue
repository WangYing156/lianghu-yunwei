<template>
  <div class="page-bg">
    <!-- 病害点位三维场景 -->
    <div class="panel scene-panel">
      <TunnelScene map-mode resizable :points="diseasePoints" height="320px" />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 病害维修闭环 -->
      <div class="panel">
        <div class="panel-title">病害维修闭环</div>
        <!-- 闭环流程 -->
        <div class="loop-flow">
          <div v-for="(s, i) in loopSteps" :key="s.name" class="lf-step">
            <div class="lf-dot" :class="s.cls">{{ i + 1 }}</div>
            <div class="lf-name">{{ s.name }}</div>
            <div class="lf-count">{{ s.count }} 单</div>
            <div v-if="i < loopSteps.length - 1" class="lf-arrow">→</div>
          </div>
        </div>
        <div class="src-row">
          <span class="src-tag manual">人工巡检 18</span>
          <span class="src-tag ai">AI 识别 9</span>
          <span class="src-tag public">公众反馈 6</span>
        </div>
        <el-table :data="tickets" size="small" height="190">
          <el-table-column prop="id" label="工单号" width="92" />
          <el-table-column prop="src" label="来源" width="80">
            <template #default="{ row }">
              <el-tag :type="row.srcType" size="small">{{ row.src }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="病害类型" width="76" />
          <el-table-column prop="stake" label="位置" width="78" />
          <el-table-column prop="sev" label="严重度" width="70">
            <template #default="{ row }">
              <span :class="{ 'num-red': row.sev === '严重', 'num-orange': row.sev === '中等' }" style="font-size:12px">{{ row.sev }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="76">
            <template #default="{ row }"><el-tag size="small" :type="row.stType" effect="plain">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="age" label="处置时效" />
        </el-table>
      </div>

      <!-- 结构健康评估 -->
      <div class="panel">
        <div class="panel-title">结构健康评估</div>
        <div class="health-segs">
          <div v-for="h in health" :key="h.name" class="hs-item">
            <div class="hs-score" :style="{ color: h.color }">{{ h.score }}</div>
            <div class="hs-name">{{ h.name }}</div>
            <div class="hs-bar"><div class="hs-fill" :style="{ width: h.score + '%', background: h.color }"></div></div>
          </div>
        </div>
        <VChart :option="healthOption" height="170px" />
        <el-alert type="warning" :closable="false" style="margin-top: 6px"
          title="K3+100~K3+600 区段健康指数 58（重点观察），建议安排结构复测与渗漏水专项维修。" />
      </div>
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 病害统计 -->
      <div class="panel">
        <div class="panel-title">病害统计</div>
        <div class="grid-2" style="gap: 12px">
          <VChart :option="diseaseTypeOption" height="200px" />
          <VChart :option="diseaseTrendOption" height="200px" />
        </div>
      </div>

      <!-- 巡检任务 + 周期维护 -->
      <div class="panel">
        <div class="panel-title">巡检任务与周期维护</div>
        <div class="patrol-now">
          <span>今日巡检：<b class="num-green">2/2 班次完成</b> · 覆盖率 <b class="num-blue">100%</b></span>
          <el-button size="small" type="primary" plain>新建巡检任务</el-button>
        </div>
        <el-table :data="cycles" size="small" height="180">
          <el-table-column prop="name" label="周期维护计划" />
          <el-table-column prop="cycle" label="周期" width="72" />
          <el-table-column prop="next" label="下次执行" width="96" />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.soon ? 'warning' : 'info'" size="small">{{ row.soon ? '即将到期' : '已排程' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import VChart from '../components/VChart.vue'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'

/* 病害点位三维场景 */
const diseasePoints: ScenePoint[] = [
  { id: 'd1', name: '裂缝 K3+200', kind: 'disease', group: 'monitor', status: 'alarm', left: '30%', top: '42%', leftNum: 30, scale: 1.1, stake: 'K3+200', value: '严重', alarm: '贯穿裂缝，待派发', inspect: '2026-10-16' },
  { id: 'd2', name: '渗漏水 K3+350', kind: 'disease', group: 'monitor', status: 'alarm', left: '48%', top: '38%', leftNum: 48, scale: 1.05, stake: 'K3+350', value: '严重', alarm: '顶板渗漏，处理中', inspect: '2026-10-16' },
  { id: 'd3', name: '剥落 K2+700', kind: 'disease', group: 'monitor', status: 'warn', left: '22%', top: '56%', leftNum: 22, scale: 0.95, stake: 'K2+700', value: '轻微', inspect: '2026-10-15' },
  { id: 'd4', name: '裂缝 K3+500', kind: 'disease', group: 'monitor', status: 'ok', left: '64%', top: '44%', leftNum: 64, scale: 0.9, stake: 'K3+500', value: '已修复', inspect: '2026-10-15' },
  { id: 'd5', name: '渗漏水 K2+450', kind: 'disease', group: 'monitor', status: 'ok', left: '14%', top: '48%', leftNum: 14, scale: 0.85, stake: 'K2+450', value: '已修复', inspect: '2026-10-14' },
  { id: 'd6', name: '变形缝 K3+800', kind: 'disease', group: 'monitor', status: 'warn', left: '78%', top: '50%', leftNum: 78, scale: 0.85, stake: 'K3+800', value: '中等', inspect: '2026-10-14' }
]

const loopSteps = [
  { name: '病害发现', count: 33, cls: 'blue' },
  { name: '审核派发', count: 6, cls: 'orange' },
  { name: '维修处置', count: 14, cls: 'blue' },
  { name: '现场验收', count: 3, cls: 'orange' },
  { name: '闭环归档', count: 128, cls: 'green' }
]

const tickets = [
  { id: 'YH-20261016-01', src: 'AI 识别', srcType: 'primary', type: '裂缝', stake: 'K3+200', sev: '中等', status: '待派发', stType: 'warning', age: '—' },
  { id: 'YH-20261016-02', src: '公众反馈', srcType: 'success', type: '渗漏水', stake: 'K3+350', sev: '严重', status: '处理中', stType: 'primary', age: '4h' },
  { id: 'YH-20261015-07', src: '人工巡检', srcType: 'info', type: '剥落', stake: 'K2+700', sev: '轻微', status: '待验收', stType: 'warning', age: '18h' },
  { id: 'YH-20261015-05', src: 'AI 识别', srcType: 'primary', type: '裂缝', stake: 'K3+500', sev: '轻微', status: '已完成', stType: 'success', age: '22h' },
  { id: 'YH-20261014-09', src: '人工巡检', srcType: 'info', type: '渗漏水', stake: 'K2+450', sev: '中等', status: '已完成', stType: 'success', age: '30h' }
]

const health = [
  { name: 'K2+100~K2+800', score: 88, color: '#00b42a' },
  { name: 'K2+800~K3+100', score: 76, color: '#00b42a' },
  { name: 'K3+100~K3+600', score: 58, color: '#f53f3f' },
  { name: 'K3+600~K4+300', score: 82, color: '#00b42a' }
]

const cycles = [
  { name: '照明灯具批量更换（北段）', cycle: '季度', next: '2026-10-22', soon: true },
  { name: '射流风机保养（1#~4#）', cycle: '半年', next: '2026-11-05', soon: false },
  { name: '排水沟清淤（全线）', cycle: '月度', next: '2026-10-18', soon: true },
  { name: '诱导屏巡检校准', cycle: '季度', next: '2026-11-20', soon: false },
  { name: '消防设施月检', cycle: '月度', next: '2026-10-25', soon: false }
]

const healthOption = {
  grid: { left: 36, right: 12, top: 24, bottom: 22 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['1月', '3月', '5月', '7月', '9月', '10月'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', min: 40, max: 100, axisLabel: { fontSize: 10 } },
  series: [
    { name: '全线健康指数', type: 'line', smooth: true, data: [86, 84, 82, 80, 79, 78], lineStyle: { color: '#165dff' }, itemStyle: { color: '#165dff' }, areaStyle: { color: 'rgba(22,93,255,0.1)' } },
    { name: '重点关注区段', type: 'line', smooth: true, data: [72, 70, 67, 64, 60, 58], lineStyle: { color: '#f53f3f', type: 'dashed' }, itemStyle: { color: '#f53f3f' } }
  ]
}

const diseaseTypeOption = {
  title: { text: '病害类型分布', left: 'center', textStyle: { fontSize: 12 } },
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie', radius: ['38%', '62%'], center: ['50%', '55%'],
    label: { fontSize: 10 },
    data: [
      { value: 42, name: '裂缝', itemStyle: { color: '#165dff' } },
      { value: 28, name: '渗漏水', itemStyle: { color: '#ff7d00' } },
      { value: 12, name: '剥落', itemStyle: { color: '#00b42a' } },
      { value: 8, name: '变形缝', itemStyle: { color: '#f53f3f' } }
    ]
  }]
}

const diseaseTrendOption = {
  title: { text: '近 6 月新增 / 闭环趋势', left: 'center', textStyle: { fontSize: 12 } },
  grid: { left: 32, right: 10, top: 32, bottom: 22 },
  xAxis: { type: 'category', data: ['5月', '6月', '7月', '8月', '9月', '10月'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
  series: [
    { name: '新增', type: 'bar', data: [26, 31, 38, 29, 22, 15], itemStyle: { color: '#ff7d00' }, barWidth: 10 },
    { name: '闭环', type: 'bar', data: [22, 28, 34, 31, 25, 12], itemStyle: { color: '#00b42a' }, barWidth: 10 }
  ]
}
</script>

<style scoped lang="scss">
.scene-panel { padding: 0; overflow: hidden; }

.loop-flow { display: flex; align-items: flex-start; margin-bottom: 10px; }
.lf-step { position: relative; flex: 1; text-align: center; }
.lf-dot {
  width: 26px; height: 26px; border-radius: 50%; margin: 0 auto 4px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 12px; font-weight: 700;
  &.blue { background: #165dff; } &.orange { background: #ff7d00; } &.green { background: #00b42a; }
}
.lf-name { font-size: 12px; color: #e8f0fc; }
.lf-count { font-size: 11px; color: #7188a8; }
.lf-arrow { position: absolute; right: -8px; top: 6px; color: #c9cdd4; font-size: 14px; }

.src-row { display: flex; gap: 8px; margin-bottom: 10px; }
.src-tag { font-size: 12px; border-radius: 12px; padding: 2px 12px;
  &.manual { background: rgba(26, 56, 108, 0.6); color: #aebcd8; }
  &.ai { background: rgba(22, 93, 255, 0.2); color: #165dff; }
  &.public { background: rgba(0, 180, 42, 0.16); color: #00b42a; }
}

.health-segs { display: flex; gap: 12px; margin-bottom: 8px; }
.hs-item { flex: 1; text-align: center; }
.hs-score { font-size: 22px; font-weight: 800; }
.hs-name { font-size: 10px; color: #7188a8; margin: 2px 0 4px; }
.hs-bar { height: 6px; background: rgba(26, 56, 108, 0.6); border-radius: 3px; overflow: hidden; }
.hs-fill { height: 100%; border-radius: 3px; }

.patrol-now {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; margin-bottom: 10px;
}
</style>
