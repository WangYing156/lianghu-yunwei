<template>
  <div class="page-bg">
    <div class="data-source" :class="source">
      <span class="dot"></span>{{ sourceLabel(source) }} · 病害、工单、健康评估来自运维库
    </div>

    <!-- 病害点位三维场景 -->
    <div class="panel scene-panel">
      <TunnelScene ref="sceneRef" map-mode resizable :points="diseasePoints" height="320px" />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 病害维修闭环 -->
      <div class="panel">
        <div class="panel-title">
          病害维修闭环
          <span class="panel-extra">病害 {{ diseasesRaw.length }} 条 · 工单 {{ stats?.funnel?.reduce((sum, s) => sum + s.count, 0) ?? 0 }} 单</span>
        </div>
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
          <span v-for="item in sourceTags" :key="item.key" class="src-tag" :class="item.key">
            {{ item.label }} {{ item.count }}
          </span>
        </div>
        <el-table :data="tickets" size="small" height="190" empty-text="暂无病害工单">
          <el-table-column prop="code" label="工单号" width="120" />
          <el-table-column label="来源" width="86">
            <template #default="{ row }">
              <el-tag :type="row.srcType" size="small">{{ row.src }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="病害类型" width="76" />
          <el-table-column prop="stake" label="位置" width="82" />
          <el-table-column label="严重度" width="70">
            <template #default="{ row }">
              <span :class="{ 'num-red': row.severity === 'severe', 'num-orange': row.severity === 'medium' }" style="font-size:12px">
                {{ row.sev }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.stType" effect="plain">{{ row.statusLabel }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="处置时效" width="86">
            <template #default="{ row }">{{ row.elapsed }}</template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 结构健康评估 -->
      <div class="panel">
        <div class="panel-title">
          结构健康评估
          <span class="panel-extra">全线指数 {{ healthIndex }}</span>
        </div>
        <div class="health-segs">
          <div v-for="h in health" :key="h.name" class="hs-item" @click="locateSection(h.name)">
            <div class="hs-score" :style="{ color: h.color }">{{ h.score }}</div>
            <div class="hs-name">{{ h.name }}</div>
            <div class="hs-bar"><div class="hs-fill" :style="{ width: h.score + '%', background: h.color }"></div></div>
          </div>
        </div>
        <VChart :option="healthOption" height="170px" />
        <el-alert v-if="watchAlert" type="warning" :closable="false" style="margin-top: 6px" :title="watchAlert" />
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
          <span>
            今日巡检：<b class="num-green">{{ inspectionDone }}/{{ inspections.length }} 项完成</b>
            · 平均覆盖率 <b class="num-blue">{{ inspectionCoverage }}%</b>
          </span>
          <el-button size="small" type="primary" plain :loading="creatingInspection" @click="createInspection">
            新建巡检任务
          </el-button>
        </div>
        <el-table :data="cycles" size="small" height="180" empty-text="暂无周期维护计划">
          <el-table-column prop="name" label="周期维护计划" />
          <el-table-column label="周期" width="72">
            <template #default="{ row }">{{ CYCLE_LABEL[row.cycle] ?? row.cycle }}</template>
          </el-table-column>
          <el-table-column prop="nextDate" label="下次执行" width="100" />
          <el-table-column label="状态" width="86">
            <template #default="{ row }">
              <el-tag :type="row.status === 'due' || row.daysToDue < 0 ? 'danger' : row.daysToDue <= 7 ? 'warning' : 'info'" size="small">
                {{ row.daysToDue < 0 ? `逾期 ${-row.daysToDue} 天` : row.daysToDue === 0 ? '今日到期' : `${row.daysToDue} 天后` }}
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
import { ElMessage } from 'element-plus'
import VChart from '../components/VChart.vue'
import TunnelScene from '../components/TunnelScene.vue'
import type { ScenePoint } from '../types/scene'
import {
  api,
  ApiError,
  type Disease,
  type DiseaseStats,
  type InspectionTask,
  type MaintenancePlan,
} from '../api/client'
import {
  DEMO_DISEASES,
  DEMO_WORK_ORDERS,
  DISEASE_STATUS_LABEL,
  DISEASE_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TYPE,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  formatDateTime,
  sourceLabel,
  stakeToLeft,
  type DataSource,
} from '../api/usePageData'

const source = ref<DataSource>('loading')
const diseasesRaw = ref<Disease[]>([])
const stats = ref<DiseaseStats | null>(null)
const inspections = ref<InspectionTask[]>([])
const cycles = ref<MaintenancePlan[]>([])
const orders = ref<typeof DEMO_WORK_ORDERS>([])
const creatingInspection = ref(false)

const CYCLE_LABEL: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '月度',
  quarterly: '季度',
  halfYear: '半年',
  yearly: '年度',
}

async function loadAll() {
  source.value = 'loading'
  const [diseaseResult, statsResult, inspectionResult, planResult, orderResult] = await Promise.allSettled([
    api.get<{ items: Disease[] }>('/diseases', { pageSize: 20 }),
    api.get<DiseaseStats>('/diseases/stats'),
    api.get<{ items: InspectionTask[] }>('/monitoring/inspection-tasks', { pageSize: 10 }),
    api.get<MaintenancePlan[]>('/monitoring/maintenance-plans'),
    api.get<{ items: typeof DEMO_WORK_ORDERS }>('/work-orders', { pageSize: 8, source: 'disease' }),
  ])

  diseasesRaw.value = diseaseResult.status === 'fulfilled' ? diseaseResult.value.items : DEMO_DISEASES
  stats.value = statsResult.status === 'fulfilled' ? statsResult.value : null
  inspections.value = inspectionResult.status === 'fulfilled' ? inspectionResult.value.items : []
  cycles.value = planResult.status === 'fulfilled' ? planResult.value : []
  orders.value = orderResult.status === 'fulfilled' ? orderResult.value.items : DEMO_WORK_ORDERS

  source.value = diseaseResult.status === 'fulfilled' && statsResult.status === 'fulfilled' ? 'api' : 'demo'
}

onMounted(loadAll)

/* ------------------------------ 三维病害点位 ------------------------------ */

const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const STATUS_OF_SEVERITY: Record<string, ScenePoint['status']> = { severe: 'alarm', medium: 'warn', slight: 'ok' }

const diseasePoints = computed<ScenePoint[]>(() => {
  const list = diseasesRaw.value.filter((d) => d.id > 0)
  const source = list.length ? list : DEMO_DISEASES
  return source.map((disease, index) => {
    const leftNum = stakeToLeft(disease.stake, 12 + index * 13)
    return {
      id: disease.pointId ?? `disease:${disease.id}`,
      name: `${DISEASE_TYPE_LABEL[disease.type] ?? disease.type} ${disease.stake ?? ''}`.trim(),
      kind: 'disease' as const,
      group: 'monitor' as const,
      status: disease.status === 'completed' ? 'ok' : STATUS_OF_SEVERITY[disease.severity] ?? 'warn',
      left: `${leftNum}%`,
      top: `${40 + (index % 3) * 7}%`,
      leftNum,
      scale: disease.severity === 'severe' ? 1.05 : 0.9,
      stake: disease.stake ?? '—',
      value: SEVERITY_LABEL[disease.severity] ?? disease.severity,
      alarm: disease.status === 'completed' ? undefined : disease.description ?? undefined,
      inspect: disease.foundAt?.slice(0, 10),
    }
  })
})

function locateSection(name: string) {
  const point = diseasePoints.value.find((item) => item.stake.includes(name.slice(0, 5)))
  if (point) sceneRef.value?.locatePoint(point.id)
}

/* ------------------------------ 闭环与统计 ------------------------------ */

const loopSteps = computed(() => {
  const funnel = stats.value?.funnel ?? []
  const pick = (status: string) => funnel.find((f) => f.status === status)?.count ?? 0
  const clsOf = (status: string) => (status === 'completed' ? 'green' : status === 'repairing' ? 'blue' : 'orange')
  return ['found', 'dispatched', 'repairing', 'reviewing', 'completed'].map((status) => ({
    name: DISEASE_STATUS_LABEL[status] ?? status,
    count: pick(status),
    cls: clsOf(status),
  }))
})

const sourceTags = computed(() => {
  const list = stats.value?.bySource ?? []
  return list.slice(0, 3).map((item) => ({
    key: item.source,
    label: item.label,
    count: item.count,
  }))
})

const tickets = computed(() =>
  orders.value.slice(0, 6).map((order) => ({
    code: order.code,
    src: SOURCE_LABEL[order.source] ?? order.source,
    srcType: order.source === 'ai' ? 'primary' : order.source === 'public' ? 'success' : 'info',
    type: DISEASE_TYPE_LABEL[order.type] ?? order.type,
    stake: order.stake ?? '—',
    severity: order.priority === 'urgent' ? 'severe' : order.priority === 'high' ? 'medium' : 'slight',
    sev: order.priority === 'urgent' ? '严重' : order.priority === 'high' ? '中等' : '轻微',
    statusLabel: ORDER_STATUS_LABEL[order.status] ?? order.status,
    stType: ORDER_STATUS_TYPE[order.status] ?? 'info',
    elapsed: order.completedAt
      ? `${Math.max(1, Math.round((new Date(order.completedAt).getTime() - new Date(order.createdAt).getTime()) / 3600000))}h`
      : order.overdue
        ? '超时'
        : '—',
  })),
)

const health = computed(() => {
  const sections = stats.value?.health ?? []
  const fallback = [
    { sectionCode: 'SEC-01', sectionName: 'K2+100~K2+800', score: 88, level: 'good' },
    { sectionCode: 'SEC-02', sectionName: 'K2+800~K3+100', score: 76, level: 'watch' },
    { sectionCode: 'SEC-03', sectionName: 'K3+100~K3+600', score: 58, level: 'warning' },
    { sectionCode: 'SEC-04', sectionName: 'K3+600~K4+300', score: 82, level: 'good' },
  ]
  return (sections.length ? sections : fallback).map((section) => ({
    name: section.sectionName,
    score: section.score,
    color: section.score >= 75 ? '#00b42a' : section.score >= 65 ? '#ff7d00' : '#f53f3f',
  }))
})

const healthIndex = computed(() => {
  const list = health.value
  if (!list.length) return '—'
  return Math.round(list.reduce((sum, item) => sum + item.score, 0) / list.length)
})

const watchAlert = computed(() => {
  const worst = [...health.value].sort((a, b) => a.score - b.score)[0]
  if (!worst || worst.score >= 75) return ''
  return `${worst.name} 健康指数 ${worst.score}（重点关注），建议安排结构复测与渗漏水专项维修。`
})

const healthOption = computed(() => {
  const months = stats.value?.trend?.map((t) => t.month.slice(5).concat('月')) ?? ['6月', '7月', '8月', '9月', '10月', '11月']
  const created = stats.value?.trend?.map((t) => t.created) ?? []
  const closed = stats.value?.trend?.map((t) => t.closed) ?? []
  return {
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [
      { name: '全线健康指数', type: 'line', smooth: true, data: health.value.map((h) => h.score), lineStyle: { color: '#165dff' }, itemStyle: { color: '#165dff' }, areaStyle: { color: 'rgba(22,93,255,0.1)' } },
      { name: '新增病害', type: 'bar', data: created, itemStyle: { color: 'rgba(255,125,0,0.55)' }, barWidth: 8 },
      { name: '闭环病害', type: 'bar', data: closed, itemStyle: { color: 'rgba(0,180,42,0.55)' }, barWidth: 8 },
    ],
  }
})

const diseaseTypeOption = computed(() => {
  const palette = ['#165dff', '#ff7d00', '#00b42a', '#f53f3f', '#86909c']
  const list = stats.value?.byType ?? []
  return {
    title: { text: '病害类型分布', left: 'center', textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['38%', '62%'],
        center: ['50%', '55%'],
        label: { fontSize: 10 },
        data: list.map((item, index) => ({
          value: item.count,
          name: item.label,
          itemStyle: { color: palette[index % palette.length] },
        })),
      },
    ],
  }
})

