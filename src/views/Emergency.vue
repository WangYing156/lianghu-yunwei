<template>
  <div class="page-bg">
    <!-- 应急处置三维场景（可拖拽调高；孪生仿真时升高并叠加 HUD） -->
    <div ref="scenePanelRef" class="panel scene-panel" :class="{ tall: simActive }">
      <TunnelScene
        ref="sceneRef"
        map-mode
        resizable
        :points="emergencyPoints"
        :height="simActive ? '560px' : '320px'"
        @simulation-exit="onSimulationExit"
      >
        <template #overlay>
          <div v-show="!simActive" class="sim-dock" @pointerdown.stop @click.stop>
            <strong>孪生VR仿真</strong>
            <button
              v-for="s in TWIN_SCENARIO_LIST"
              :key="s.id"
              type="button"
              class="sim-dock__btn"
              :class="`is-${s.id}`"
              @click="launchScenario(s.id)"
            >
              {{ s.short }}
            </button>
          </div>
        </template>
      </TunnelScene>
    </div>

    <!-- 孪生VR仿真：紧挨上方三维场景，进入后特效叠在场景里 -->
    <div class="panel vr-panel" style="margin-top: 16px">
      <div class="panel-title">
        孪生VR仿真
        <span class="vr-tag">就在上方三维场景里推演</span>
        <span class="vr-tag note">推演值 · 非实时测点</span>
        <span v-if="simActive" class="vr-tag live" :class="{ paused: !simPlaying }">
          {{ simPlaying ? '● 推演运行中' : 'Ⅱ 推演已暂停' }} · 步骤 {{ simStep + 1 }}/{{ scenario.steps.length }}
        </span>
        <span class="vr-tag timing">{{ timingLabel }}</span>
      </div>
      <div class="vr-body">
        <div class="vr-scenarios" role="radiogroup" aria-label="仿真工况">
          <button
            v-for="s in TWIN_SCENARIO_LIST"
            :key="s.id"
            type="button"
            role="radio"
            class="vr-card"
            :class="[`is-${s.id}`, { active: s.id === scenarioId }]"
            :aria-checked="s.id === scenarioId"
            @click="selectScenario(s.id)"
          >
            <span class="vr-card__icon">{{ s.short }}</span>
            <strong>{{ s.label }}</strong>
            <small>{{ s.deck === 'lower' ? '下层车道' : '上层车道' }} · {{ s.steps.length }} 步 · {{ scenarioTiming(s) }}</small>
          </button>
        </div>

        <div class="vr-main">
          <div class="vr-side">
            <div class="vs-label">推演步骤 <small>点击跳转，三维特效同步切换</small></div>
            <ol class="vr-steps">
              <li
                v-for="(s, i) in scenario.steps"
                :key="s.title"
                :class="{ active: i === simStep, done: i < simStep }"
                @click="goStep(i)"
              >
                <i>{{ i < simStep ? '✓' : i + 1 }}</i>
                <div>
                  <span>{{ s.title }}</span>
                  <small>{{ s.duration ? `${s.duration}s` : '行进驱动' }}</small>
                  <p v-if="i === simStep">{{ s.detail }}</p>
                </div>
              </li>
            </ol>
          </div>
          <div class="vr-side">
            <div class="vs-label">工况推演值 <small>{{ simActive ? (simPlaying ? '随推演时钟刷新' : '已暂停') : '工况预览（模拟）' }}</small></div>
            <div class="vr-telemetry">
              <div v-for="t in telemetry" :key="t.key" :class="t.level">
                <em>{{ t.label }}</em><b>{{ t.value }}</b>
              </div>
            </div>
            <div class="vs-label" style="margin-top: 12px">联动设备</div>
            <div class="vr-devices">
              <div v-for="d in devices" :key="d.name" class="vd-item" :class="d.level">
                <span>{{ d.name }}</span>
                <b>{{ d.value }}</b>
              </div>
            </div>
          </div>
        </div>

        <div class="vr-controls">
          <div class="vr-btns">
            <el-button
              size="small"
              type="primary"
              :loading="simStarting && !simImmersive"
              @click="enterSimulation(false, simActive)"
            >
              <el-icon><VideoPlay /></el-icon>{{ simActive ? '从头推演当前工况' : '进入孪生仿真' }}
            </el-button>
            <el-button
              size="small"
              type="success"
              :loading="simStarting && simImmersive"
              @click="enterSimulation(true, false)"
            >
              <el-icon><FullScreen /></el-icon>全屏沉浸
            </el-button>
            <el-button size="small" :disabled="!simActive" :type="simPlaying ? 'warning' : 'default'" @click="togglePlay">
              <el-icon><VideoPause v-if="simPlaying" /><VideoPlay v-else /></el-icon>{{ simPlaying ? '暂停推演' : '继续推演' }}
            </el-button>
            <el-button size="small" :disabled="!simActive" @click="exitSimulation">
              <el-icon><RefreshRight /></el-icon>退出仿真
            </el-button>
            <el-button size="small" :disabled="simActive" @click="focusHotspot">定位关键点</el-button>
          </div>
          <span v-if="simError" class="vr-error" role="alert">{{ simError }}</span>
          <span v-else class="vr-hint">
            在上方三维场景内推演；点击步骤或拖拽画面会暂停接管，HUD 可切全景 / 近景 / 第一人称 / VR 分屏。空格播放，← → 切步，Esc 退出（VR 分屏下先退出分屏）。
          </span>
        </div>
        <div class="vr-desc">{{ scenario.desc }}</div>
        <div class="vr-source">{{ TWIN_DATA_NOTE }}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 火灾排烟控制 -->
      <div class="panel">
        <div class="panel-title">火灾排烟控制</div>
        <div class="fire-row">
          <div class="fire-item ok"><b>482</b><span>烟感/温感 · 正常</span></div>
          <div class="fire-item ok"><b>96</b><span>消火栓 · 完好</span></div>
          <div class="fire-item warn"><b>2</b><span>灭火器 · 临期</span></div>
          <div class="fire-item ok"><b>0</b><span>火警事件</span></div>
        </div>
        <div class="mini-title">排烟风机运行状态</div>
        <el-table :data="smokeFans" size="small" height="130">
          <el-table-column prop="name" label="设备" />
          <el-table-column prop="stake" label="位置" width="88" />
          <el-table-column prop="status" label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.run ? 'success' : 'info'" size="small">{{ row.run ? '运行' : '待机' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="val" label="参数" width="90" />
        </el-table>
        <div class="fire-link">
          <span class="fl-title">火警联动策略：</span>
          <el-tag size="small" type="info">风机 → 排烟模式</el-tag>
          <el-tag size="small" type="info">诱导屏 → 疏散指引</el-tag>
          <el-tag size="small" type="info">广播 → 疏散语音</el-tag>
          <el-tag size="small" type="info">卷帘门 → 降落</el-tag>
        </div>
      </div>

      <!-- 防洪排涝控制 -->
      <div class="panel">
        <div class="panel-title">防洪排涝控制</div>
        <el-alert type="error" :closable="false" style="margin-bottom: 10px"
          title="【红色预警】K3+050 积水液位 26.8cm，已联动排涝泵 P1/P2 启动，请关注处置进展。" />
        <div class="mini-title">积水液位实时曲线（K3+050）</div>
        <VChart :option="levelOption" height="150px" />
        <el-table :data="pumps" size="small" height="120" style="margin-top: 8px">
          <el-table-column prop="name" label="设备" />
          <el-table-column prop="stake" label="位置" width="88" />
          <el-table-column prop="status" label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.run ? 'success' : 'info'" size="small">{{ row.run ? '运行' : '待机' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="val" label="参数" width="110" />
        </el-table>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 交通事故控制 -->
      <div class="panel acc-panel">
        <div class="panel-title">交通事故控制</div>
        <div class="acc-stats">
          <div class="acc-item"><b class="num-blue">0</b><span>当前事故</span></div>
          <div class="acc-item"><b class="num-orange">3</b><span>今日处置</span></div>
          <div class="acc-item"><b class="num-green">12</b><span>本月处置</span></div>
          <div class="acc-item"><b class="num-green">4.2</b><span>平均响应(min)</span></div>
        </div>
        <div class="mini-title">事故处置流程</div>
        <el-timeline class="acc-timeline" style="padding-left: 4px">
          <el-timeline-item timestamp="接警" type="primary" size="small">视频监控/紧急电话自动识别事故</el-timeline-item>
          <el-timeline-item timestamp="响应" size="small">联动车道指示器、情报板发布管制信息</el-timeline-item>
          <el-timeline-item timestamp="处置" size="small">应急队伍到场，广播疏导，现场处置</el-timeline-item>
          <el-timeline-item timestamp="恢复" size="small">事故清除，解除管制，恢复通行</el-timeline-item>
        </el-timeline>
      </div>

      <!-- 应急物资 -->
      <div class="panel">
        <div class="panel-title">应急物资</div>
        <div class="mat-grid">
          <div class="mat-item"><div class="mt-num num-blue">120</div>沙袋（只）</div>
          <div class="mat-item"><div class="mt-num num-green">8</div>移动泵车（台）</div>
          <div class="mat-item"><div class="mt-num num-orange">36</div>警示锥（个）</div>
          <div class="mat-item"><div class="mt-num num-blue">15</div>救生衣（件）</div>
          <div class="mat-item"><div class="mt-num num-green">24</div>灭火器（具）</div>
          <div class="mat-item"><div class="mt-num num-blue">10</div>反光服（套）</div>
          <div class="mat-item"><div class="mt-num num-orange">6</div>应急灯（盏）</div>
          <div class="mat-item"><div class="mt-num num-green">4</div>破拆工具（套）</div>
        </div>
        <div class="mini-title">应急物资点分布</div>
        <el-table :data="materialSites" size="small" height="120">
          <el-table-column prop="site" label="物资点" />
          <el-table-column prop="stake" label="位置" width="110" />
          <el-table-column prop="stock" label="库存状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enough ? 'success' : 'warning'" size="small">{{ row.enough ? '充足' : '需补充' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { VideoPlay, VideoPause, RefreshRight, FullScreen } from '@element-plus/icons-vue'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'
import VChart from '../components/VChart.vue'
import {
  TWIN_DATA_NOTE,
  TWIN_SCENARIOS,
  TWIN_SCENARIO_LIST,
  type TwinScenario,
  type TwinScenarioId,
} from '../config/twinScenarios'
import { scenarioDuration } from '../utils/simulationPhysics'
import type { TwinSimState } from '../composables/useTwinSimulation'

type SceneApi = {
  locatePoint: (id: string) => void | Promise<void>
  startSimulation: (
    id: TwinScenarioId,
    step?: number,
    immersive?: boolean,
    restart?: boolean,
  ) => Promise<boolean>
  stopSimulation: () => void
  setSimulationStep: (step: number) => void
  toggleSimulationPlay: () => void
  simulation: TwinSimState
}

const sceneRef = ref<SceneApi | null>(null)
const scenePanelRef = ref<HTMLDivElement | null>(null)

const emergencyPoints: ScenePoint[] = [
  { id: 'w1', name: '积水点 W1', kind: 'waterLevel', group: 'env', status: 'ok', left: '16%', top: '70%', leftNum: 16, scale: 1.05, stake: 'K2+250', value: '1.8cm', unit: 'cm', history: [
    { time: '08:00', value: 1.2 }, { time: '10:00', value: 1.4 }, { time: '12:00', value: 1.5 }, { time: '14:00', value: 1.6 }, { time: '16:00', value: 1.8 }, { time: '18:00', value: 1.8 }
  ] },
  { id: 'w2', name: '积水点 W2', kind: 'waterLevel', group: 'env', status: 'alarm', left: '46%', top: '66%', leftNum: 46, scale: 1, stake: 'K3+050', value: '26.8cm', alarm: '红色积水预警', unit: 'cm', history: [
    { time: '12:00', value: 8.2 }, { time: '13:00', value: 11.5 }, { time: '14:00', value: 15.2 }, { time: '15:00', value: 19.6 }, { time: '16:00', value: 23.4 }, { time: '17:00', value: 26.8 }
  ] },
  { id: 'w3', name: '积水点 W3', kind: 'waterLevel', group: 'env', status: 'ok', left: '78%', top: '72%', leftNum: 78, scale: 0.8, stake: 'K4+000', value: '2.2cm', unit: 'cm', history: [
    { time: '08:00', value: 1.6 }, { time: '10:00', value: 1.8 }, { time: '12:00', value: 2.0 }, { time: '14:00', value: 2.1 }, { time: '16:00', value: 2.2 }, { time: '18:00', value: 2.2 }
  ] },
  { id: 'p1', name: '排涝泵 P1', kind: 'pump', group: 'mep', status: 'warn', left: '38%', top: '82%', leftNum: 38, scale: 1, stake: '泵房K3+000', value: '运行 0.6MPa', alarm: '联动运行中', unit: 'MPa', history: [
    { time: '14:00', value: 0 }, { time: '14:30', value: 0.15 }, { time: '15:00', value: 0.35 }, { time: '15:30', value: 0.52 }, { time: '16:00', value: 0.6 }, { time: '17:00', value: 0.6 }
  ] },
  { id: 'p2', name: '排涝泵 P2', kind: 'pump', group: 'mep', status: 'warn', left: '58%', top: '84%', leftNum: 58, scale: 0.9, stake: '泵房K3+000', value: '运行 0.6MPa', alarm: '联动运行中', unit: 'MPa', history: [
    { time: '14:30', value: 0 }, { time: '15:00', value: 0.2 }, { time: '15:30', value: 0.45 }, { time: '16:00', value: 0.58 }, { time: '17:00', value: 0.6 }, { time: '17:30', value: 0.6 }
  ] },
  { id: 'p3', name: '排涝泵 P3', kind: 'pump', group: 'mep', status: 'ok', left: '80%', top: '86%', leftNum: 80, scale: 0.75, stake: '泵房K4+100', value: '待机', unit: 'MPa', history: [
    { time: '08:00', value: 0 }, { time: '10:00', value: 0 }, { time: '12:00', value: 0 }, { time: '14:00', value: 0 }, { time: '16:00', value: 0 }, { time: '18:00', value: 0 }
  ] },
  { id: 'fan1', name: '排烟风机 PY-1', kind: 'fan', group: 'mep', status: 'ok', left: '30%', top: '34%', leftNum: 30, scale: 0.9, stake: 'K3+000', value: '待机' },
  { id: 'fire1', name: '消防水泵 FP-1', kind: 'firePump', group: 'mep', status: 'ok', left: '24%', top: '58%', leftNum: 24, scale: 0.85, stake: '消防泵房', value: '0.6MPa' },
  { id: 'm1', name: '应急物资点 A', kind: 'structureUp', group: 'structure', status: 'ok', left: '22%', top: '28%', leftNum: 22, scale: 0.95, stake: 'K2+400 物资间' },
  { id: 'm2', name: '应急物资点 B', kind: 'structureUp', group: 'structure', status: 'ok', left: '68%', top: '28%', leftNum: 68, scale: 0.8, stake: 'K3+800 物资间' }
]

const smokeFans = [
  { name: '排烟风机 PY-1', stake: 'K3+000', run: false, val: '待机' },
  { name: '排烟风机 PY-2', stake: 'K3+500', run: false, val: '待机' },
  { name: '轴流风机 JF-1', stake: 'K2+900', run: true, val: '35Hz' },
  { name: '轴流风机 JF-2', stake: 'K3+600', run: true, val: '30Hz' }
]

const pumps = [
  { name: '排涝泵 P1', stake: '泵房 K3+000', run: true, val: '0.6MPa / 210m³/h' },
  { name: '排涝泵 P2', stake: '泵房 K3+000', run: true, val: '0.6MPa / 210m³/h' },
  { name: '排涝泵 P3', stake: '泵房 K4+100', run: false, val: '—' },
  { name: '移动泵车 M1', stake: '北口值守点', run: false, val: '待命' }
]

const materialSites = [
  { site: '物资间 A', stake: 'K2+400', enough: true },
  { site: '物资间 B', stake: 'K3+800', enough: true },
  { site: '消防救援口', stake: 'K3+100', enough: false }
]

const levelOption = {
  grid: { left: 40, right: 10, top: 20, bottom: 22 },
  xAxis: { type: 'category', data: ['13:20', '13:35', '13:50', '14:05', '14:20'], axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', name: 'cm', axisLabel: { fontSize: 10 } },
  series: [{
    type: 'line', smooth: true, data: [12, 15.2, 19.6, 23.4, 26.8],
    lineStyle: { color: '#f53f3f' }, itemStyle: { color: '#f53f3f' },
    areaStyle: { color: 'rgba(245,63,63,0.12)' },
    markLine: { silent: true, symbol: 'none', data: [
      { yAxis: 15, lineStyle: { color: '#ffb400', type: 'dashed' }, label: { formatter: '黄色 15cm', fontSize: 9 } },
      { yAxis: 25, lineStyle: { color: '#f53f3f', type: 'dashed' }, label: { formatter: '红色 25cm', fontSize: 9 } }
    ] }
  }]
}

/* ===== 孪生VR仿真 ===== */
const scenarioId = ref<TwinScenarioId>('fire')
const scenario = computed(() => TWIN_SCENARIOS[scenarioId.value])
const previewStep = ref(0)
const simActive = ref(false)
const simStarting = ref(false)
const simImmersive = ref(false)
const simError = ref('')
const lastSimStep = ref(0)
let startToken = 0

/** 仿真运行时以三维场景内的推演时钟为准，未运行时展示预览步骤 */
const live = computed(() => (simActive.value ? sceneRef.value?.simulation ?? null : null))
const simStep = computed(() => live.value?.step ?? previewStep.value)
const simPlaying = computed(() => !!live.value?.playing)
const telemetry = computed(() =>
  live.value?.telemetry.length ? live.value.telemetry : scenario.value.telemetry(simStep.value, 0),
)
const devices = computed(() =>
  live.value?.devices.length ? live.value.devices : scenario.value.devices(simStep.value, 0),
)
function scenarioTiming(s: TwinScenario): string {
  const total = scenarioDuration(s.steps.map((step) => step.duration))
  return total > 0 ? `${Math.round(total)}s @1×` : '行进进度驱动'
}
const timingLabel = computed(() => scenarioTiming(scenario.value))

// 退出时 live 会立刻变成 null，缓存最后一步，预览面板才能停在实际检视的位置。
watch(
  () => live.value?.step,
  (step) => {
    if (typeof step === 'number') lastSimStep.value = step
  },
  { immediate: true },
)

watch(
  () => live.value?.scenario,
  (id) => {
    if (id && id !== scenarioId.value) scenarioId.value = id
  },
)

async function enterSimulation(immersive: boolean, restart = false) {
  const token = ++startToken
  simError.value = ''
  simStarting.value = true
  simImmersive.value = immersive
  if (!immersive && !simActive.value)
    scenePanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const step = restart ? 0 : simStep.value
  const ok = await sceneRef.value?.startSimulation(
    scenarioId.value,
    step,
    immersive,
    restart,
  )
  if (token !== startToken) return
  simStarting.value = false
  simActive.value = !!ok
  if (!ok)
    simError.value =
      sceneRef.value?.simulation.error || '三维场景或竣工模型尚未就绪，请稍候重试。'
}

function onSimulationExit() {
  startToken++
  previewStep.value = lastSimStep.value
  simActive.value = false
  simStarting.value = false
  simImmersive.value = false
  simError.value = ''
}

function exitSimulation() {
  sceneRef.value?.stopSimulation()
  onSimulationExit()
}

function launchScenario(id: TwinScenarioId) {
  scenarioId.value = id
  previewStep.value = 0
  lastSimStep.value = 0
  void enterSimulation(false, true)
}

function selectScenario(id: TwinScenarioId) {
  if (id === scenarioId.value) return
  scenarioId.value = id
  previewStep.value = 0
  lastSimStep.value = 0
  if (simActive.value) void enterSimulation(simImmersive.value, true)
}

function goStep(step: number) {
  const next = Math.max(0, Math.min(scenario.value.steps.length - 1, step))
  if (simActive.value) sceneRef.value?.setSimulationStep(next)
  else previewStep.value = next
}

function togglePlay() {
  sceneRef.value?.toggleSimulationPlay()
}

function focusHotspot() {
  void sceneRef.value?.locatePoint(scenario.value.hotspot)
}

onBeforeUnmount(() => {
  sceneRef.value?.stopSimulation()
})
</script>

<style scoped lang="scss">
.scene-panel {
  padding: 0;
  overflow: hidden;
  position: relative;
  transition: min-height 0.25s ease;
  &.tall { min-height: 520px; }
}

.mini-title { font-size: 12px; color: #aebcd8; margin-bottom: 4px; font-weight: 600; }

.fire-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.fire-item {
  text-align: center; border-radius: 6px; padding: 12px 0;
  b { display: block; font-size: 22px; }
  span { font-size: 11px; }
  &.ok { background: rgba(0, 180, 42, 0.16); color: #00b42a; b { color: #00b42a; } }
  &.warn { background: rgba(255, 125, 0, 0.18); color: #ff7d00; b { color: #ff7d00; } }
}
.fire-link { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.fl-title { font-size: 12px; color: #aebcd8; }

.acc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.acc-item {
  text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 6px; padding: 10px 0;
  b { display: block; font-size: 20px; }
  span { font-size: 11px; color: #9bb4d4; }
}

/* 交通事故时间线：覆盖 Element 默认深色字，融入大屏 */
.acc-panel {
  :deep(.acc-timeline) {
    --el-timeline-node-color: rgba(78, 160, 255, 0.45);
    --el-timeline-node-size: 10px;
  }
  :deep(.el-timeline-item__content) {
    color: #d5e6ff !important;
    font-size: 12px;
    line-height: 1.55;
  }
  :deep(.el-timeline-item__timestamp) {
    color: #7eb8ff !important;
    font-size: 12px !important;
    font-weight: 600;
  }
  :deep(.el-timeline-item__node) {
    background-color: #1a3f78;
    border-color: #4ea6ff;
  }
  :deep(.el-timeline-item__tail) {
    border-left-color: rgba(78, 160, 255, 0.28);
  }
}

.mat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.mat-item {
  text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 6px; padding: 10px 0;
  font-size: 12px; color: #aebcd8;
  .mt-num { font-size: 20px; font-weight: 800; }
}

/* ===== 孪生VR仿真 ===== */
.sim-dock {
  position: absolute;
  z-index: 40;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 10px;
  border-radius: 10px;
  color: #e7f6ff;
  background: rgba(6, 18, 36, 0.86);
  border: 1px solid rgba(78, 230, 255, 0.5);
  box-shadow: 0 8px 22px rgba(0, 8, 20, 0.35);
  strong { font-size: 13px; letter-spacing: 0.04em; margin-right: 2px; }
}
.sim-dock__btn {
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 12px;
  color: #d7ecff;
  background: rgba(20, 48, 98, 0.65);
  cursor: pointer;
  &.is-fire { color: #ffb089; }
  &.is-flood { color: #8fceff; }
  &.is-accident { color: #ffe08a; }
  &.is-patrol { color: #8cf0c4; }
  &:hover { border-color: rgba(78, 230, 255, 0.55); background: rgba(32, 72, 130, 0.8); }
}

.vr-panel {
  --vr-ok: #2ee6a0;
  --vr-warn: #ffb03a;
  --vr-alarm: #ff5f6b;
  border: 1px solid rgba(78, 230, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(78, 230, 255, 0.08), 0 10px 28px rgba(0, 12, 32, 0.28);
  .panel-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 16px; }
}
.vr-tag {
  font-size: 11px; font-weight: 400; color: #4ee6ff;
  background: rgba(78, 230, 255, 0.12); border: 1px solid rgba(78, 230, 255, 0.3);
  padding: 1px 8px; border-radius: 10px;
  &.live { color: var(--vr-ok); border-color: rgba(46, 230, 160, 0.4); background: rgba(46, 230, 160, 0.1); }
  &.paused { color: #ffd28a; border-color: rgba(255, 176, 58, 0.45); background: rgba(255, 176, 58, 0.1); }
  &.note { color: #ffd8a8; border-color: rgba(255, 176, 58, 0.42); background: rgba(255, 176, 58, 0.1); }
  &.timing { color: #9ed0ff; border-color: rgba(120, 190, 255, 0.34); background: rgba(78, 160, 255, 0.1); }
}
.vr-body { display: flex; flex-direction: column; gap: 10px; }
.vr-scenarios {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
}
.vr-card {
  --vc: #4ea6ff;
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto;
  column-gap: 10px; align-items: center; text-align: left;
  padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #cfe3ff;
  background: linear-gradient(135deg, rgba(20, 48, 98, 0.55), rgba(8, 24, 48, 0.55));
  border: 1px solid rgba(78, 160, 255, 0.2);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  &.is-fire { --vc: #ff7a45; }
  &.is-flood { --vc: #3ba7ff; }
  &.is-accident { --vc: #ffc53d; }
  &.is-patrol { --vc: #2ee6a0; }
  strong { font-size: 13px; }
  small { grid-column: 2; font-size: 11px; color: #7fa3c8; }
  &:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--vc) 55%, transparent); }
  &.active {
    border-color: var(--vc);
    box-shadow: 0 0 0 1px var(--vc) inset, 0 6px 18px color-mix(in srgb, var(--vc) 22%, transparent);
  }
}
.vr-card__icon {
  grid-row: span 2; display: grid; place-items: center;
  width: 36px; height: 36px; border-radius: 8px; font-size: 13px; font-weight: 700;
  color: var(--vc); background: color-mix(in srgb, var(--vc) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--vc) 45%, transparent);
}
.vr-main {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 1fr);
  gap: 12px;
}
.vr-side {
  padding: 10px 12px; background: rgba(20, 48, 98, 0.35); border-radius: 6px;
  border: 1px solid rgba(78, 160, 255, 0.18);
}
.vs-label { font-size: 11px; color: #7188a8; small { margin-left: 6px; color: #5d7696; } }
.vr-steps {
  list-style: none; display: flex; flex-direction: column; gap: 6px; margin: 6px 0 0; padding: 0;
  li {
    display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #8fa8c8;
    padding: 6px 8px; border-radius: 6px; cursor: pointer;
    i {
      width: 18px; height: 18px; flex: none; border-radius: 50%; display: grid; place-items: center;
      font-style: normal; font-size: 10px; background: rgba(78, 160, 255, 0.15); color: #9cc4ef;
    }
    div { flex: 1; min-width: 0; }
    small { float: right; margin-left: 8px; font-size: 10px; color: #6686aa; }
    p { clear: both; margin: 4px 0 0; color: #aac4e4; line-height: 1.55; }
    &:hover { background: rgba(78, 160, 255, 0.08); }
    &.done { color: #9fd0b8; i { background: rgba(46, 230, 160, 0.18); color: var(--vr-ok); } }
    &.active {
      color: #e8f3ff; background: rgba(78, 160, 255, 0.16);
      i { background: #4ea6ff; color: #04122e; font-weight: 700; }
    }
  }
}
.vr-telemetry {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px;
  div {
    padding: 6px 8px; border-radius: 6px;
    background: rgba(6, 18, 40, 0.78); border: 1px solid rgba(78, 160, 255, 0.28);
    em { display: block; font-style: normal; font-size: 10px; color: #8eabc8; }
    b { font-size: 14px; }
    &.ok b { color: var(--vr-ok); }
    &.warn b { color: var(--vr-warn); }
    &.alarm b { color: var(--vr-alarm); }
  }
}
.vr-devices { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.vd-item {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 12px; padding: 6px 8px; border-radius: 6px;
  background: rgba(8, 24, 48, 0.45); color: #b7cce8;
  b { font-weight: 700; }
  &.ok b { color: var(--vr-ok); }
  &.warn b { color: var(--vr-warn); }
  &.alarm b { color: var(--vr-alarm); }
}
.vr-controls {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px; background: rgba(20, 48, 98, 0.35); border-radius: 6px;
}
.vr-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.vr-hint { font-size: 11px; color: #7f9bbd; }
.vr-error { font-size: 12px; color: var(--vr-alarm); }
.vr-desc {
  font-size: 12px; color: #aebcd8; line-height: 1.6;
  padding: 10px 12px; background: rgba(20, 48, 98, 0.3); border-radius: 6px;
  border-left: 2px solid #4ee6ff;
}
.vr-source {
  font-size: 11px; color: #d8b887; line-height: 1.5;
  padding: 7px 10px; border-radius: 6px;
  background: rgba(255, 176, 58, 0.08);
  border: 1px dashed rgba(255, 176, 58, 0.36);
}

@media (max-width: 1100px) {
  .vr-scenarios { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vr-main { grid-template-columns: 1fr; }
}
</style>
