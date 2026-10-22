<template>
  <Teleport to="body" :disabled="!expanded">
    <div
      class="tunnel-scene"
      :class="{
        'is-roaming': roaming.active,
        'is-expanded': expanded,
        'is-inspecting': !!modelPickInfo || clusterMembers.length > 0,
      }"
      :style="{ height: sceneStyleHeight }"
    >
      <!-- 三维隧道透视场景（铺满） -->
      <div
        class="scene-viewport"
        :class="{ focused: focusedId, 'map-mode': true }"
        :style="{ '--fx': focusOrigin.x, '--fy': focusOrigin.y }"
      >
        <!-- Cesium：影像/矢量底图 + 本地 3D Tiles 实景模型 -->
        <div class="scene-map-stack">
          <div
            ref="mapContainerRef"
            class="scene-map-root"
            :class="{ 'is-loading': !mapReady }"
          />
          <div
            v-if="devicePopupAnchor"
            class="map-floating-popup"
            :style="{
              left: devicePopupAnchor.x + 'px',
              top: devicePopupAnchor.y + 'px',
            }"
            @pointerdown.stop
            @click.stop
          >
            <button
              type="button"
              class="map-floating-popup__x"
              title="关闭"
              @click.stop.prevent="forceClosePopup"
            >
              ×
            </button>
            <div
              ref="devicePopupMountRef"
              class="map-floating-popup__inner"
              :style="{
                maxHeight: `max(130px, ${(mapContainerRef?.clientHeight || 420) - 110}px)`,
              }"
            />
          </div>

          <!-- 选中模型属性（就近点击位置） -->
          <div
            v-if="modelPickInfo"
            class="model-attr-panel"
            :style="modelPickPanelStyle"
            @pointerdown.stop
            @click.stop
          >
            <div class="map-attr-head">
              <span
                class="map-attr-role"
                :style="{ '--rc': roleMeta(modelPickInfo.role).color }"
              >
                <span class="map-attr-role-icon">{{
                  roleMeta(modelPickInfo.role).icon
                }}</span>
                <span class="map-attr-role-txt">{{
                  roleMeta(modelPickInfo.role).label
                }}</span>
              </span>
              <button
                type="button"
                class="map-floating-popup__x"
                @click="forceClosePopup"
              >
                ×
              </button>
            </div>
            <div class="map-attr-title">{{ modelPickInfo.title }}</div>
            <div class="map-attr-body">
              <div
                v-for="(val, key) in modelPickInfo.properties"
                :key="key"
                class="map-attr-row"
              >
                <span class="k">{{ key }}</span>
                <span class="v">{{ val }}</span>
              </div>
            </div>
            <div
              v-if="modelPickInfo.canViewVideo && modelPickInfo.equipmentId"
              class="map-attr-actions"
            >
              <button
                type="button"
                @click="viewEquipmentVideo(modelPickInfo.equipmentId)"
              >
                查看监控示例画面 ↗
              </button>
            </div>
          </div>
          <section
            v-if="clusterMembers.length"
            class="marker-cluster-panel"
            aria-label="聚合点位列表"
            @pointerdown.stop
            @click.stop
          >
            <header>
              <div>
                <strong>{{ clusterMembers.length }} 个点位</strong
                ><small>已放大聚合区域，选择具体设施检视</small>
              </div>
              <button
                type="button"
                aria-label="关闭聚合列表"
                @click="forceClosePopup"
              >
                ×
              </button>
            </header>
            <div class="cluster-member-list">
              <button
                v-for="member in clusterMembers"
                :key="member.id"
                type="button"
                class="cluster-member"
                :data-point-id="member.id"
                @click="locatePoint(member.id)"
              >
                <span>{{ member.name }}</span
                ><small>{{ member.source }}</small
                ><b>↗</b>
              </button>
            </div>
          </section>
        </div>
        <div v-if="!mapReady" class="map-loading-mask">
          <span v-if="!mapError" class="ml-spinner"></span>
          <span>{{
            mapError ||
            (basemap === 'reality' ? '实景三维模型加载中…' : '地图场景加载中…')
          }}</span>
          <button
            v-if="mapError"
            type="button"
            class="map-retry"
            @click="initializeMap"
          >
            重新加载
          </button>
        </div>

        <div class="map-vignette" aria-hidden="true"></div>
        <Transition name="scene-panel">
          <ModelRoamingPanel
            v-if="roaming.active || roaming.loading || roaming.error"
            :state="roaming"
            :equipment="roamEquipment"
            @start="toggleRoaming"
            @exit="stopRoaming"
            @play="toggleRoamingPlayback"
            @seek="seekRoaming"
            @reverse="reverseRoaming"
            @speed="roaming.speed = $event"
            @layer="setRoamingLayer"
            @height="setRoamingEyeHeight"
            @offset="setRoamingLateralOffset"
            @dim="setRoamingDimStructure"
            @road="setRoamingRoadXray"
            @entry="returnToRoamingEntry"
            @equipment="inspectRoamingEquipment"
          />
        </Transition>

        <!-- 轻量场景 Dock：高级选项默认折叠，保留模型的展示空间 -->
        <div
          class="scene-toolbar scene-toolbar--float"
          aria-label="三维场景工具栏"
          @pointerdown.stop
        >
          <el-popover
            :width="320"
            trigger="click"
            placement="top"
            popper-class="layer-pop"
            :disabled="roaming.active"
          >
            <template #reference
              ><button type="button" class="tb-act" :disabled="roaming.active">
                <el-icon><Collection /></el-icon><span>图层</span>
              </button></template
            >
            <div class="layer-group-title">
              业务点位图层 <small>按需显示</small>
            </div>
            <el-collapse v-model="openLayerGroups" class="layer-collapse">
              <el-collapse-item
                v-for="g in layerGroups"
                :key="g.key"
                :name="g.key"
              >
                <template #title
                  ><span class="layer-group-name"
                    ><i :style="{ background: g.color }"></i>{{ g.name
                    }}<small
                      >{{ activeCount(g) }} / {{ g.all.length }}</small
                    ></span
                  ></template
                >
                <div class="layer-actions">
                  <el-switch
                    v-model="g.on"
                    size="small"
                    active-text="显示"
                  /><button
                    type="button"
                    class="la-btn"
                    @click="selectAllInGroup(g)"
                  >
                    全选</button
                  ><button
                    type="button"
                    class="la-btn"
                    @click="clearGroupItems(g)"
                  >
                    清空
                  </button>
                </div>
                <el-checkbox-group v-model="g.items"
                  ><div
                    v-for="item in g.all"
                    :key="item.key"
                    class="layer-check"
                  >
                    <el-checkbox :value="item.key" size="small"
                      ><span
                        class="lc-dot"
                        :style="{ background: item.color }"
                      ></span
                      >{{ item.name }}</el-checkbox
                    >
                  </div></el-checkbox-group
                >
              </el-collapse-item>
            </el-collapse>
            <p class="layer-help">
              远景自动聚合 · 点击数字展开<br />BIM 图标近景隐藏 · 告警独立显示
            </p>
            <p class="layer-count">
              {{ markerStats.businessCount }} 个业务点 ·
              {{ markerStats.modelCount }} 个真实 BIM 构件
            </p>
            <button
              v-if="markerStats.error"
              type="button"
              class="layer-retry"
              @click="retryEquipmentMarkers"
            >
              设备图标加载失败，点击重试
            </button>
          </el-popover>
          <SceneSettings
            :ready="mapReady"
            :disabled="roaming.active || roaming.loading"
            v-model:basemap="basemap"
            v-model:view-mode="mapViewMode"
            v-model:basemap-enabled="basemapEnabled"
            v-model:orthophoto-alpha="orthophotoAlpha"
            v-model:oblique-alpha="obliqueAlpha"
            v-model:show-full-tunnel="showFullTunnel"
            v-model:show-partial-tunnel="showPartialTunnel"
            v-model:bim-opacity="bimOpacity"
            v-model:bim-brightness="bimBrightness"
            v-model:partial-xray="partialXray"
            v-model:road-xray="roadXray"
            v-model:environment="sceneEnvironment"
          />
          <SceneSection
            :ready="mapReady"
            :disabled="
              mapViewMode !== '3d' || roaming.active || roaming.loading
            "
            :state="section"
            @update="updateSection"
            @reset="resetSection"
          />
          <span class="tb-divider" aria-hidden="true"></span>
          <button
            type="button"
            class="tb-act tb-act--primary"
            :class="{ on: roaming.active }"
            :disabled="!mapReady || mapViewMode !== '3d'"
            :title="
              mapViewMode !== '3d'
                ? '请先在场景设置中切换三维视图'
                : '沿竣工模型真实路面巡游，检视内部设备'
            "
            @click="toggleRoaming"
          >
            <el-icon><Guide /></el-icon
            ><span>{{ roaming.active ? '退出巡游' : '内部巡游' }}</span>
          </button>
          <button
            type="button"
            class="tb-act tb-act--icon"
            :title="expanded ? '退出大图' : '放大场景'"
            :aria-label="expanded ? '退出大图' : '放大场景'"
            :aria-pressed="expanded"
            @click="expanded = !expanded"
          >
            <el-icon><FullScreen /></el-icon>
          </button>
          <button
            type="button"
            class="tb-act tb-act--icon"
            :disabled="!mapReady"
            title="复位视角"
            aria-label="复位视角"
            @click="onResetView"
          >
            <el-icon><RefreshRight /></el-icon>
          </button>
        </div>
      </div>

      <div
        v-if="resizable && !expanded"
        class="resize-handle"
        :class="{ resizing }"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整场景高度"
        :aria-valuemin="resizeMinPx()"
        :aria-valuemax="resizeMaxPx()"
        :aria-valuenow="sceneHeight || parseFloat(height || '420')"
        tabindex="0"
        @pointerdown="startResize"
        @keydown="resizeWithKeyboard"
        @dblclick.prevent="toggleResizeHeight"
      >
        <span class="resize-grip" aria-hidden="true"></span>
      </div>

      <el-dialog
        v-if="detailVisible"
        v-model="detailVisible"
        width="440px"
        :modal="false"
        :show-close="true"
        append-to-body
        class="point-dialog"
        @closed="forceClosePopup()"
      >
        <div v-if="detail" class="pd-shell">
          <div class="pd-header">
            <div class="pd-icon-wrap">
              {{ detail.icon || kindIcon(detail.kind) }}
            </div>
            <div class="pd-titles">
              <div class="pd-name">{{ detail.name }}</div>
              <div class="pd-meta">
                {{ kindName(detail.kind) }} · {{ groupName(detail.group) }}
              </div>
            </div>
            <el-tag
              class="pd-status"
              :type="statusType(detail.status)"
              effect="dark"
              round
            >
              {{ statusName(detail.status) }}
            </el-tag>
          </div>
          <div class="pd-body">
            <div class="pd-grid">
              <div class="pd-cell">
                <div class="pd-label">桩号位置</div>
                <div class="pd-val">{{ detail.stake }}</div>
              </div>
              <div class="pd-cell">
                <div class="pd-label">数值 / 状态</div>
                <div class="pd-val">{{ detail.value || '—' }}</div>
              </div>
              <div class="pd-cell">
                <div class="pd-label">最近巡检</div>
                <div class="pd-val">{{ detail.inspect || '—' }}</div>
              </div>
              <div class="pd-cell" :class="{ 'alarm-cell': detail.alarm }">
                <div class="pd-label">关联告警</div>
                <div class="pd-val">{{ detail.alarm || '无' }}</div>
              </div>
            </div>
            <div
              v-if="detail.history && detail.history.length"
              class="history-chart"
            >
              <div class="hc-title">
                <span>数值变化趋势</span>
                <span class="hc-unit">{{ detail.unit || '' }}</span>
              </div>
              <VChart :option="historyOption(detail)" height="200px" />
            </div>
          </div>
          <div class="pd-foot">
            <el-button size="small" @click="forceClosePopup">关闭</el-button>
            <el-button
              v-if="detail.kind === 'camera' || detail.kind === 'dome'"
              size="small"
              type="primary"
              @click="openVideoPreview(cameraForPoint(detail))"
              >查看监控画面</el-button
            >
          </div>
        </div>
      </el-dialog>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import VChart from './VChart.vue'
