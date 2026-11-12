<template>
  <div class="page-bg">
    <div class="data-source" :class="source">
      <span class="dot"></span>{{ sourceLabel(source) }} · 反馈、预警与安全教育来自服务库
    </div>

    <!-- 投诉信息点位三维场景 -->
    <div class="panel scene-panel">
      <TunnelScene
        ref="sceneRef"
        map-mode
        resizable
        :min-height="200"
        :points="complaintPoints"
        height="280px"
      />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 公众病害反馈 -->
      <div class="panel">
        <div class="panel-title">
          公众病害反馈
          <el-button size="small" type="primary" plain style="margin-left:auto" :loading="loading" @click="loadAll">刷新</el-button>
        </div>
        <div class="fb-stats">
          <div class="fb-item"><b class="num-blue">{{ feedbackStats.today }}</b><span>今日上报</span></div>
          <div class="fb-item"><b class="num-orange">{{ feedbackStats.pending }}</b><span>待审核</span></div>
          <div class="fb-item"><b class="num-green">{{ feedbackStats.converted }}</b><span>已转工单</span></div>
          <div class="fb-item"><b class="num-green">{{ feedbackStats.invalid }}</b><span>无效反馈</span></div>
        </div>
        <el-table :data="feedbacks" size="small" height="210" empty-text="暂无公众反馈">
          <el-table-column label="时间" width="72">
            <template #default="{ row }">{{ formatClock(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="渠道" width="72">
            <template #default="{ row }">{{ CHANNEL_LABEL[row.channel] ?? row.channel }}</template>
          </el-table-column>
          <el-table-column prop="content" label="反馈内容" />
          <el-table-column prop="stake" label="位置" width="80" />
          <el-table-column label="状态" width="86">
            <template #default="{ row }">
              <el-tag :type="FEEDBACK_TYPE[row.status] ?? 'info'" size="small">
                {{ FEEDBACK_LABEL[row.status] ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="64">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'pending'"
                link
                type="primary"
                size="small"
                @click="review(row)"
              >审核</el-button>
              <span v-else class="ch">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 预警信息发布 -->
      <div class="panel">
        <div class="panel-title">预警信息发布
          <el-button size="small" type="primary" style="margin-left:auto" @click="noticeVisible = true">新建发布</el-button>
        </div>
        <el-table :data="publishes" size="small" height="260" empty-text="暂无对外预警">
          <el-table-column label="发布时间" width="106">
            <template #default="{ row }">{{ formatDateTime(row.publishedAt) }}</template>
          </el-table-column>
          <el-table-column prop="title" label="信息标题" />
          <el-table-column label="级别" width="64">
            <template #default="{ row }">
              <el-tag :type="NOTICE_TYPE[row.level] ?? 'info'" size="small">{{ NOTICE_LABEL[row.level] ?? row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="发布渠道" width="150">
            <template #default="{ row }">
              <span class="ch">{{ (row.channels ?? []).join(' / ') || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="触达" width="64">
            <template #default="{ row }">{{ formatReach(row.reachCount) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 安全知识教育 -->
    <div class="grid-3" style="margin-top: 16px">
      <div class="panel">
        <div class="panel-title">安全知识教育</div>
        <div class="edu-list">
          <div class="edu-item" v-for="e in eduItems" :key="e.id" @click="openArticle(e)">
            <span class="edu-icon">{{ e.icon ?? '📘' }}</span>
            <div class="edu-body">
              <div class="edu-title">{{ e.title }}</div>
              <div class="edu-meta">{{ e.views }} 次浏览 · {{ (e.publishedAt ?? '').slice(0, 10) }}</div>
            </div>
          </div>
        </div>
        <el-button size="small" type="primary" plain style="width:100%; margin-top:8px" @click="openArticle(eduItems[0])">
          进入安全教育专区
        </el-button>
      </div>
    </div>

    <!-- 新建预警 -->
    <el-dialog v-model="noticeVisible" title="新建对外预警" width="460px">
      <el-form label-width="72px">
        <el-form-item label="标题">
          <el-input v-model="noticeForm.title" placeholder="如：强降雨注意隧道积水" />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="noticeForm.level" style="width: 100%">
            <el-option label="红色（紧急）" value="red" />
            <el-option label="黄色（预警）" value="yellow" />
            <el-option label="蓝色（提示）" value="blue" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <el-checkbox-group v-model="noticeForm.channels">
            <el-checkbox value="App推送" label="App推送" />
            <el-checkbox value="诱导屏" label="诱导屏" />
            <el-checkbox value="广播" label="广播" />
            <el-checkbox value="公告" label="公告" />
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="noticeVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="submitting" @click="submitNotice">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TunnelScene from '../components/TunnelScene.vue'
import type { ScenePoint } from '../types/scene'
import {
  api,
  ApiError,
  type DashboardSummary,
  type Feedback,
  type PublicNotice,
  type SafetyArticle,
} from '../api/client'
import {
  DEMO_FEEDBACK,
  DEMO_NOTICES,
  formatClock,
  formatDateTime,
  sourceLabel,
  stakeToLeft,
  type DataSource,
} from '../api/usePageData'

const source = ref<DataSource>('loading')
const loading = ref(false)
const sceneRef = ref<InstanceType<typeof TunnelScene>>()

const feedbacks = ref<Feedback[]>([])
const publishes = ref<PublicNotice[]>([])
const eduItems = ref<SafetyArticle[]>([])
const publicService = ref<DashboardSummary['publicService'] | null>(null)

const CHANNEL_LABEL: Record<string, string> = {
  miniapp: '小程序',
  hotline: '热线',
  web: '网页',
  wechat: '微信',
  app: 'App',
}

const FEEDBACK_LABEL: Record<string, string> = {
  pending: '待审核',
  reviewed: '已审核',
  converted: '已转工单',
  invalid: '无效反馈',
  closed: '已关闭',
}

const FEEDBACK_TYPE: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'primary'> = {
  pending: 'warning',
  reviewed: 'primary',
  converted: 'success',
  invalid: 'danger',
  closed: 'info',
}

const NOTICE_LABEL: Record<string, string> = { red: '红色', yellow: '黄色', blue: '蓝色' }
const NOTICE_TYPE: Record<string, 'danger' | 'warning' | 'primary'> = { red: 'danger', yellow: 'warning', blue: 'primary' }

async function loadAll() {
  loading.value = true
  source.value = 'loading'
  const [feedbackResult, noticeResult, articleResult, summaryResult] = await Promise.allSettled([
    api.get<{ items: Feedback[] }>('/feedback', { pageSize: 10 }),
    api.get<{ items: PublicNotice[] }>('/public-notices', { pageSize: 8 }),
    api.get<SafetyArticle[]>('/safety-articles'),
    api.get<DashboardSummary>('/dashboard/summary'),
  ])
  feedbacks.value = feedbackResult.status === 'fulfilled' ? feedbackResult.value.items : DEMO_FEEDBACK
  publishes.value = noticeResult.status === 'fulfilled' ? noticeResult.value.items : DEMO_NOTICES
  eduItems.value = articleResult.status === 'fulfilled' ? articleResult.value : []
  publicService.value = summaryResult.status === 'fulfilled' ? summaryResult.value.publicService : null
  source.value = feedbackResult.status === 'fulfilled' ? 'api' : 'demo'
  loading.value = false
}

onMounted(loadAll)

/* ------------------------------ 统计 ------------------------------ */

const feedbackStats = computed(() => {
  const list = feedbacks.value
  const today = new Date().toDateString()
  return {
    today: list.filter((item) => new Date(item.createdAt).toDateString() === today).length || list.length,
    pending: list.filter((item) => item.status === 'pending').length,
    converted: list.filter((item) => item.status === 'converted').length,
    invalid: list.filter((item) => item.status === 'invalid').length,
  }
})

/* ------------------------------ 三维点位 ------------------------------ */

const complaintPoints = computed<ScenePoint[]>(() => {
  const list = feedbacks.value.filter((item) => item.id > 0)
  const sourceList = list.length ? list : DEMO_FEEDBACK
  return sourceList
    .filter((item) => item.stake)
    .map((item, index) => {
      const leftNum = stakeToLeft(item.stake, 16 + index * 15)
      return {
        id: `feedback:${item.id}`,
        name: `${CHANNEL_LABEL[item.channel] ?? item.channel} ${item.stake ?? ''}`.trim(),
        kind: 'complaint' as const,
        group: 'monitor' as const,
        status: item.status === 'pending' ? 'alarm' : item.status === 'invalid' ? 'offline' : 'warn',
        left: `${leftNum}%`,
        top: `${40 + (index % 3) * 12}%`,
        leftNum,
        scale: item.status === 'pending' ? 1.05 : 0.9,
        stake: item.stake ?? '—',
        value: FEEDBACK_LABEL[item.status] ?? item.status,
        alarm: item.content,
        inspect: item.createdAt?.slice(0, 10),
      }
    })
})

/* ------------------------------ 反馈审核 ------------------------------ */

async function review(feedback: Feedback) {
  try {
    const { value } = await ElMessageBox.prompt('审核说明（可不填），确认后将转为养护工单', '审核公众反馈', {
      confirmButtonText: '有效并转工单',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：现场核实属实',
    })
    await api.post(`/feedback/${feedback.id}/review`, {
      decision: 'valid',
      convertToOrder: true,
      remark: value || '大屏审核通过',
    })
    ElMessage.success('已审核并生成工单')
    await loadAll()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(
      error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? `${error.message}（请先用运维工程师及以上账号登录）`
        : error instanceof ApiError ? error.message : '审核失败',
    )
  }
}

/* ------------------------------ 预警发布 ------------------------------ */

const noticeVisible = ref(false)
const submitting = ref(false)
const noticeForm = ref({ title: '', level: 'yellow', channels: ['App推送'] })

async function submitNotice() {
  if (!noticeForm.value.title.trim()) {
    ElMessage.warning('请输入预警标题')
    return
  }
  submitting.value = true
  try {
    await api.post('/public-notices', {
      title: noticeForm.value.title.trim(),
      level: noticeForm.value.level,
      channels: noticeForm.value.channels,
    })
    ElMessage.success('预警已发布')
    noticeVisible.value = false
    noticeForm.value = { title: '', level: 'yellow', channels: ['App推送'] }
    await loadAll()
  } catch (error) {
    ElMessage.error(
      error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? `${error.message}（发布对外预警需值班长及以上角色）`
        : error instanceof ApiError ? error.message : '发布失败',
    )
  } finally {
    submitting.value = false
  }
}

function formatReach(value?: number | null) {
  if (!value) return '—'
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value)
}

/* ------------------------------ 安全知识 ------------------------------ */

async function openArticle(article?: SafetyArticle) {
  if (!article) return
  try {
    // 详情接口会累加浏览量，同时取回正文
    const detail = await api.get<SafetyArticle & { content?: string }>(`/safety-articles/${article.id}`)
    await ElMessageBox.alert(detail.content || detail.summary || '暂无正文', detail.title, {
      confirmButtonText: '我知道了',
    })
    await loadAll()
  } catch {
    ElMessage.info(article.summary || article.title)
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

.scene-panel { padding: 0; overflow: hidden; }

.fb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
.fb-item {
  text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 6px; padding: 8px 0;
  b { display: block; font-size: 20px; }
  span { font-size: 11px; color: #7188a8; }
}
.ch { font-size: 11px; color: #aebcd8; }

.edu-list { display: flex; flex-direction: column; gap: 8px; }
.edu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; background: rgba(20, 48, 98, 0.4); border-radius: 6px;
  cursor: pointer; transition: all 0.2s;
  &:hover { background: rgba(40, 90, 180, 0.35); }
  .edu-icon { font-size: 18px; }
  .edu-title { font-size: 13px; color: #e8f6ff; }
  .edu-meta { font-size: 10px; color: #7188a8; margin-top: 2px; }
}
</style>