const diseaseTrendOption = computed(() => {
  const trend = stats.value?.trend ?? []
  return {
    title: { text: '近 6 月新增 / 闭环趋势', left: 'center', textStyle: { fontSize: 12 } },
    grid: { left: 32, right: 10, top: 32, bottom: 22 },
    xAxis: { type: 'category', data: trend.map((t) => t.month.slice(5) + '月'), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [
      { name: '新增', type: 'bar', data: trend.map((t) => t.created), itemStyle: { color: '#ff7d00' }, barWidth: 10 },
      { name: '闭环', type: 'bar', data: trend.map((t) => t.closed), itemStyle: { color: '#00b42a' }, barWidth: 10 },
    ],
  }
})

/* ------------------------------ 巡检 ------------------------------ */

const inspectionDone = computed(() => inspections.value.filter((task) => task.status === 'done').length)
const inspectionCoverage = computed(() => {
  const list = inspections.value
  if (!list.length) return 0
  return Math.round(list.reduce((sum, task) => sum + (task.coverage ?? 0), 0) / list.length)
})

async function createInspection() {
  creatingInspection.value = true
  try {
    await api.post('/monitoring/inspection-tasks', {
      name: `临时巡检 ${formatDateTime(new Date().toISOString())}`,
      cycle: 'daily',
      planDate: new Date().toISOString().slice(0, 10),
    })
    ElMessage.success('巡检任务已创建')
    const result = await api.get<{ items: InspectionTask[] }>('/monitoring/inspection-tasks', { pageSize: 10 })
    inspections.value = result.items
  } catch (error) {
    ElMessage.error(
      error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? `${error.message}（请先用运维工程师及以上账号登录）`
        : error instanceof ApiError ? error.message : '创建失败',
    )
  } finally {
    creatingInspection.value = false
  }
}
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
  background: rgba(26, 56, 108, 0.6); color: #aebcd8;
  &.ai { background: rgba(22, 93, 255, 0.2); color: #6b9cff; }
  &.public { background: rgba(0, 180, 42, 0.16); color: #2ee6a0; }
}

.health-segs { display: flex; gap: 12px; margin-bottom: 8px; }
.hs-item { flex: 1; text-align: center; cursor: pointer; }
.hs-score { font-size: 22px; font-weight: 800; }
.hs-name { font-size: 10px; color: #7188a8; margin: 2px 0 4px; }
.hs-bar { height: 6px; background: rgba(26, 56, 108, 0.6); border-radius: 3px; overflow: hidden; }
.hs-fill { height: 100%; border-radius: 3px; }

.patrol-now {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; margin-bottom: 10px;
}
</style>