import { useRoute } from 'vue-router'
import SceneSection from './SceneSection.vue'
import { defaultPointGroups, mergeScenePoints } from '../config/scenePoints'
import {
  sceneFocusRequest,
  consumeSceneFocus,
  requestSceneFocus,
} from '../composables/useSceneNavigation'
import { cameraForPoint } from '../config/cctvGallery'
import { openVideoPreview } from '../composables/useVideoPreview'
import SceneSettings from './SceneSettings.vue'
import ModelRoamingPanel from './ModelRoamingPanel.vue'
import {
  Collection,
  FullScreen,
  Guide,
  RefreshRight,
} from '@element-plus/icons-vue'
import {
  useCesiumTunnelMap,
  type ModelPickInfo,
} from '../composables/useCesiumTunnelMap'
import { loadTunnelRoute, progressOnRoute } from '../utils/tunnelRouteLoader'
import type { MapDevicePoint } from '../composables/useCesiumTunnelMap'
import {
  getSceneVisualPreset,
  type SceneVisualPresetId,
} from '../config/sceneVisualPresets'
import { type SceneEnvironmentId } from '../config/sceneEnvironment'
import {
  createMapPopupElement,
  disposeMapPopupChart,
  mountMapPopupChart,
} from '../utils/mapPopupContent'

import type { PointKind, PointGroup, ScenePoint } from '../types/scene'
export type { PointKind, PointGroup, ScenePoint } from '../types/scene'

const props = defineProps<{
  points: ScenePoint[]
  height?: string
  mapMode?: boolean
  defaultGroups?: PointGroup[]
  resizable?: boolean
  minHeight?: number
  maxHeight?: number
  /** 选择模式：点击点位时不弹内部详情，改为 emit select 事件（用于资产页等自定义选中） */
  selectable?: boolean
}>()
const emit = defineEmits<{
  (e: 'contextmenu', point: ScenePoint): void
  (e: 'select', point: ScenePoint): void
}>()

/* 底图模式：卫星影像 / 电子地图 / 实景三维 */
const route = useRoute()
const allPoints = computed(() => mergeScenePoints(props.points))
const roadXray = ref(false)

