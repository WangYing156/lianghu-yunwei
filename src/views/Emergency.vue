<template>
  <div class="page-bg" :class="{ 'vr-immersive': vrFullscreen }">
    <!-- 应急处置三维场景（可拖拽调高；VR 沉浸时升高） -->
    <div class="panel scene-panel" :class="{ tall: vrFullscreen || vrLinked }">
      <TunnelScene
        ref="sceneRef"
        map-mode
        resizable
        :points="emergencyPoints"
        :height="vrFullscreen || vrLinked ? '520px' : '320px'"
      />
    </div>

    <div v-show="!vrFullscreen" class="grid-2" style="margin-top: 16px">
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

    <div v-show="!vrFullscreen" class="grid-2" style="margin-top: 16px">
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

    <!-- 孪生VR仿真 -->
    <div class="panel vr-panel" :class="{ immersive: vrFullscreen }" style="margin-top: 16px">
      <div class="panel-title">
        孪生VR仿真
        <span class="vr-tag">数字孪生 · 沉浸式应急推演</span>
        <span v-if="vrLinked" class="vr-tag live">已联动上方三维场景</span>
      </div>
      <div class="vr-body">
        <div class="vr-main">
          <div class="vr-viewport" :class="[vrSceneKey, { roaming: vrRoaming }]">
            <div class="vr-sky"></div>
            <div class="vr-ceiling"></div>
            <div class="vr-wall vr-wall-l"></div>
            <div class="vr-wall vr-wall-r"></div>
            <div class="vr-road"></div>
            <div class="vr-lanes"></div>
            <div class="vr-fx" aria-hidden="true"></div>
            <span class="vr-hud">● {{ vrRoaming ? '推演中' : '已暂停' }} · {{ vrScene }} · {{ vrStepTitle }}</span>
            <span class="vr-compass">N</span>
            <div class="vr-telemetry">
              <div v-for="t in vrTelemetry" :key="t.k"><em>{{ t.k }}</em><b :class="t.cls">{{ t.v }}</b></div>
            </div>
          </div>
          <div class="vr-side">
            <div class="vs-label">推演步骤</div>
            <ol class="vr-steps">
              <li
                v-for="(s, i) in vrSteps"
                :key="s"
                :class="{ active: i === vrStepIndex, done: i < vrStepIndex }"
                @click="vrStepIndex = i"
              >
                <i>{{ i + 1 }}</i><span>{{ s }}</span>
              </li>
            </ol>
            <div class="vs-label" style="margin-top: 12px">联动设备</div>
            <div class="vr-devices">
              <div v-for="d in vrDevices" :key="d.name" class="vd-item" :class="d.status">
                <span>{{ d.name }}</span>
                <b>{{ d.val }}</b>
              </div>
            </div>
          </div>
        </div>
        <div class="vr-controls">
          <div class="vr-scene-switch">
            <span class="vs-label">仿真场景</span>
            <el-radio-group v-model="vrScene" size="small" @change="onVrSceneChange">
              <el-radio-button value="火灾疏散">火灾疏散</el-radio-button>
              <el-radio-button value="积水排涝">积水排涝</el-radio-button>
              <el-radio-button value="交通事故">交通事故</el-radio-button>
              <el-radio-button value="日常巡检">日常巡检</el-radio-button>
            </el-radio-group>
          </div>
          <div class="vr-btns">
            <el-button size="small" :type="vrRoaming ? 'primary' : 'default'" @click="toggleVrRoam">
              <el-icon><VideoPlay v-if="!vrRoaming" /><VideoPause v-else /></el-icon>{{ vrRoaming ? '暂停' : '漫游' }}
            </el-button>
            <el-button size="small" :type="vrLinked ? 'success' : 'default'" @click="toggleVrLink">
              {{ vrLinked ? '解除场景联动' : '联动三维巡游' }}
            </el-button>
            <el-button size="small" @click="resetVr"><el-icon><RefreshRight /></el-icon>重置视角</el-button>
            <el-button size="small" type="success" @click="toggleVrFullscreen">
              <el-icon><FullScreen /></el-icon>{{ vrFullscreen ? '退出沉浸' : '全屏沉浸' }}
            </el-button>
            <el-button size="small" @click="focusVrHotspot">定位关键点</el-button>
          </div>
        </div>
        <div class="vr-desc">{{ vrDesc }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { VideoPlay, VideoPause, RefreshRight, FullScreen } from '@element-plus/icons-vue'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'
import VChart from '../components/VChart.vue'

type SceneApi = {
  locatePoint: (id: string) => void | Promise<void>
  startRoaming: () => void
  stopRoaming: () => void
  isRoaming: () => boolean
}

const sceneRef = ref<SceneApi | null>(null)

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
type VrScene = '火灾疏散' | '积水排涝' | '交通事故' | '日常巡检'

const vrRoaming = ref(true)
const vrScene = ref<VrScene>('火灾疏散')
const vrLinked = ref(false)
const vrFullscreen = ref(false)
const vrStepIndex = ref(0)

const vrScripts: Record<
  VrScene,
  {
    desc: string
    hotspot: string
    steps: string[]
    devices: { name: string; val: string; status: 'ok' | 'warn' | 'alarm' }[]
    telemetry: { k: string; v: string; cls: string }[]
  }
> = {
  火灾疏散: {
    desc: '模拟隧道火灾工况，联动排烟风机、疏散指示灯、应急广播与逃生通道，验证人员疏散时间与烟气控制效果，辅助应急演练与预案优化。',
    hotspot: 'fan1',
    steps: ['火情确认与分区锁定', '排烟模式切换', '诱导/广播疏散指引', '通道清障与复盘'],
    devices: [
      { name: '排烟风机 PY-1', val: '排烟 42Hz', status: 'warn' },
      { name: '消防水泵 FP-1', val: '0.72MPa', status: 'ok' },
      { name: '应急广播', val: '播放中', status: 'alarm' },
      { name: '卷帘门', val: '降落到位', status: 'warn' },
    ],
    telemetry: [
      { k: '烟气层', v: '2.1m', cls: 'num-orange' },
      { k: '温度', v: '68℃', cls: 'num-red' },
      { k: '能见度', v: '18m', cls: 'num-orange' },
    ],
  },
  积水排涝: {
    desc: '模拟暴雨积水工况，联动积水监测、排涝泵、挡水板与情报板预警，推演排水能力与水位变化，为防汛调度提供可视化决策支持。',
    hotspot: 'w2',
    steps: ['液位红色预警', '泵站联动启动', '交通诱导绕行', '水位回落确认'],
    devices: [
      { name: '积水点 W2', val: '26.8cm', status: 'alarm' },
      { name: '排涝泵 P1', val: '210m³/h', status: 'warn' },
      { name: '排涝泵 P2', val: '210m³/h', status: 'warn' },
      { name: '情报板', val: '积水绕行', status: 'ok' },
    ],
    telemetry: [
      { k: '液位', v: '26.8cm', cls: 'num-red' },
      { k: '泵压', v: '0.60MPa', cls: 'num-blue' },
      { k: '雨强', v: '38mm/h', cls: 'num-orange' },
    ],
  },
  交通事故: {
    desc: '模拟隧道内车辆碰撞/追尾工况，联动车道指示器、可变情报板、视频监控与紧急电话，演练交通管制与事故处置流程。',
    hotspot: 'm1',
    steps: ['接警与视频复核', '车道管制发布', '现场处置疏导', '解除管制恢复'],
    devices: [
      { name: '车道指示器', val: '左闭右通', status: 'warn' },
      { name: '可变情报板', val: '事故缓行', status: 'ok' },
      { name: '紧急电话', val: '通话中', status: 'alarm' },
      { name: '视频监控', val: '锁定画面', status: 'ok' },
    ],
    telemetry: [
      { k: '占道', v: '1 车道', cls: 'num-orange' },
      { k: '响应', v: '3.8min', cls: 'num-green' },
      { k: '排队', v: '420m', cls: 'num-blue' },
    ],
  },
  日常巡检: {
    desc: '沿竣工模型路面路径巡游，在模型内部检视设备，叠加实时运行数据（CO/照度/风速/结构应力），支持点位定位与故障标注。',
    hotspot: 'fire1',
    steps: ['入口段结构巡视', '机电设备抽检', '环控指标核对', '异常标注闭环'],
    devices: [
      { name: 'CO 监测', val: '12ppm', status: 'ok' },
      { name: '照度', val: '328lx', status: 'ok' },
      { name: '风速', val: '2.6m/s', status: 'ok' },
      { name: '应力监测', val: '正常', status: 'ok' },
    ],
    telemetry: [
      { k: 'CO', v: '12ppm', cls: 'num-green' },
      { k: '照度', v: '328lx', cls: 'num-blue' },
      { k: '风速', v: '2.6m/s', cls: 'num-blue' },
    ],
  },
}

const vrSceneKey = computed(() => {
  const map: Record<VrScene, string> = {
    火灾疏散: 'scene-fire',
    积水排涝: 'scene-flood',
    交通事故: 'scene-traffic',
    日常巡检: 'scene-patrol',
  }
  return map[vrScene.value]
})
const vrDesc = computed(() => vrScripts[vrScene.value].desc)
const vrSteps = computed(() => vrScripts[vrScene.value].steps)
const vrDevices = computed(() => vrScripts[vrScene.value].devices)
const vrTelemetry = computed(() => vrScripts[vrScene.value].telemetry)
const vrStepTitle = computed(
  () => vrSteps.value[vrStepIndex.value] || '推演准备',
)

let stepTimer: number | undefined
function armStepTimer() {
  window.clearInterval(stepTimer)
  if (!vrRoaming.value) return
  stepTimer = window.setInterval(() => {
    vrStepIndex.value = (vrStepIndex.value + 1) % vrSteps.value.length
  }, 4200)
}

function onVrSceneChange() {
  vrStepIndex.value = 0
  armStepTimer()
  if (vrLinked.value) focusVrHotspot()
}

function toggleVrRoam() {
  vrRoaming.value = !vrRoaming.value
  if (vrLinked.value) {
    if (vrRoaming.value) sceneRef.value?.startRoaming()
    else sceneRef.value?.stopRoaming()
  }
}

function toggleVrLink() {
  vrLinked.value = !vrLinked.value
  if (vrLinked.value) {
    vrRoaming.value = true
    sceneRef.value?.startRoaming()
    focusVrHotspot()
  } else {
    sceneRef.value?.stopRoaming()
  }
}

function toggleVrFullscreen() {
  vrFullscreen.value = !vrFullscreen.value
  if (vrFullscreen.value) {
    vrLinked.value = true
    vrRoaming.value = true
    sceneRef.value?.startRoaming()
  }
}

function focusVrHotspot() {
  const id = vrScripts[vrScene.value].hotspot
  void sceneRef.value?.locatePoint(id)
}

function resetVr() {
  vrRoaming.value = false
  vrStepIndex.value = 0
  sceneRef.value?.stopRoaming()
  window.setTimeout(() => {
    vrRoaming.value = true
    if (vrLinked.value) sceneRef.value?.startRoaming()
    armStepTimer()
  }, 60)
}

watch(vrRoaming, armStepTimer, { immediate: true })
watch(vrSteps, () => {
  vrStepIndex.value = 0
})

onBeforeUnmount(() => {
  window.clearInterval(stepTimer)
  sceneRef.value?.stopRoaming()
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
.vr-panel {
  .panel-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  &.immersive {
    margin-top: 12px !important;
    border-color: rgba(78, 230, 255, 0.55);
  }
}
.vr-tag {
  font-size: 11px; font-weight: 400; color: #4ee6ff;
  background: rgba(78, 230, 255, 0.12); border: 1px solid rgba(78, 230, 255, 0.3);
  padding: 1px 8px; border-radius: 10px;
  &.live { color: #2ee6a0; border-color: rgba(46, 230, 160, 0.4); background: rgba(46, 230, 160, 0.1); }
}
.vr-body { display: flex; flex-direction: column; gap: 10px; }
.vr-main {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(220px, 0.9fr);
  gap: 12px;
}
.vr-viewport {
  position: relative; height: 280px; border-radius: 6px; overflow: hidden;
  background: #0a1a33; perspective: 700px;
  border: 1px solid rgba(78, 160, 255, 0.3);
}
.vr-sky {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(90, 140, 220, 0.18), transparent 70%);
}
.vr-ceiling {
  position: absolute; left: 50%; top: 0; width: 100%; height: 48%;
  transform: translateX(-50%);
  background: linear-gradient(to bottom, #182e52 0%, #0e1e3d 100%);
  clip-path: polygon(30% 0, 70% 0, 56% 100%, 44% 100%);
}
.vr-ceiling::after {
  content: ""; position: absolute; inset: 0;
  background: repeating-linear-gradient(to bottom, transparent 0 40px, rgba(255, 236, 160, 0.5) 40px 44px);
  clip-path: inherit;
}
.vr-wall { position: absolute; top: 10%; bottom: 40%; width: 46%; }
.vr-wall-l {
  left: 0;
  background: linear-gradient(to right, #1b3057 0%, #12234a 70%, transparent 100%);
  clip-path: polygon(0 0, 78% 8%, 78% 96%, 0 100%);
}
.vr-wall-r {
  right: 0;
  background: linear-gradient(to left, #1b3057 0%, #12234a 70%, transparent 100%);
  clip-path: polygon(22% 8%, 100% 0, 100% 100%, 22% 96%);
}
.vr-road {
  position: absolute; bottom: 0; left: 0; right: 0; height: 48%;
  background: linear-gradient(to top, #0f1c38 0%, #1a2f5c 30%, #24407a 65%, #2c4d90 100%);
  clip-path: polygon(30% 0, 70% 0, 118% 100%, -18% 100%);
}
.vr-lanes {
  position: absolute; bottom: 0; left: 50%; width: 4px; height: 48%;
  transform: translateX(-50%) rotateX(62deg); transform-origin: bottom;
  background: repeating-linear-gradient(to top, #e8c34a 0 24px, transparent 24px 56px);
  filter: blur(0.4px);
}
.vr-fx { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen; opacity: 0.55; }
.scene-fire .vr-fx {
  background:
    radial-gradient(ellipse 40% 30% at 48% 42%, rgba(255, 90, 40, 0.45), transparent 70%),
    radial-gradient(ellipse 50% 40% at 55% 35%, rgba(255, 180, 60, 0.2), transparent 70%);
}
.scene-flood .vr-fx {
  background: linear-gradient(to top, rgba(40, 140, 255, 0.35) 0%, transparent 45%);
}
.scene-traffic .vr-fx {
  background: repeating-linear-gradient(90deg, transparent 0 40px, rgba(255, 80, 80, 0.12) 40px 48px);
}
.scene-patrol .vr-fx {
  background: radial-gradient(ellipse 60% 40% at 50% 30%, rgba(78, 230, 255, 0.12), transparent 70%);
}
.vr-viewport.roaming .vr-road { animation: vrRoad 1.3s linear infinite; }
.vr-viewport.roaming .vr-lanes { animation: vrLane 1.1s linear infinite; }
@keyframes vrRoad { from { background-position-y: 0; } to { background-position-y: 180px; } }
@keyframes vrLane { from { background-position-y: 0; } to { background-position-y: -56px; } }
.vr-hud {
  position: absolute; left: 10px; top: 10px;
  font-size: 11px; color: #4ee6ff;
  background: rgba(8, 24, 48, 0.8); padding: 3px 8px; border-radius: 4px;
  border: 1px solid rgba(78, 230, 255, 0.35);
  max-width: 70%;
}
.vr-compass {
  position: absolute; right: 12px; top: 10px;
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(8, 24, 48, 0.8); border: 1px solid rgba(78, 160, 255, 0.4);
  display: flex; align-items: center; justify-content: center;
  color: #4ee6ff; font-weight: 700; font-size: 13px;
}
.vr-telemetry {
  position: absolute; left: 10px; bottom: 10px;
  display: flex; gap: 8px; flex-wrap: wrap;
  div {
    min-width: 72px; padding: 5px 8px; border-radius: 6px;
    background: rgba(6, 18, 40, 0.78); border: 1px solid rgba(78, 160, 255, 0.28);
    em { display: block; font-style: normal; font-size: 10px; color: #8eabc8; }
    b { font-size: 13px; }
  }
}
.vr-side {
  padding: 10px 12px; background: rgba(20, 48, 98, 0.35); border-radius: 6px;
  border: 1px solid rgba(78, 160, 255, 0.18);
}
.vr-steps {
  list-style: none; display: flex; flex-direction: column; gap: 6px; margin: 6px 0 0;
  li {
    display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8fa8c8;
    padding: 6px 8px; border-radius: 6px; cursor: pointer;
    i {
      width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
      font-style: normal; font-size: 10px; background: rgba(78, 160, 255, 0.15); color: #9cc4ef;
    }
    &.done { color: #9fd0b8; i { background: rgba(46, 230, 160, 0.18); color: #2ee6a0; } }
    &.active {
      color: #e8f3ff; background: rgba(78, 160, 255, 0.16);
      i { background: #4ea6ff; color: #04122e; font-weight: 700; }
    }
  }
}
.vr-devices { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.vd-item {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 12px; padding: 6px 8px; border-radius: 6px;
  background: rgba(8, 24, 48, 0.45); color: #b7cce8;
  b { font-weight: 700; }
  &.ok b { color: #2ee6a0; }
  &.warn b { color: #ffb03a; }
  &.alarm b { color: #ff5f6b; }
}
.vr-controls {
  display: flex; flex-direction: column; gap: 10px;
  padding: 10px 12px; background: rgba(20, 48, 98, 0.35); border-radius: 6px;
}
.vr-scene-switch { display: flex; flex-direction: column; gap: 6px; }
.vs-label { font-size: 11px; color: #7188a8; }
.vr-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.vr-desc {
  font-size: 12px; color: #aebcd8; line-height: 1.6;
  padding: 10px 12px; background: rgba(20, 48, 98, 0.3); border-radius: 6px;
  border-left: 2px solid #4ee6ff;
}

.page-bg.vr-immersive {
  .vr-viewport { height: 320px; }
}

@media (max-width: 1100px) {
  .vr-main { grid-template-columns: 1fr; }
}
</style>
