<template>
  <div class="page-bg">
    <!-- 数据来源角标 -->
    <div class="data-source" :class="source">
      <span class="dot"></span>{{ sourceLabel(source) }} · 视频墙为示例画面，事件与发布数据来自接口
    </div>

    <!-- 视频点位三维落图 -->
    <div class="panel scene-panel">
      <TunnelScene ref="sceneRef" map-mode resizable :points="points" height="360px" />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 视频墙 -->
      <div class="panel">
        <div class="panel-title" style="margin-bottom:4px">视频墙
          <el-radio-group v-model="wallLayout" size="small">
            <el-radio-button :value="4">4 分格</el-radio-button>
            <el-radio-button :value="9">9 分格</el-radio-button>
            <el-radio-button :value="16">16 分格</el-radio-button>
          </el-radio-group>
        </div>
        <p class="panel-sub">聚焦：多路监控同屏研判 · AI 事件高亮（画面为示例，未接入实时视频流）</p>
        <div class="video-wall" :class="'w' + wallLayout">
          <div
            v-for="cam in wallCams"
            :key="cam.id + '-' + wallLayout"
            class="vw-cell"
            :class="{ event: cam.event, locked: cam.locked }"
          >
            <img class="vw-bg" :src="cam.src" :alt="cam.name" loading="lazy" />
            <span class="vw-name">{{ cam.name }}</span>
            <span class="vw-rec">● REC</span>
            <span v-if="cam.locked" class="vw-lock">锁定</span>
            <span v-if="cam.event" class="vw-event">AI事件: {{ cam.eventText }}</span>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <!-- 交通事件（AI识别） -->
        <div class="panel">
          <div class="panel-title">
            交通事件（AI 识别）
            <el-tag size="small" type="warning">待确认 {{ pendingCount }}</el-tag>
          </div>
          <el-table :data="events" size="small" height="180" empty-text="暂无交通事件">
            <el-table-column label="时间" width="76">
              <template #default="{ row }">{{ formatClock(row.detectedAt) }}</template>
            </el-table-column>
            <el-table-column label="事件类型" width="92">
              <template #default="{ row }">
                <el-tag :type="row.level === 'high' ? 'danger' : 'warning'" size="small">
                  {{ EVENT_TYPE_LABEL[row.type] ?? row.type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="stake" label="位置" width="84" />
            <el-table-column label="置信度" width="70">
              <template #default="{ row }">{{ row.confidence }}%</template>
            </el-table-column>
            <el-table-column label="状态" width="76">
              <template #default="{ row }">
                <span :class="row.status === 'pending' ? 'num-orange' : 'num-green'" style="font-size:12px">
                  {{ EVENT_STATUS_LABEL[row.status] ?? row.status }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="locateEvent(row)">定位</el-button>
                <el-button
                  v-if="row.status === 'pending'"
                  link
                  type="success"
                  size="small"
                  @click="confirmEvent(row)"
                >确认</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 交通状态 -->
        <div class="panel">
          <div class="panel-title">
            交通状态
            <span class="panel-extra">主线 {{ mainFlow.toLocaleString() }} 辆/时</span>
          </div>
          <div class="state-row">
            <div class="st-seg" v-for="s in segmentRows" :key="s.code">
              <div class="st-name">{{ s.name }}</div>
              <div class="st-bar" :style="{ background: s.color }"></div>
              <div class="st-flow">{{ s.flowVph }} 辆/时</div>
            </div>
          </div>
          <div class="state-legend">
            <span><i style="background:#00b42a"></i>畅通</span>
            <span><i style="background:#ff7d00"></i>缓行</span>
            <span><i style="background:#f53f3f"></i>拥堵</span>
            <span class="legend-note">断面 {{ segments.length }} 个 · 更新 {{ formatClock(segments[0]?.recordedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 诱导屏及情报板信息编辑发布 -->
    <div class="panel" style="margin-top: 16px">
      <div class="panel-title">诱导屏 / 情报板信息编辑发布</div>
      <div class="publish-wrap">
        <!-- 左侧设备选择 -->
        <div class="pub-devices">
          <div
            v-for="d in boards"
            :key="d.id"
            class="pub-dev"
            :class="{ active: curBoard?.id === d.id }"
            @click="selectBoard(d)"
          >
            <span class="pd-icon">{{ d.type === '诱导屏' ? '🚹' : '🖥️' }}</span>
            <div class="pd-info">
              <div class="pd-name">{{ d.name }}</div>
              <div class="pd-stake">{{ d.stake }} · {{ d.status }}</div>
            </div>
          </div>
          <p v-if="!boards.length" class="panel-sub">暂无诱导屏台账</p>
        </div>

        <!-- 右侧编辑区 -->
        <div class="pub-editor">
          <div class="pe-row">
            <span class="pe-label">显示设备</span>
            <span class="pe-val">{{ curBoard?.name ?? '—' }}（{{ curBoard?.type ?? '—' }}）</span>
            <span class="pe-label" style="margin-left:18px">发布等级</span>
            <el-radio-group v-model="pubLevel" size="small">
              <el-radio-button value="日常">日常</el-radio-button>
              <el-radio-button value="提示">提示</el-radio-button>
              <el-radio-button value="预警">预警</el-radio-button>
            </el-radio-group>
          </div>
          <div class="pe-row" style="margin-top:10px">
            <span class="pe-label">显示内容</span>
            <el-input v-model="pubText" type="textarea" :rows="2" placeholder="请输入诱导屏/情报板显示内容，如：前方 200m 积水，请减速慢行" />
          </div>
          <div class="pe-row" style="margin-top:10px">
            <span class="pe-label">生效时段</span>
            <el-date-picker v-model="pubTime" type="datetimerange" size="small" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 300px" />
            <span class="pe-label" style="margin-left:18px">发布渠道</span>
            <el-checkbox-group v-model="pubChannels" size="small">
              <el-checkbox value="诱导屏" label="诱导屏" />
              <el-checkbox value="情报板" label="情报板" />
              <el-checkbox value="App推送" label="App推送" />
            </el-checkbox-group>
          </div>
          <div class="pe-actions">
            <span class="pe-tip">
              💡 发布需值班长审核：提交后进入「待审核」，审核通过才会下发到屏（当前未接入真实屏控接口）
            </span>
            <div>
              <el-button size="small" :loading="publishing" @click="doPublish">提交审核</el-button>
              <el-button size="small" type="primary" @click="doPublish">提交并审核发布</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 发布记录 -->
      <el-table :data="publishLogs" size="small" style="margin-top:12px" empty-text="暂无发布记录">
        <el-table-column label="发布时间" width="140">
          <template #default="{ row }">{{ formatDateTime(row.publishedAt ?? row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="设备" width="180">
          <template #default="{ row }">{{ row.boardNames?.join('、') || '—' }}</template>
        </el-table-column>
        <el-table-column prop="content" label="发布内容" />
        <el-table-column label="等级" width="70">
          <template #default="{ row }">
            <el-tag :type="row.level === 'warning' ? 'danger' : row.level === 'notice' ? 'warning' : 'primary'" size="small">
              {{ PUBLISH_LEVEL_LABEL[row.level] ?? row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <span :class="row.status === 'published' ? 'num-green' : 'num-orange'" style="font-size:12px">
              {{ PUBLISH_STATUS_LABEL[row.status] ?? row.status }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'published'"
              link
              type="primary"
              size="small"
              @click="offline(row)"
            >下刊</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import TunnelScene from '../components/TunnelScene.vue'
import type { ScenePoint } from '../types/scene'
import { BASE_SCENE_POINTS } from '../config/scenePoints'
import { pickRandomCctvImages } from '../config/cctvGallery'
import { api, ApiError, type CameraItem, type InfoBoardItem, type PublishTask, type TrafficEvent, type TrafficSegment } from '../api/client'
import {
  CONGESTION_COLOR,
  DEMO_SEGMENTS,
  formatClock,
  formatDateTime,
  sourceLabel,
  stakeToLeft,
  type DataSource,
} from '../api/usePageData'

/* ------------------------------ 数据状态 ------------------------------ */

const source = ref<DataSource>('loading')
const segments = ref<TrafficSegment[]>([])
const events = ref<TrafficEvent[]>([])
const cameraRows = ref<CameraItem[]>([])
const boards = ref<InfoBoardItem[]>([])
const publishLogs = ref<PublishTask[]>([])

const EVENT_TYPE_LABEL: Record<string, string> = {
  parking: '违停',
  congestion: '拥堵',
  debris: '抛洒物',
  pedestrian: '行人闯入',
  wrongway: '逆行',
  slow: '低速',
  stop: '异常停车',
  smoke: '烟雾',
}

const EVENT_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  handled: '已处置',
  ignored: '已忽略',
}

const PUBLISH_LEVEL_LABEL: Record<string, string> = {
  normal: '日常',
  notice: '提示',
  warning: '预警',
}

const PUBLISH_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  offline: '已下刊',
  rejected: '已驳回',
}

/** 五档等级：后端 traffic_flow.congestion → 颜色 */
const segmentRows = computed(() =>
  segments.value.map((segment) => ({
    ...segment,
    color: CONGESTION_COLOR[segment.congestion] ?? '#00b42a',
  })),
)

const mainFlow = computed(() => {
  const seg = segments.value.find((s) => s.code === 'SEG-03') ?? segments.value[0]
  return seg?.flowVph ?? 0
})

const pendingCount = computed(() => events.value.filter((e) => e.status === 'pending').length)

async function loadAll() {
  source.value = 'loading'
  const [segmentResult, eventResult, cameraResult, boardResult, taskResult] = await Promise.allSettled([
    api.get<TrafficSegment[]>('/traffic/segments'),
    api.get<{ items: TrafficEvent[] }>('/traffic-events', { pageSize: 8 }),
    api.get<{ items: CameraItem[] }>('/cameras'),
    api.get<InfoBoardItem[]>('/info-boards'),
    api.get<{ items: PublishTask[] }>('/publish-tasks', { pageSize: 6 }),
  ])

  if (segmentResult.status === 'fulfilled') segments.value = segmentResult.value
  else segments.value = DEMO_SEGMENTS

  if (eventResult.status === 'fulfilled') events.value = eventResult.value.items
  else events.value = []

  cameraRows.value = cameraResult.status === 'fulfilled' ? cameraResult.value.items : []
  boards.value = boardResult.status === 'fulfilled' ? boardResult.value : []
  publishLogs.value = taskResult.status === 'fulfilled' ? taskResult.value.items : []

  if (curBoard.value == null && boards.value.length) curBoard.value = boards.value[0]

  source.value =
    segmentResult.status === 'fulfilled' && eventResult.status === 'fulfilled' ? 'api' : 'demo'
}

onMounted(loadAll)

/* ------------------------------ 三维点位 ------------------------------ */

const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const FALLBACK_THUMB = '/img/cctv-placeholder.svg'

/** 摄像机 / 情报板台账落到场景：桩号 → 画面横向位置由后端下发的 left/top 兜底为空时按桩号映射 */
const points = computed<ScenePoint[]>(() => {
  const cameraPoints: ScenePoint[] = cameraRows.value.map((cam, index) => ({
    id: cam.pointId ?? cam.code,
    name: cam.name,
    kind: cam.type === 'ptz' ? 'dome' : 'camera',
    group: 'traffic',
    status: cam.status === 'alarm' ? 'alarm' : cam.status === 'offline' ? 'offline' : 'ok',
    left: `${stakeToLeft(cam.stake, 8 + index * 14)}%`,
    top: `${24 + (index % 3) * 6}%`,
    leftNum: stakeToLeft(cam.stake, 8 + index * 14),
    scale: 0.95,
    stake: cam.stake ?? '—',
    value: cam.status === 'alarm' ? 'AI 事件' : cam.status === 'offline' ? '离线' : '在线',
    alarm: cam.status === 'alarm' ? 'AI 识别事件待确认' : undefined,
  }))
  const boardPoints: ScenePoint[] = boards.value.map((board, index) => ({
    id: board.pointId ?? board.code,
    name: board.name,
    kind: 'infoBoard',
    group: 'traffic',
    status: board.status === 'offline' ? 'offline' : 'ok',
    left: `${stakeToLeft(board.stake, 16 + index * 16)}%`,
    top: '64%',
    leftNum: stakeToLeft(board.stake, 16 + index * 16),
    scale: 0.85,
    stake: board.stake ?? '—',
    value: board.content || (board.status === 'offline' ? '离线' : '在线'),
  }))
  const merged = [...cameraPoints, ...boardPoints]
  if (merged.length) return merged
  // 后端不可用时回落到总览目录中的交通类点位，场景不至于空白
  return BASE_SCENE_POINTS.filter((point) => point.group === 'traffic')
})

/* ------------------------------ 视频墙 ------------------------------ */

const wallLayout = ref(9)
const wallSeed = ref(Date.now())

const wallCams = computed(() => {
  // 有摄像机台账时按台账顺序铺画面（画面本身仍是示例媒体）
  if (cameraRows.value.length) {
    const list = cameraRows.value
    return Array.from({ length: wallLayout.value }, (_, i) => {
      const cam = list[i % list.length]
      const event = cam.status === 'alarm'
      return {
        id: `${cam.code}-${i}`,
        src: cam.previewUrl ?? FALLBACK_THUMB,
        name: `${cam.code.replace('CAM-', '')} · ${cam.stake ?? '—'}`,
        locked: i === 0,
        event,
        eventText: event ? '异常事件' : '',
      }
    })
  }
  const imgs = pickRandomCctvImages(wallLayout.value, wallSeed.value)
  return imgs.map((src, i) => ({
    id: `cam-${i}`,
    src,
    name: `C${String(i + 1).padStart(2, '0')} · K2+${100 + (i + 1) * 50}`,
    locked: i === 0,
    event: false,
    eventText: '',
  }))
})

watch(wallLayout, () => {
  wallSeed.value = Date.now()
})

/* ------------------------------ 事件操作 ------------------------------ */

function locateEvent(event: TrafficEvent) {
  const target = points.value.find((point, index) => cameraRows.value[index]?.id === event.cameraId)
  if (target) sceneRef.value?.locatePoint(target.id)
  else if (points.value.length) sceneRef.value?.locatePoint(points.value[0].id)
}

async function confirmEvent(event: TrafficEvent) {
  try {
    await api.patch(`/traffic-events/${event.id}`, { status: 'confirmed', remark: '大屏人工确认' })
    ElMessage.success('事件已确认')
    const result = await api.get<{ items: TrafficEvent[] }>('/traffic-events', { pageSize: 8 })
    events.value = result.items
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '确认失败，请检查登录状态')
  }
}

/* ------------------------------ 发布 ------------------------------ */

const curBoard = ref<InfoBoardItem | null>(null)
const pubLevel = ref<'日常' | '提示' | '预警'>('提示')
const pubText = ref('')
const pubTime = ref<[Date, Date] | null>(null)
const pubChannels = ref<string[]>(['诱导屏'])
const publishing = ref(false)

const LEVEL_TO_API: Record<string, string> = { 日常: 'normal', 提示: 'notice', 预警: 'warning' }

function selectBoard(board: InfoBoardItem) {
  curBoard.value = board
}

async function doPublish() {
  if (!curBoard.value) {
    ElMessage.warning('请先选择显示设备')
    return
  }
  if (!pubText.value.trim()) {
    ElMessage.warning('请输入显示内容')
    return
  }
  publishing.value = true
  try {
    const created = await api.post<PublishTask>('/publish-tasks', {
      title: `大屏发布：${curBoard.value.name}`,
      content: pubText.value.trim(),
      level: LEVEL_TO_API[pubLevel.value] ?? 'notice',
      channels: pubChannels.value,
      boardIds: [curBoard.value.id],
      scheduledStart: pubTime.value?.[0]?.toISOString() ?? null,
      scheduledEnd: pubTime.value?.[1]?.toISOString() ?? null,
    })
    ElMessage.success(`已提交 ${created.taskNo}，等待值班长审核`)
    pubText.value = ''
    const result = await api.get<{ items: PublishTask[] }>('/publish-tasks', { pageSize: 6 })
    publishLogs.value = result.items
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '提交失败'
    ElMessage.error(
      error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? `${message}（请先用值班长及以上账号登录）`
        : message,
    )
  } finally {
    publishing.value = false
  }
}

async function offline(task: PublishTask) {
  try {
    await api.post(`/publish-tasks/${task.id}/offline`, {})
    ElMessage.success('已下刊')
    const result = await api.get<{ items: PublishTask[] }>('/publish-tasks', { pageSize: 6 })
    publishLogs.value = result.items
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '下刊失败')
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

.video-wall {
  display: grid; gap: 6px;
  &.w4 { grid-template-columns: repeat(2, 1fr); }
  &.w9 { grid-template-columns: repeat(3, 1fr); }
  &.w16 { grid-template-columns: repeat(4, 1fr); }
}
.vw-cell {
  position: relative; aspect-ratio: 16/9; border-radius: 5px; overflow: hidden;
  background: #0b1220;
  border: 1px solid rgba(100, 160, 220, 0.4);
  .vw-bg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; opacity: 0.92; pointer-events: none;
  }
  .vw-name {
    position: absolute; left: 6px; bottom: 5px; z-index: 2;
    font-size: 11px; font-weight: 700; color: #f0f7ff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  }
  .vw-rec {
    position: absolute; top: 5px; left: 6px; z-index: 2;
    font-size: 10px; font-weight: 800; color: #fff;
    background: rgba(220, 38, 38, 0.9); padding: 1px 6px; border-radius: 3px;
  }
  .vw-lock {
    position: absolute; top: 5px; right: 6px; z-index: 2;
    font-size: 10px; font-weight: 700; color: #041018;
    background: #67e8f9; padding: 1px 6px; border-radius: 3px;
  }
  &.locked { border-color: #22d3ee; box-shadow: 0 0 10px rgba(34, 211, 238, 0.35); }
  &.event { border-color: #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.45); }
  .vw-event {
    position: absolute; right: 6px; bottom: 5px; z-index: 2;
    font-size: 11px; font-weight: 700; color: #fff;
    background: #ef4444; padding: 1px 6px; border-radius: 3px;
  }
}

.state-row { display: flex; gap: 6px; }
.st-seg { flex: 1; text-align: center; }
.st-name { font-size: 10px; color: #7188a8; margin-bottom: 4px; }
.st-bar { height: 10px; border-radius: 3px; }
.st-flow { font-size: 10px; color: #aebcd8; margin-top: 3px; }
.state-legend {
  display: flex; gap: 14px; justify-content: center; margin-top: 8px;
  font-size: 11px; color: #aebcd8;
  span { display: flex; align-items: center; gap: 4px; }
  i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .legend-note { color: #7188a8; }
}

/* 编辑发布模块 */
.publish-wrap { display: flex; gap: 14px; }
.pub-devices {
  width: 240px; flex: none;
  display: flex; flex-direction: column; gap: 8px;
}
.pub-dev {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(70, 140, 230, 0.25);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { background: rgba(40, 90, 180, 0.3); }
  &.active {
    border-color: #4ee6ff;
    background: rgba(40, 100, 200, 0.4);
    box-shadow: 0 0 10px rgba(78, 230, 255, 0.3);
  }
  .pd-icon { font-size: 18px; }
  .pd-name { font-size: 13px; color: #e8f6ff; }
  .pd-stake { font-size: 11px; color: #7188a8; }
}
.pub-editor {
  flex: 1;
  border: 1px solid rgba(70, 140, 230, 0.25);
  border-radius: 6px;
  padding: 12px;
}
.pe-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pe-label { font-size: 12px; color: #7188a8; }
.pe-val { font-size: 13px; color: #e8f6ff; }
.pe-actions {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px;
  .pe-tip { font-size: 11px; color: #ffb400; }
}
</style>