const basemap = ref<'satellite' | 'vector' | 'reality'>('reality')
const mapViewMode = ref<'2d' | '3d'>('3d')
const sceneVisualPreset = ref<SceneVisualPresetId>('engineering')
const orthophotoAlpha = ref(0)
const obliqueAlpha = ref(22)
const sceneEnvironment = ref<SceneEnvironmentId>('default')
const basemapEnabled = ref(false)
const showFullTunnel = ref(true)
const showPartialTunnel = ref(true)
const bimBrightness = ref(72)
const _initPreset = getSceneVisualPreset(sceneVisualPreset.value)
const bimOpacity = ref(_initPreset.bimOpacityDefault)
const partialXray = ref(false)
const modelPickInfo = ref<ModelPickInfo | null>(null)
const expanded = ref(false)
const openLayerGroups = ref<string[]>([])

const modelPickPanelStyle = computed(() => {
  const info = modelPickInfo.value
  if (!info || info.screenX == null || info.screenY == null) {
    return { top: '52px', right: '14px', left: 'auto', transform: 'none' }
  }
  // 就近点击点：优先右上方，靠近边缘时翻到另一侧，避免出屏
  const panelW = 300
  const panelH = 220
  const ox = info.screenX + 16
  const oy = info.screenY - 16
  const maxX =
    typeof window !== 'undefined' ? window.innerWidth - panelW - 12 : 1200
  const maxY =
    typeof window !== 'undefined' ? window.innerHeight - panelH - 12 : 800
  let left = ox
  let top = oy
  let transform = 'translateY(-100%)'
  if (left > maxX) left = Math.max(12, info.screenX - panelW - 16)
  if (top < panelH + 12) {
    top = info.screenY + 16
    transform = 'none'
  }
  return {
    left: `${Math.min(Math.max(12, left), maxX)}px`,
    top: `${Math.min(Math.max(12, top), maxY)}px`,
    right: 'auto',
    transform,
  }
})
/** 模型角色 → 徽标元信息 */
const roleMeta = (role: ModelPickInfo['role']) => {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    bim: { icon: '🏗️', label: '施工模型', color: '#22d3ee' },
    partial: { icon: '🏛️', label: '竣工模型', color: '#fb923c' },
    oblique: { icon: '🛰️', label: '倾斜摄影', color: '#94a3b8' },
    unknown: { icon: '🧩', label: '三维构件', color: '#67e8f9' },
  }
  return map[role] ?? map.unknown
}

const mapContainerRef = ref<HTMLDivElement | null>(null)
const mapError = ref('')
let disposed = false

function onContextMenu(p: ScenePoint) {
  emit('contextmenu', p)
}

/* ===== 实景 / 回退模式：沿 GeoJSON 隧道路线（百分比投影）布设 ===== */
const routeScreen = ref<{ x: number; y: number }[]>([])
const realityRouteReady = ref(false)

