<template>
  <div class="page-bg">
    <!-- 视频点位三维落图 -->
    <div class="panel scene-panel">
      <TunnelScene map-mode resizable :points="points" height="360px" />
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
        <p class="panel-sub">聚焦：多路监控同屏研判 · AI 事件高亮</p>
        <div class="video-wall" :class="'w' + wallLayout">
          <div
            v-for="cam in wallCams"
            :key="cam.id + '-' + wallLayout"
            class="vw-cell"
            :class="{ event: cam.event, locked: cam.locked }"
          >
            <img class="vw-bg" :src="cam.src" alt="" loading="lazy" />
            <span class="vw-name">{{ cam.name }}</span>
            <span class="vw-rec">● REC</span>
            <span v-if="cam.locked" class="vw-lock">锁定</span>
            <span v-if="cam.event" class="vw-event">AI事件: 违停</span>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <!-- 交通事件（AI识别） -->
        <div class="panel">
          <div class="panel-title">交通事件（AI 识别）</div>
          <el-table :data="events" size="small" height="180">
            <el-table-column prop="time" label="时间" width="72" />
            <el-table-column prop="type" label="事件类型" width="90">
              <template #default="{ row }">
                <el-tag :type="row.level === '高' ? 'danger' : 'warning'" size="small">{{ row.type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="stake" label="位置" width="84" />
            <el-table-column prop="conf" label="置信度" width="70" />
            <el-table-column prop="status" label="状态" width="70">
              <template #default="{ row }">
                <span :class="row.status === '待确认' ? 'num-orange' : 'num-green'" style="font-size:12px">{{ row.status }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作">
              <template #default>
                <el-button link type="primary" size="small">定位</el-button>
                <el-button link type="success" size="small">确认</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 交通状态 -->
        <div class="panel">
          <div class="panel-title">交通状态</div>
          <div class="state-row">
            <div class="st-seg" v-for="s in segments" :key="s.name">
              <div class="st-name">{{ s.name }}</div>
              <div class="st-bar" :style="{ background: s.color }"></div>
              <div class="st-flow">{{ s.flow }} 辆/时</div>
            </div>
          </div>
          <div class="state-legend">
            <span><i style="background:#00b42a"></i>畅通</span>
            <span><i style="background:#ff7d00"></i>缓行</span>
            <span><i style="background:#f53f3f"></i>拥堵</span>
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
        </div>

        <!-- 右侧编辑区 -->
        <div class="pub-editor">
          <div class="pe-row">
            <span class="pe-label">显示设备</span>
            <span class="pe-val">{{ curBoard?.name }}（{{ curBoard?.type }}）</span>
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
            <span class="pe-tip">💡 支持文字模板、多屏批量发布、定时发布，发布前需值班长审核</span>
            <div>
              <el-button size="small">保存草稿</el-button>
              <el-button size="small" type="primary" @click="doPublish">审核并发布</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 发布记录 -->
      <el-table :data="publishLogs" size="small" style="margin-top:12px">
        <el-table-column prop="time" label="发布时间" width="140" />
        <el-table-column prop="device" label="设备" width="160" />
        <el-table-column prop="content" label="发布内容" />
        <el-table-column prop="level" label="等级" width="70">
          <template #default="{ row }">
            <el-tag :type="row.level === '预警' ? 'danger' : row.level === '提示' ? 'warning' : 'primary'" size="small">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <span :class="row.status === '已发布' ? 'num-green' : 'num-orange'" style="font-size:12px">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default><el-button link type="primary" size="small">下刊</el-button></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'
import { pickRandomCctvImages } from '../config/cctvGallery'

const wallLayout = ref(9)
const wallSeed = ref(Date.now())

const wallCams = computed(() => {
  const imgs = pickRandomCctvImages(wallLayout.value, wallSeed.value)
  return imgs.map((src, i) => ({
    id: `cam-${i}`,
    src,
    name: `C${String(i + 1).padStart(2, '0')} · K2+${100 + (i + 1) * 50}`,
    locked: i === 0,
    event: i === 4
  }))
})

watch(wallLayout, () => {
  wallSeed.value = Date.now()
})

const points: ScenePoint[] = [
  { id: 'c1', name: '流量摄像机 K2+150', kind: 'camera', group: 'traffic', status: 'ok', left: '14%', top: '32%', leftNum: 14, scale: 1.1, stake: 'K2+150', value: '在线' },
  { id: 'c2', name: '违法摄像机 K2+600', kind: 'camera', group: 'traffic', status: 'ok', left: '32%', top: '28%', leftNum: 32, scale: 1, stake: 'K2+600', value: '在线' },
  { id: 'c3', name: '违法摄像机 K3+050', kind: 'camera', group: 'traffic', status: 'alarm', left: '50%', top: '24%', leftNum: 50, scale: 0.95, stake: 'K3+050', value: '违停事件', alarm: 'AI识别：机动车违停' },
  { id: 'c4', name: '流量摄像机 K3+500', kind: 'camera', group: 'traffic', status: 'ok', left: '68%', top: '28%', leftNum: 68, scale: 0.85, stake: 'K3+500', value: '在线' },
  { id: 'c5', name: '流量摄像机 K4+100', kind: 'camera', group: 'traffic', status: 'offline', left: '84%', top: '34%', leftNum: 84, scale: 0.75, stake: 'K4+100', value: '离线' },
  { id: 'sc1', name: '诱导屏 K2+400', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '24%', top: '62%', leftNum: 24, scale: 1, stake: 'K2+400', value: '前方畅通' },
  { id: 'sc2', name: '诱导屏 K3+700', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '72%', top: '64%', leftNum: 72, scale: 0.8, stake: 'K3+700', value: '限速 40' },
  { id: 'ib1', name: '情报板 K3+000', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '48%', top: '60%', leftNum: 48, scale: 0.85, stake: 'K3+000', value: '气象提示' },
  { id: 'ib2', name: '情报板 K4+000', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '80%', top: '62%', leftNum: 80, scale: 0.75, stake: 'K4+000', value: '限速 40' }
]

const events = [
  { time: '14:05', type: '违停', level: '高', stake: 'K3+050', conf: '96%', status: '待确认' },
  { time: '13:40', type: '拥堵', level: '中', stake: 'K3+400', conf: '91%', status: '已确认' },
  { time: '12:58', type: '抛洒物', level: '中', stake: 'K2+800', conf: '88%', status: '已处置' },
  { time: '11:22', type: '行人闯入', level: '高', stake: 'K4+200', conf: '94%', status: '已处置' },
  { time: '10:47', type: '逆行', level: '高', stake: 'K2+300', conf: '89%', status: '已处置' }
]

const segments = [
  { name: 'K2+100~K2+600', color: '#00b42a', flow: 1420 },
  { name: 'K2+600~K3+100', color: '#00b42a', flow: 1380 },
  { name: 'K3+100~K3+600', color: '#ff7d00', flow: 1860 },
  { name: 'K3+600~K4+100', color: '#f53f3f', flow: 2100 },
  { name: 'K4+100~K4+300', color: '#00b42a', flow: 1150 }
]

/* 诱导屏/情报板编辑发布 */
const boards = [
  { id: 'b1', name: '诱导屏 K2+400', type: '诱导屏', stake: 'K2+400', status: '在线' },
  { id: 'b2', name: '诱导屏 K3+700', type: '诱导屏', stake: 'K3+700', status: '在线' },
  { id: 'b3', name: '情报板 K3+000', type: '情报板', stake: 'K3+000', status: '在线' },
  { id: 'b4', name: '情报板 K4+000', type: '情报板', stake: 'K4+000', status: '在线' }
]
const curBoard = ref(boards[0])
const pubLevel = ref('提示')
const pubText = ref('')
const pubTime = ref<[Date, Date] | null>(null)
const pubChannels = ref(['诱导屏'])
const publishLogs = reactive([
  { time: '2026-10-18 16:20', device: '诱导屏 K2+400', content: '前方 200m 积水，请减速慢行', level: '预警', status: '已发布' },
  { time: '2026-10-18 15:40', device: '情报板 K3+000', content: '雨天路滑，注意车距', level: '提示', status: '已发布' },
  { time: '2026-10-18 10:05', device: '诱导屏 K3+700', content: '前方畅通，限速 60', level: '日常', status: '已发布' },
  { time: '2026-10-17 21:30', device: '情报板 K4+000', content: '夜间养护施工，临时占用左道', level: '提示', status: '待审核' }
])

function selectBoard(d: any) {
  curBoard.value = d
}
function doPublish() {
  if (!pubText.value) { ElMessage.warning('请输入显示内容'); return }
  publishLogs.unshift({
    time: '2026-10-18 17:00',
    device: curBoard.value!.name,
    content: pubText.value,
    level: pubLevel.value,
    status: '待审核'
  })
  ElMessage.success('已提交审核，待值班长审核后发布')
  pubText.value = ''
}
</script>

<style scoped lang="scss">
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
  padding: 12px 14px;
  background: rgba(15, 40, 90, 0.35);
}
.pe-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pe-label { font-size: 13px; color: #9fc3f0; flex: none; }
.pe-val { font-size: 13px; color: #e8f6ff; font-weight: 600; }
.pe-actions {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px;
  .pe-tip { font-size: 12px; color: #7188a8; }
}
</style>