function routeAt(t: number) {
  const ROUTE = routeScreen.value
  if (ROUTE.length < 2) return ROUTE[0] ?? { x: 50, y: 50 }
  const segLens = ROUTE.slice(1).map((p, i) =>
    Math.hypot(p.x - ROUTE[i].x, p.y - ROUTE[i].y),
  )
  const totalLen = segLens.reduce((a, b) => a + b, 0)
  if (totalLen <= 0) return ROUTE[0]
  let d = Math.max(0, Math.min(1, t)) * totalLen
  for (let i = 0; i < segLens.length; i++) {
    if (d <= segLens[i] || i === segLens.length - 1) {
      const r = segLens[i] > 0 ? Math.min(d / segLens[i], 1) : 0
      return {
        x: ROUTE[i].x + (ROUTE[i + 1].x - ROUTE[i].x) * r,
        y: ROUTE[i].y + (ROUTE[i + 1].y - ROUTE[i].y) * r,
      }
    }
    d -= segLens[i]
  }
  return ROUTE[ROUTE.length - 1]
}
function hashId(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/* 点位沿隧道路线布设：优先用桩号，其次按点位顺序插值；所有底图模式统一 */
function routePosFor(p: ScenePoint) {
  const arr = visiblePoints.value
  const tt = progressOnRoute(p, arr)
  const pt = routeAt(tt)
  // 沿线路法向做小幅偏移，避免同桩号附近点位完全重叠
  const jitter = ((hashId(p.id) % 9) - 4) * 0.7
  return {
    left: (pt.x + jitter * 0.4).toFixed(2) + '%',
    top: (pt.y + jitter * 0.3).toFixed(2) + '%',
    scale: 0.85 + (hashId(p.id) % 5) * 0.06,
  }
}
function posOf(p: ScenePoint) {
  if (!realityRouteReady.value) return { left: '50%', top: '50%', scale: 0 }
  return routePosFor(p)
}

const showTunnelRoute = ref(false)
const showFlowAnim = ref(false)
const showDeviceLayer = ref(true)

function toMapDevice(p: ScenePoint): MapDevicePoint {
  return {
    id: p.id,
    stake: p.stake,
    name: p.name,
    status: p.status,
    group: p.group,
    kind: p.kind,
    value: p.value,
    inspect: p.inspect,
    alarm: p.alarm,
    icon: p.icon || kindIcon(p.kind),
    unit: p.unit,
    history: p.history,
    videoId: p.videoId,
    simulated: p.simulated,
    alertId: p.alertId,
  }
}

function buildDevicePopup(p: MapDevicePoint) {
  return createMapPopupElement(
    {
      name: p.name,
      icon: p.icon || kindIcon(p.kind),
      kindLabel: kindName(p.kind),
      groupLabel: groupName(p.group),
      statusLabel: p.simulated
        ? `${statusName(p.status)} · 模拟`
        : statusName(p.status),
      statusTone: statusTone(p.status),
      stake: p.stake,
      value: p.value,
      inspect: p.inspect,
      alarm: p.alarm,
      unit: p.unit,
      history: p.history,
    },
    {
      onClose: () => forceClosePopup(),
      onVideo:
        p.kind === 'camera' || p.kind === 'dome'
          ? () => openVideoPreview(cameraForPoint(p))
          : undefined,
    },
  )
}

/* closeScenePopup 在 useCesiumTunnelMap 之后才注入，关闭时做空判断避免 TDZ/HMR 竞态 */
let closeScenePopupSafe: () => void = () => undefined

function forceClosePopup() {
  detailVisible.value = false
  focusedId.value = null
  modelPickInfo.value = null
  closeScenePopupSafe()
}

function selectAllInGroup(g: (typeof layerGroups)[number]) {
  g.on = true
  g.items = g.all.map((it) => it.key)
}

function clearGroupItems(g: (typeof layerGroups)[number]) {
  g.items = []
}

function onResetView() {
  stopRoaming(false)
  forceClosePopup()
  void resetMapView()
}

let autoExpanded = false
async function toggleRoaming() {
  if (roaming.active || roaming.loading) stopRoaming()
  else {
    forceClosePopup()
    if (!expanded.value && (mapContainerRef.value?.clientHeight ?? 0) < 560) {
      autoExpanded = true
      expanded.value = true
      await nextTick()
    }
    void startRoaming()
  }
}

function resizeMaxPx() {
  return props.maxHeight ?? Math.floor(window.innerHeight * 0.8)
}
function resizeMinPx() {
  return props.minHeight ?? Math.floor(window.innerHeight * 0.2)
}

/* 图层分组定义 */
const layerGroups = reactive([
  {
    key: 'structure',
    name: '隧道环境',
    on: true,
    color: '#8fa8d0',
    all: [
      { key: 'structureUp', name: '隧道结构上层', color: '#8fa8d0' },
      { key: 'structureDown', name: '隧道结构下层', color: '#7d9bc9' },
      { key: 'pipe', name: '机电管线', color: '#b08cff' },
      { key: 'passage', name: '应急通道', color: '#2ee6a0' },
      { key: 'opsCenter', name: '隧道运管中心', color: '#4ee6ff' },
      { key: 'rainPump', name: '雨水泵房', color: '#5aa7ff' },
      { key: 'fireStation', name: '消防泵房', color: '#ff5f6b' },
      { key: 'wastePump', name: '废水泵房', color: '#00c9a7' },
      { key: 'substation', name: '变电所', color: '#ffd04d' },
    ],
    items: [
      'structureUp',
      'structureDown',
      'pipe',
      'passage',
      'opsCenter',
      'rainPump',
      'fireStation',
      'wastePump',
      'substation',
    ],
  },
  {
    key: 'env',
    name: '环控系统',
    on: true,
    color: '#00c9a7',
    all: [
      { key: 'covi', name: 'CO/VI检测器', color: '#00c9a7' },
      { key: 'wind', name: '风速风向仪', color: '#4ee6ff' },
      { key: 'illum', name: '照度计', color: '#ffd04d' },
      { key: 'flame', name: '火焰探测器', color: '#ff5f6b' },
      { key: 'heatSensor', name: '感温探测器', color: '#ff8a5a' },
      { key: 'smokeSensor', name: '感烟探测器', color: '#b08cff' },
      { key: 'waterLevel', name: '积水监测', color: '#4ee6ff' },
    ],
    items: [
      'covi',
      'wind',
      'illum',
      'flame',
      'heatSensor',
      'smokeSensor',
      'waterLevel',
    ],
  },
  {
    key: 'traffic',
    name: '交通管控',
    on: true,
    color: '#4ea6ff',
    all: [
      { key: 'laneInd', name: '车道指示器', color: '#2ee6a0' },
      { key: 'infoBoard', name: '可变情报板', color: '#4ee6ff' },
      { key: 'vehicleDet', name: '车辆检测器', color: '#ffd04d' },
      { key: 'camera', name: '固定摄像机', color: '#4ea6ff' },
      { key: 'dome', name: '球形摄像机', color: '#00c9a7' },
      { key: 'phone', name: '紧急电话', color: '#ff8a5a' },
      { key: 'speaker', name: '广播扬声器', color: '#b08cff' },
    ],
    items: [
      'laneInd',
      'infoBoard',
      'vehicleDet',
      'camera',
      'dome',
      'phone',
      'speaker',
    ],
  },
  {
    key: 'monitor',
    name: '结构监测',
    on: true,
    color: '#ff5f6b',
    all: [
      { key: 'corrosion', name: '结构腐蚀监测', color: '#ff5f6b' },
      { key: 'bolt', name: '螺栓受力监测', color: '#ff8a5a' },
      { key: 'pressure', name: '压力监测', color: '#4ee6ff' },
      { key: 'stress', name: '应力应变监测', color: '#b08cff' },
      { key: 'waterpress', name: '水压监测', color: '#00c9a7' },
      { key: 'disease', name: '病害点位', color: '#ff4d4f' },
      { key: 'complaint', name: '投诉点位', color: '#ff8a5a' },
    ],
    items: [
      'corrosion',
      'bolt',
      'pressure',
      'stress',
      'waterpress',
      'disease',
      'complaint',
    ],
  },
  {
    key: 'mep',
    name: '隧道机电',
    on: true,
    color: '#5aa7ff',
    all: [
      { key: 'fan', name: '风机', color: '#5aa7ff' },
      { key: 'damper', name: '风阀', color: '#4ee6ff' },
      { key: 'vent', name: '风口', color: '#00c9a7' },
      { key: 'firePump', name: '消防水泵', color: '#ff5f6b' },
      { key: 'fireValve', name: '消防闸阀', color: '#ff8a5a' },
      { key: 'lamp', name: '照明灯', color: '#ffd04d' },
      { key: 'pump', name: '排水泵', color: '#4ea6ff' },
    ],
    items: ['fan', 'damper', 'vent', 'firePump', 'fireValve', 'lamp', 'pump'],
  },
])
// 统一配置模块默认分组，共享目录保证“开启”不再是没有点位的空图层。
watch(
  () => [route.path, props.defaultGroups] as const,
  () => {
    const groups = props.defaultGroups ?? defaultPointGroups(route.path)
    layerGroups.forEach((group) => {
      group.on = groups.includes(group.key as PointGroup)
    })
  },
  { immediate: true },
)

const detailVisible = ref(false)
const detail = ref<ScenePoint | null>(null)
/* 点击拉近聚集：聚焦某点位时放大并高亮，其他点位淡出 */
const focusedId = ref<string | null>(null)
/* 聚焦时场景拉近的 transform-origin（指向聚焦点位的路线坐标） */
const focusOrigin = computed(() => {
  if (!focusedId.value) return { x: '50%', y: '50%' }
  const p = allPoints.value.find((x) => x.id === focusedId.value)
  if (!p) return { x: '50%', y: '50%' }
  const pos = posOf(p)
  return { x: pos.left, y: pos.top }
})

/* 可拖拽调高 */
const sceneHeight = ref(0)
const sceneStyleHeight = computed(() => {
  if (props.resizable && sceneHeight.value > 0) return sceneHeight.value + 'px'
  return props.height || '420px'
})
const resizing = ref(false)
let stopResize = () => {}
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  stopResize()
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  const startY = event.clientY
  const startH =
    handle.parentElement?.getBoundingClientRect().height ?? sceneHeight.value
  const cursor = document.body.style.cursor
  const userSelect = document.body.style.userSelect
  resizing.value = true
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
  handle.setPointerCapture(event.pointerId)
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return
    sceneHeight.value = Math.max(
      resizeMinPx(),
      Math.min(resizeMaxPx(), startH + e.clientY - startY),
    )
  }
  const finish = (e: PointerEvent) => {
    if (e.pointerId === event.pointerId) stopResize()
  }
  stopResize = () => {
    resizing.value = false
    if (handle.hasPointerCapture(event.pointerId))
      handle.releasePointerCapture(event.pointerId)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    document.body.style.cursor = cursor
    document.body.style.userSelect = userSelect
    stopResize = () => {}
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}
function resizeWithKeyboard(event: KeyboardEvent) {
  const current = sceneHeight.value || parseFloat(props.height || '420')
  const step = event.shiftKey ? 64 : 24
  const next = {
    ArrowUp: current - step,
    ArrowDown: current + step,
    Home: resizeMinPx(),
    End: resizeMaxPx(),
  }[event.key]
  if (next !== undefined) {
    event.preventDefault()
    sceneHeight.value = Math.max(resizeMinPx(), Math.min(resizeMaxPx(), next))
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleResizeHeight()
  }
}

function toggleResizeHeight() {
  const min = resizeMinPx()
  const max = resizeMaxPx()
  const cur = sceneHeight.value || parseFloat(String(props.height || '420'))
  sceneHeight.value = cur >= (min + max) / 2 ? min : max
}

onBeforeUnmount(() => {
  disposed = true
  stopResize()
  cancelAnimationFrame(popupChartRaf)
  disposeMapPopupChart(
    devicePopupMountRef.value?.firstElementChild as HTMLElement | null,
  )
  window.removeEventListener('keydown', onEscClose)
})

/* kind -> group 映射（用于兼容旧 kind 字段按组过滤） */
const groupOfKind = (p: ScenePoint) => p.group

const kindMap: Record<string, string> = {
  // 隧道主体
  structureUp: '🧱',
  structureDown: '🧱',
  pipe: '🔩',
  passage: '🟢',
  opsCenter: '🏢',
  rainPump: '🌧️',
  fireStation: '🚒',
  wastePump: '🚰',
  substation: '⚡',
  // 环控系统
  covi: '🌫️',
  wind: '🌬️',
  illum: '☀️',
  flame: '🔥',
  heatSensor: '🌡️',
  smokeSensor: '💨',
  waterLevel: '💧',
  // 交通管控
  laneInd: '🚦',
  infoBoard: '🖥️',
  vehicleDet: '🚗',
  camera: '📷',
  dome: '📹',
  phone: '☎️',
  speaker: '📢',
  // 结构监测
  corrosion: '🦠',
  bolt: '🔧',
  pressure: '🎯',
  stress: '📏',
  waterpress: '💧',
  // 隧道机电
  fan: '🌀',
  damper: '🔀',
  vent: '🌬️',
  firePump: '🚒',
  fireValve: '🚿',
  lamp: '💡',
  pump: '⚙️',
  // 功能点位
  disease: '🔴',
  complaint: '📝',
}
const kindCn: Record<string, string> = {
  structureUp: '隧道结构上层',
  structureDown: '隧道结构下层',
  pipe: '机电管线',
  passage: '应急通道',
  opsCenter: '隧道运管中心',
  rainPump: '雨水泵房',
  fireStation: '消防泵房',
  wastePump: '废水泵房',
  substation: '变电所',
  covi: 'CO/VI检测器',
  wind: '风速风向仪',
  illum: '照度计',
  flame: '火焰探测器',
  heatSensor: '感温探测器',
  smokeSensor: '感烟探测器',
  waterLevel: '积水监测',
  laneInd: '车道指示器',
  infoBoard: '可变情报板',
  vehicleDet: '车辆检测器',
  camera: '固定摄像机',
  dome: '球形摄像机',
  phone: '紧急电话',
  speaker: '广播扬声器',
  corrosion: '结构腐蚀监测',
  bolt: '螺栓受力监测',
  pressure: '压力监测',
  stress: '应力应变监测',
  waterpress: '水压监测',
  fan: '风机',
  damper: '风阀',
  vent: '风口',
  firePump: '消防水泵',
  fireValve: '消防闸阀',
  lamp: '照明灯',
  pump: '排水泵',
  disease: '病害点位',
  complaint: '投诉信息点位',
}
const groupCn: Record<string, string> = {
  structure: '隧道环境',
  env: '环控系统',
  traffic: '交通管控',
  monitor: '结构监测',
  mep: '隧道机电',
}
const kindIcon = (k: string) => kindMap[k] || '📍'
const kindName = (k: string) => kindCn[k] || k
const groupName = (g: string) => groupCn[g] || g
const statusName = (s: string) =>
  (({ ok: '正常运行', warn: '预警', alarm: '告警', offline: '离线' }) as any)[s]
const statusType = (s: string) =>
  (
    ({
      ok: 'success',
      warn: 'warning',
      alarm: 'danger',
      offline: 'info',
    }) as any
  )[s]

function activeCount(g: any) {
  return g.items.length
}

/* 点位按 group 过滤 */
const visiblePoints = computed(() => {
  const groupEnabled = (g: string) => {
    const lg = layerGroups.find((x) => x.key === g)
    return lg ? lg.on !== false && lg.items.length > 0 : true
  }
  return allPoints.value.filter((p) => {
    if (!groupEnabled(p.group)) return false
    // 组内细分：通过 kind 匹配 items
    const lg = layerGroups.find((x) => x.key === p.group)
    if (!lg) return true
    return lg.items.includes(p.kind)
  })
})

const {
  ready: mapReady,
  mount: mountMap,
  setBasemap: applyMapBasemap,
  setViewMode,
  setBasemapEnabled: applyBasemapEnabled,
  setPartialTunnelVisible,
  setFullTunnelVisible,
  setBimBrightness,
  setRouteLayerVisible,
  setFlowAnimationEnabled,
  setDeviceLayerVisible,
  syncDeviceGraphics,
  setOrthophotoOpacity,
  setObliqueOpacity,
  setBimOpacity,
  setPartialXray,
  setRoadXray,
  roaming,
  roamEquipment,
  startRoaming,
  stopRoaming,
  toggleRoamingPlayback,
  seekRoaming,
  reverseRoaming,
  setRoamingLayer,
  setRoamingEyeHeight,
  setRoamingLateralOffset,
  setRoamingDimStructure,
  inspectRoamingEquipment,
  setRoamingRoadXray,
  returnToRoamingEntry,
  focusDeviceById,
  viewEquipmentVideo,
  markerStats,
  retryEquipmentMarkers,
  clusterMembers,
  section,
  updateSection,
  resetSection,
  setSceneEnvironment,
  resetMapView,
  closeScenePopup,
  devicePopupAnchor,
} = useCesiumTunnelMap(
  mapContainerRef,
  () => visiblePoints.value.map(toMapDevice),
  {
    onPopupClosed: () => {
      focusedId.value = null
      detailVisible.value = false
    },
    onDeviceFocus: (id) => {
      focusedId.value = id
    },
    onDeviceSelect: props.selectable
      ? (p) => {
          const sp = props.points.find((x) => x.id === p.id)
          if (sp) emit('select', sp)
        }
      : undefined,
    buildPopupContent: buildDevicePopup,
    getOrthophotoAlpha: () => orthophotoAlpha.value / 100,
    getObliqueAlpha: () => obliqueAlpha.value / 100,
    getBimOpacity: () => bimOpacity.value / 100,
    getPartialXray: () => partialXray.value,
    getRoadXray: () => roadXray.value,
    getAllDevices: () => allPoints.value.map(toMapDevice),
    isPointKindVisible: (group, kind) => {
      const current = layerGroups.find((g) => g.key === group)
      return !!current?.on && current.items.includes(kind)
    },
    getSceneEnvironmentId: () => sceneEnvironment.value,
    getVisualPresetId: () => sceneVisualPreset.value,
    getBasemapEnabled: () => basemapEnabled.value,
    getShowFullTunnel: () => showFullTunnel.value,
    getShowPartialTunnel: () => showPartialTunnel.value,
    getBimBrightness: () => bimBrightness.value,
    onModelSelect: (info) => {
      modelPickInfo.value = info
    },
  },
)
closeScenePopupSafe = closeScenePopup

watch(
  () => [roaming.active, roaming.loading],
  () => {
    if (autoExpanded && !roaming.active && !roaming.loading) {
      expanded.value = false
      autoExpanded = false
    }
  },
)

async function locatePoint(id: string) {
  if (!mapReady.value) {
    requestSceneFocus(id)
    return
  }
  forceClosePopup()
  // BIM 视频的重新定位/聚合列表也可能来自二维；同步 UI 意图后再交给场景检视。
  if (id.startsWith('bim:') && mapViewMode.value !== '3d')
    mapViewMode.value = '3d'
  const point = allPoints.value.find((p) => p.id === id)
  if (point) {
    const group = layerGroups.find((g) => g.key === point.group)
    if (group) {
      group.on = true
      if (!group.items.includes(point.kind)) group.items.push(point.kind)
    }
  }
  await nextTick()
  if (!disposed) focusDeviceById(id)
}
defineExpose({ locatePoint })
watch(
  [mapReady, sceneFocusRequest],
  ([ready, request]) => {
    if (ready && request) {
      consumeSceneFocus(request.sequence)
      void locatePoint(request.id)
    }
  },
  { immediate: true },
)

function onEscClose(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopResize()
    forceClosePopup()
    expanded.value = false
  }
}

onMounted(() => {
  if (props.resizable) {
    sceneHeight.value = parseFloat(String(props.height || '420')) || 420
  }
  window.addEventListener('keydown', onEscClose)
  void initializeMap()
})

async function initializeMap() {
  mapError.value = ''
  try {
    const route = await loadTunnelRoute()
    if (disposed) return
    routeScreen.value = route.toScreenPercentRoute()
    realityRouteReady.value = routeScreen.value.length >= 2
    await mountMap(basemap.value, mapViewMode.value)
  } catch (error) {
    if (!disposed)
      mapError.value = '场景初始化失败，请检查路线数据、模型资源与 WebGL 支持。'
    console.warn('[tunnel] 场景初始化失败', error)
  }
}

watch(basemap, (mode) => {
  detailVisible.value = false
  closeScenePopup()
  void applyMapBasemap(mode)
})

watch(basemapEnabled, () => applyBasemapEnabled(basemapEnabled.value))

watch(showFullTunnel, (show) => {
  if (mapViewMode.value === '3d') void setFullTunnelVisible(show)
})

watch(showPartialTunnel, (show) => {
  if (mapViewMode.value === '3d') void setPartialTunnelVisible(show)
})

watch(bimBrightness, (v) => setBimBrightness(v))

watch(showTunnelRoute, (v) => setRouteLayerVisible(v))
watch(showFlowAnim, (v) => setFlowAnimationEnabled(v))
watch(showDeviceLayer, (v) => setDeviceLayerVisible(v))
/**
 * 维度切换只由 mapViewMode 单向驱动。
 * 注意：不要再叠加 mapReady 的 watch —— Cesium 场景就绪前后会各触发一次，
 * 导致 morphTo3D 刚执行完又被反向 morph 回去（表现为「切三维没反应」）。
 * setViewMode 内部已按 scene.mode 真实状态去重，并在 viewer 未就绪时记录意图，
 * 待 mount 完成后由其内部竞态保护补应用。
 */
watch(mapViewMode, (mode) => {
  forceClosePopup()
  void setViewMode(mode)
})

watch(
  visiblePoints,
  () => {
    if (
      focusedId.value &&
      !visiblePoints.value.some((p) => p.id === focusedId.value)
    )
      forceClosePopup()
    syncDeviceGraphics()
  },
  { deep: true },
)
watch(roadXray, (value) => setRoadXray(value))

watch(orthophotoAlpha, (v) => {
  setOrthophotoOpacity(v / 100)
})

watch(obliqueAlpha, (v) => {
  setObliqueOpacity(v / 100)
})

watch(bimOpacity, (v) => {
  setBimOpacity(v / 100)
})

watch(partialXray, (v) => {
  if (mapViewMode.value === '3d') setPartialXray(v)
})

watch(sceneEnvironment, (id) => {
  if (mapViewMode.value === '3d') setSceneEnvironment(id)
})

const devicePopupMountRef = ref<HTMLDivElement | null>(null)
let popupChartRaf = 0
watch(
  [() => devicePopupAnchor.value?.device, devicePopupMountRef],
  () => {
    const mount = devicePopupMountRef.value
    cancelAnimationFrame(popupChartRaf)
    if (!mount) return
    disposeMapPopupChart(mount.firstElementChild as HTMLElement | null)
    mount.replaceChildren()
    const anchor = devicePopupAnchor.value
    if (!anchor) return
    const el = buildDevicePopup(anchor.device)
    mount.append(el)
    // 必须等弹窗进入可见 DOM 后再挂图表，否则 ECharts 宽高为 0
    popupChartRaf = requestAnimationFrame(() => {
      if (!disposed && mount.firstElementChild === el) mountMapPopupChart(el)
    })
  },
  { flush: 'post' },
)

function statusTone(
  s: ScenePoint['status'],
): 'ok' | 'warn' | 'alarm' | 'offline' {
  return s
}

function selectPoint(p: ScenePoint) {
  if (props.selectable) {
    emit('select', p)
    return
  }
  focusedId.value = p.id
  detail.value = p
  detailVisible.value = true
}

/* 数值曲线 option */
function historyOption(p: ScenePoint) {
  const h = p.history || []
  return {
    grid: { left: 42, right: 14, top: 16, bottom: 26 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: h.map((x) => x.time),
      axisLabel: { fontSize: 9, color: '#7188a8' },
      axisLine: { lineStyle: { color: 'rgba(78,160,255,0.3)' } },
    },
    yAxis: {
      type: 'value',
      name: p.unit || '',
      nameTextStyle: { fontSize: 9, color: '#7188a8' },
      axisLabel: { fontSize: 9, color: '#7188a8' },
      splitLine: { lineStyle: { color: 'rgba(78,160,255,0.12)' } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        data: h.map((x) => x.value),
        lineStyle: { color: '#4ee6ff', width: 2 },
        itemStyle: { color: '#4ee6ff' },
        areaStyle: { color: 'rgba(78,230,255,0.12)' },
      },
    ],
  }
}
</script>

<style scoped lang="scss">
.resize-handle {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  height: 16px;
  width: 100%;
  background: linear-gradient(180deg, #102335, #0a1928);
  border-top: 1px solid #83aec025;
  cursor: ns-resize;
  touch-action: none;
  outline: none;
  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    height: 1px;
    width: 44px;
    background: linear-gradient(90deg, transparent, #8db3c42c);
  }
  &::before {
    right: calc(50% + 26px);
  }
  &::after {
    left: calc(50% + 26px);
    transform: rotate(180deg);
  }
  .resize-grip {
    width: 32px;
    height: 5px;
    border-top: 1px solid #7fa6b884;
    border-bottom: 1px solid #7fa6b884;
    transition:
      width 0.2s,
      border-color 0.2s;
  }
  &:hover,
  &:focus-visible,
  &.resizing {
    background: #163043;
    .resize-grip {
      width: 42px;
      border-color: #b1d9df;
    }
  }
  &:focus-visible {
    box-shadow: inset 0 0 0 1px #92c6d580;
  }
}
.layer-help {
  font-size: 10px;
  color: #7e9bae;
  line-height: 1.8;
  margin: 13px 0 5px;
}
.layer-count {
  color: #607e93;
  font-size: 10px;
  margin: 0;
}
.layer-retry {
  margin-top: 10px;
  color: #e5b787;
  border: 1px solid #b6844f50;
  background: #795a3017;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
}
.marker-cluster-panel {
  position: absolute;
  z-index: 42;
  top: 18px;
  right: 16px;
  width: min(320px, calc(100% - 32px));
  padding: 14px;
  border: 1px solid #91b8cb3b;
  border-radius: 12px;
  background: #0a1d2fef;
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 35px #0006;
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 11px;
    border-bottom: 1px solid #8cafc51c;
    strong {
      color: #d2e5ee;
      font-size: 13px;
      font-weight: 500;
    }
    small {
      display: block;
      color: #718e9f;
      font-size: 10px;
      margin-top: 5px;
    }
    button {
      background: transparent;
      color: #97b3c6;
      border: 0;
      font-size: 19px;
      cursor: pointer;
    }
  }
  .cluster-member-list {
    max-height: min(280px, 45vh);
    overflow-y: auto;
    scrollbar-width: thin;
    padding-top: 5px;
  }
  .cluster-member {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 10px;
    width: 100%;
    padding: 9px 6px;
    border: none;
    border-bottom: 1px solid #8aaec010;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: #c1d6e3;
    font-size: 11px;
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      grid-column: 1;
      color: #66889b;
      font-size: 9px;
    }
    b {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      color: #90b9c7;
      font-weight: 400;
    }
    &:hover,
    &:focus-visible {
      background: #80b5cd0e;
      color: #e3f5fb;
    }
  }
}
.map-attr-actions {
  border-top: 1px solid #88adc422;
  margin-top: 9px;
  padding-top: 11px;
  button {
    color: #a1c8d5;
    background: #80b6ca0e;
    border: 1px solid #86b0c538;
    border-radius: 5px;
    padding: 7px 10px;
    font-size: 11px;
    cursor: pointer;
  }
}

.tunnel-scene {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0b1a33;
  display: flex;
  flex-direction: column;
  height: v-bind('props.height || "420px"');
}

.tunnel-scene.is-expanded {
  position: fixed !important;
  inset: 0;
  width: 100vw;
  height: 100dvh !important;
  z-index: 2000;
  border-radius: 0;
}
.scene-toolbar {
  position: absolute;
  z-index: 46;
  display: flex;
  align-items: center;
  gap: 5px;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 24px);
  padding: 7px 10px;
  border: 1px solid #91b9da30;
  border-radius: 12px;
  background: linear-gradient(120deg, #0b1e30eb, #071323ed);
  backdrop-filter: blur(18px);
  box-shadow:
    0 8px 32px #0005,
    inset 0 1px #ffffff07;
  .tb-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 8px;
    color: #b2c6da;
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
    &:hover:not(:disabled) {
      background: #ffffff0c;
      color: #f0f9ff;
    }
    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    &--primary {
      background: #5dbcae13;
      border-color: #5dbcae30;
      color: #a5ded5;
    }
    &--primary:hover:not(:disabled),
    &.on {
      background: #5dbcae28;
      color: #d4fff7;
    }
    &--icon {
      padding: 0;
      width: 34px;
    }
  }
  .tb-divider {
    width: 1px;
    height: 20px;
    background: #93b7d325;
    margin: 0 5px;
  }
}
.layer-collapse {
  --el-collapse-border-color: #91b9da1f;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-header-text-color: #aac4da;
  --el-collapse-header-height: 38px;
  .layer-group-name {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    font-size: 12px;
    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }
    small {
      margin-left: auto;
      margin-right: 12px;
      color: #64849f;
    }
  }
  .layer-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
    :deep(.el-switch) {
      margin-right: auto;
    }
  }
  .la-btn {
    padding: 3px 9px;
    color: #a2bfd6;
    border: 1px solid #7ca6c530;
    border-radius: 4px;
    background: #24415a55;
    cursor: pointer;
    font-size: 10px;
  }
}
.layer-group-title small {
  font-size: 10px;
  color: #6d8da6;
  font-weight: 400;
}
.scene-panel-enter-active,
.scene-panel-leave-active {
  transition:
    opacity 0.25s,
    translate 0.25s;
}
.scene-panel-enter-from,
.scene-panel-leave-to {
  opacity: 0;
  translate: 0 10px;
}
@media (max-width: 620px) {
  .scene-toolbar {
    gap: 0;
    padding: 5px;
    bottom: 12px;
    .tb-act {
      padding: 0 9px;
      font-size: 11px;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .scene-panel-enter-active,
  .scene-panel-leave-active {
    transition: none;
  }
}

.scene-viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  perspective: 700px;
  transform-origin: var(--fx, 50%) var(--fy, 50%);
  transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.3, 1);
  /* 点击拉近：场景整体向聚焦点推近放大 */
  &.focused {
    transform: scale(1.45);
    z-index: 30;
  }
  &.map-mode {
    perspective: none;
    &.focused {
      transform: none;
    }
  }
}

.map-loading-mask {
  position: absolute;
  inset: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #b8cbe8;
  font-size: 13px;
  background: rgba(6, 16, 36, 0.82);
  backdrop-filter: blur(4px);
  pointer-events: auto;
  .map-retry {
    color: #b4e6ed;
    border: 1px solid #5b9daf66;
    background: #173449;
    border-radius: 6px;
    padding: 7px 14px;
    cursor: pointer;
  }
  .ml-spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid rgba(78, 160, 255, 0.25);
    border-top-color: #4ee6ff;
    animation: mapSpin 0.9s linear infinite;
  }
}
@keyframes mapSpin {
  to {
    transform: rotate(360deg);
  }
}

.scene-map-root.is-loading {
  opacity: 0;
}

.scene-map-stack {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.map-floating-popup {
  position: absolute;
  z-index: 40;
  pointer-events: auto;
  min-width: 280px;
  width: min(320px, calc(100% - 24px));
  max-height: calc(100% - 90px);
  transform: none;
  &__inner {
    pointer-events: auto;
    position: relative;
    min-width: 0;
    max-height: min(350px, calc(100dvh - 190px));
    overflow: auto;
    scrollbar-width: thin;
    :deep(.pd-chart),
    :deep([data-chart-host]) {
      width: 100% !important;
      min-width: 240px !important;
      height: 200px !important;
    }
  }
  &__x {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 2;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgba(120, 190, 255, 0.55);
    background: rgba(8, 24, 52, 0.95);
    color: #e8f4ff;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    &:hover {
      background: rgba(30, 80, 150, 0.95);
      color: #fff;
    }
  }
}

.model-attr-panel {
  position: absolute;
  top: 52px;
  right: 14px;
  z-index: 42;
  width: min(320px, calc(100% - 28px));
  max-height: min(360px, 56vh);
  // overflow: auto;
  padding: 14px 16px 12px;
  border-radius: 14px;
  background: linear-gradient(
    160deg,
    rgba(10, 28, 58, 0.97),
    rgba(4, 14, 32, 0.94)
  );
  border: 1px solid rgba(103, 232, 249, 0.55);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(34, 211, 238, 0.14),
    0 0 28px rgba(34, 211, 238, 0.2);
  backdrop-filter: blur(14px);
  pointer-events: auto;
  animation: attrPopIn 0.22s ease-out;
  scrollbar-width: thin;

  .map-attr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .map-attr-role {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: var(--rc, #67e8f9);
    background: color-mix(in srgb, var(--rc, #67e8f9) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--rc, #67e8f9) 45%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--rc, #67e8f9) 28%, transparent);
    &-icon {
      font-size: 13px;
      line-height: 1;
    }
  }
  .map-attr-title {
    font-size: 15px;
    font-weight: 700;
    color: #f0f9ff;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(78, 160, 255, 0.16);
    text-shadow: 0 0 14px rgba(34, 211, 238, 0.3);
  }
  .map-attr-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(78, 160, 255, 0.1);
    &:last-child {
      border-bottom: none;
    }
    .k {
      color: #9ec0e8;
      min-width: 78px;
      flex: none;
      padding-top: 1px;
    }
    .v {
      color: #eaf4ff;
      word-break: break-all;
      line-height: 1.5;
    }
  }
}

@keyframes attrPopIn {
  from {
    opacity: 0;
    filter: blur(2px);
  }
  to {
    opacity: 1;
    filter: none;
  }
}

/* Cesium Viewer 容器 */
.scene-map-root {
  position: absolute;
  inset: 0;
  z-index: 0;
  /* Cesium 会自动撑满父容器；这里兜底保证 canvas 铺满 */
  :deep(.cesium-viewer),
  :deep(.cesium-widget),
  :deep(.cesium-widget canvas) {
    width: 100%;
    height: 100%;
    display: block;
  }
  /* 移除 Cesium 自带的版权条样式影响，保持场景干净（版权信息保留在credit 容器） */
  :deep(.cesium-widget-credits) {
    display: none !important;
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 2px,
      rgba(78, 230, 255, 0.025) 2px,
      rgba(78, 230, 255, 0.025) 3px
    );
    mix-blend-mode: soft-light;
  }
  &.dimmed {
    filter: saturate(0.85) brightness(0.88);
  }
}

/* 天地图/高德版权署名：保留但低调，不干扰场景（DOM 由 JS 动态创建，故用 :deep） */
:deep(.tunnel-cesium-credit) {
  position: absolute;
  left: 8px;
  bottom: 6px;
  z-index: 3;
  pointer-events: auto;
  font-size: 10px;
  line-height: 1.2;
  opacity: 0.5;
  a {
    color: #9fc3f0;
  }
  .cesium-credit-expand-link {
    display: none;
  }
}

/* 顶棚（透视收束） */
.ceiling {
  position: absolute;
  left: 50%;
  top: 0;
  width: 100%;
  height: 55%;
  transform: translateX(-50%);
  background:
    radial-gradient(
      ellipse 60% 100% at 50% 0%,
      rgba(120, 160, 230, 0.14),
      transparent 65%
    ),
    linear-gradient(to bottom, #16294d 0%, #0d1c3a 100%);
  clip-path: polygon(28% 0, 72% 0, 58% 100%, 42% 100%);
}
.ceiling::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 46px,
    rgba(255, 236, 160, 0.55) 46px 50px
  );
  clip-path: inherit;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.9) 60%,
    black
  );
}

.wall-l,
.wall-r {
  position: absolute;
  top: 10%;
  bottom: 38%;
  width: 46%;
}
.wall-l {
  left: 0;
  background: linear-gradient(
    to right,
    #1b3057 0%,
    #12234a 70%,
    transparent 100%
  );
  clip-path: polygon(0 0, 78% 8%, 78% 96%, 0 100%);
}
.wall-r {
  right: 0;
  background: linear-gradient(
    to left,
    #1b3057 0%,
    #12234a 70%,
    transparent 100%
  );
  clip-path: polygon(22% 8%, 100% 0, 100% 100%, 22% 96%);
}

.road {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 52%;
  background: linear-gradient(
    to top,
    #101d3a 0%,
    #1a2f5c 30%,
    #24407a 65%,
    #2c4d90 100%
  );
  clip-path: polygon(30% 0, 70% 0, 118% 100%, -18% 100%);
}
.lane-lines {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 4px;
  height: 52%;
  transform: translateX(-50%) rotateX(62deg);
  transform-origin: bottom;
  background: repeating-linear-gradient(
    to top,
    #e8c34a 0 26px,
    transparent 26px 60px
  );
  filter: blur(0.4px);
}

/* 设备点位 */
.dev-point {
  position: absolute;
  z-index: 16;
  transform: translate(-50%, -50%) scale(var(--s, 1));
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition:
    transform 0.2s,
    opacity 0.3s;
  &.no-transition {
    transition:
      opacity 0.25s,
      filter 0.25s;
  }
  &.dim {
    opacity: 0.25;
    filter: grayscale(0.8);
  }
  &:hover {
    transform: translate(-50%, -50%) scale(calc(var(--s, 1) * 1.25));
    z-index: 22;
  }

  /* 拉近聚集：聚焦点位放大居中，其余点位淡出 */
  &.focused {
    z-index: 40;
    transform: translate(-50%, -50%) scale(1.9);
    .dp-icon {
      box-shadow: 0 0 20px 5px rgba(78, 230, 255, 0.75);
      border-color: #4ee6ff;
    }
    .dp-name {
      color: #fff;
      background: rgba(20, 70, 150, 0.95);
    }
    .dp-value {
      color: #4ee6ff;
      background: rgba(20, 70, 150, 0.95);
    }
  }
  &.faded {
    opacity: 0.12;
    filter: grayscale(0.6) blur(0.3px);
    pointer-events: none;
  }

  .dp-icon {
    font-size: 16px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(10, 30, 60, 0.85);
    border: 1.5px solid #3aa1ff;
  }
  .dp-name {
    font-size: 10px;
    color: #e8f4ff;
    background: rgba(8, 22, 44, 0.82);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    border: 1px solid rgba(78, 160, 255, 0.22);
    backdrop-filter: blur(4px);
  }
  .dp-value {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(8, 22, 44, 0.82);
    border: 1px solid rgba(78, 160, 255, 0.15);
  }

  &.ok {
    .dp-icon {
      border-color: #00d26a;
      box-shadow: 0 0 6px rgba(0, 210, 106, 0.5);
    }
    .dp-value {
      color: #35e08c;
    }
  }
  &.warn {
    .dp-icon {
      border-color: #ffb400;
      box-shadow: 0 0 6px rgba(255, 180, 0, 0.5);
    }
    .dp-value {
      color: #ffb400;
    }
  }
  &.offline {
    .dp-icon {
      border-color: #7f95b8;
      filter: grayscale(1);
    }
    .dp-value {
      color: #7f95b8;
    }
  }
  &.alarm {
    .dp-icon {
      border-color: #ff4d4f;
      box-shadow: 0 0 10px rgba(255, 77, 79, 0.8);
    }
    .dp-value {
      color: #ff7a7c;
    }
    .pulse {
      position: absolute;
      top: 0;
      left: 50%;
      width: 26px;
      height: 26px;
      margin-left: -13px;
      border-radius: 50%;
      border: 2px solid #ff4d4f;
      animation: pulse 1.2s ease-out infinite;
    }
  }
}
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}

.map-vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  box-shadow:
    inset 0 0 100px rgba(4, 12, 32, 0.5),
    inset 0 -40px 60px rgba(4, 16, 48, 0.35);
  background:
    radial-gradient(
      ellipse 90% 75% at 50% 48%,
      transparent 50%,
      rgba(4, 14, 36, 0.42) 100%
    ),
    radial-gradient(
      circle at 18% 12%,
      rgba(78, 230, 255, 0.06),
      transparent 42%
    ),
    radial-gradient(
      circle at 82% 78%,
      rgba(16, 185, 129, 0.05),
      transparent 38%
    );
}

.history-chart {
  margin-top: 12px;
  padding: 12px 0 4px;
  border: 1px solid rgba(70, 140, 230, 0.25);
  border-radius: 6px;
  background: rgba(15, 40, 90, 0.35);
  .hc-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: #e8f6ff;
    margin-bottom: 4px;
    padding: 0 12px;
    .hc-unit {
      font-size: 11px;
      color: #7188a8;
      font-weight: 400;
    }
  }
}
</style>
