<template>
  <div class="shell">
    <!-- 顶部大屏标题栏 -->
    <header class="topbar">
      <!-- 左侧导航：前四个模块 -->
      <nav class="tb-nav nav-left">
        <div
          v-for="m in menus.slice(0, 4)"
          :key="m.path"
          class="nav-item"
          :class="{ active: route.path === m.path }"
          @click="router.push(m.path)"
        >
          <span class="nav-icon">{{ m.icon }}</span>
          <span>{{ m.label }}</span>
          <span v-if="m.badge" class="nav-badge">{{ m.badge }}</span>
        </div>
      </nav>

      <!-- 中央标题 -->
      <div class="title-block">
        <div class="sys-name">两湖隧道（南湖段）智能运维管理平台</div>
      </div>

      <!-- 右侧导航：后三个模块 -->
      <nav class="tb-nav nav-right">
        <div
          v-for="m in menus.slice(4)"
          :key="m.path"
          class="nav-item"
          :class="{ active: route.path === m.path }"
          @click="router.push(m.path)"
        >
          <span class="nav-icon">{{ m.icon }}</span>
          <span>{{ m.label }}</span>
          <span v-if="m.badge" class="nav-badge">{{ m.badge }}</span>
        </div>
      </nav>

      <!-- 右侧工具 -->
      <div class="tb-tools">
        <span class="datetime">{{ nowStr }}</span>
        <el-badge v-if="alertCount" :value="alertCount" class="alarm-badge">
          <el-button
            size="small"
            circle
            class="bell-btn"
            aria-label="定位重点告警"
            @click="focusFirstAlert"
            ><el-icon><Bell /></el-icon
          ></el-button>
        </el-badge>
        <span v-if="user" class="user-chip">
          <b>{{ user.displayName }}</b><i>{{ user.roleLabel }}</i>
          <button type="button" class="link-btn" @click="logout">退出</button>
        </span>
        <el-button v-else size="small" type="primary" plain @click="loginVisible = true">登录</el-button>
      </div>
    </header>

    <AlertTicker
      v-if="['/overview', '/emergency', '/monitoring'].includes(route.path)"
      :items="tickerAlerts"
      @locate="focusAlert($event)"
    />

    <!-- 主内容（全屏场景） -->
    <main class="main">
      <router-view />
    </main>
  </div>

  <VideoPreviewDialog />
  <LoginDialog v-model="loginVisible" @success="onLogin" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell } from '@element-plus/icons-vue'
import VideoPreviewDialog from './components/VideoPreviewDialog.vue'
import LoginDialog from './components/LoginDialog.vue'
import { requestSceneFocus } from './composables/useSceneNavigation'
import AlertTicker from './components/AlertTicker.vue'
import { DEMO_ALERTS, type TunnelAlert } from './config/alerts'
import { api, clearSession, getStoredUser, type AlertItem, type AuthUser, type ModuleEntry } from './api/client'
import { alertToPanelAlert } from './api/usePageData'

const route = useRoute()
const router = useRouter()

/** 模块角标由后端 /dashboard/modules 下发；接口不可用时回落到本地占位 */
const FALLBACK_MENUS = [
  { path: '/overview', label: '总览', icon: '🏠', badge: '' },
  { path: '/traffic', label: '智能交通', icon: '🚦', badge: '' },
  { path: '/maintenance', label: '智慧养护', icon: '🛠️', badge: '' },
  { path: '/monitoring', label: '智慧监测', icon: '📡', badge: '' },
  { path: '/emergency', label: '数字应急', icon: '🚨', badge: '' },
  { path: '/service', label: '数字服务', icon: '📱', badge: '' },
  { path: '/asset', label: '资产资料中心', icon: '📚', badge: '' },
]

const menus = ref(FALLBACK_MENUS)

const activeAlerts = ref<AlertItem[]>([])
const user = ref<AuthUser | null>(getStoredUser())
const loginVisible = ref(false)

const alertCount = computed(() => activeAlerts.value.length)

/** 顶栏滚动告警：接口数据优先，接口不可用时展示本地示例 */
const tickerAlerts = computed<TunnelAlert[]>(() =>
  activeAlerts.value.length ? activeAlerts.value.map(alertToPanelAlert) : DEMO_ALERTS.map((a) => ({ ...a })),
)

function focusAlert(alert: TunnelAlert) {
  const matched = activeAlerts.value.find((item) => (item.code || String(item.id)) === alert.id)
  requestSceneFocus(matched?.pointId || alert.pointId)
}

function focusFirstAlert() {
  const first = tickerAlerts.value[0]
  if (first) focusAlert(first)
}

function onLogin(loggedIn: AuthUser) {
  user.value = loggedIn
  void loadHeader()
}

function logout() {
  clearSession()
  user.value = null
  ElMessage.success('已退出登录')
}

async function loadHeader() {
  const [alertResult, moduleResult] = await Promise.allSettled([
    api.get<AlertItem[]>('/alerts/active', undefined, { silent: true }),
    api.get<ModuleEntry[]>('/dashboard/modules', undefined, { silent: true }),
  ])
  if (alertResult.status === 'fulfilled') activeAlerts.value = alertResult.value
  if (moduleResult.status === 'fulfilled') {
    menus.value = moduleResult.value.map((item) => ({
      path: item.path,
      label: item.name,
      icon: item.icon,
      badge: item.badge ? String(item.badge) : '',
    }))
  }
}

const nowStr = ref('')
let timer: number | undefined
function tick() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  nowStr.value = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
onMounted(() => {
  void loadHeader()
  tick()
  timer = window.setInterval(tick, 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped lang="scss">
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(
      ellipse 90% 50% at 50% -12%,
      rgba(30, 90, 200, 0.3),
      transparent 60%
    ),
    linear-gradient(180deg, #071c42 0%, #04122e 60%, #030d22 100%);
}

/* ===== 顶部标题栏 ===== */
.topbar {
  height: 88px;
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 42px 34px;
  align-items: center;
  gap: 0 8px;
  padding: 0 20px 10px;
  position: relative;
  background: linear-gradient(
    180deg,
    rgba(14, 50, 120, 0.9) 0%,
    rgba(8, 30, 70, 0.95) 100%
  );
  border-bottom: 1px solid rgba(78, 160, 255, 0.35);
  box-shadow: 0 4px 18px rgba(10, 50, 140, 0.45);

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: 46%;
    height: 3px;
    background: linear-gradient(
      90deg,
      transparent,
      #4ee6ff 30%,
      #4ee6ff 70%,
      transparent
    );
    filter: blur(1px);
  }
}

/* 标题居中，两侧导航 */
.title-block {
  grid-column: 1 / -1;
  grid-row: 1;
  justify-self: center;
  position: relative;
  padding: 0 18px;
  white-space: nowrap;
}
.sys-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 3px;
  background: linear-gradient(180deg, #ffffff 30%, #8fd0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 16px rgba(78, 180, 255, 0.4);
}

/* 导航 */
.tb-nav {
  display: flex;
  gap: 6px;
}
.nav-left {
  grid-column: 1;
  grid-row: 2;
  justify-self: end;
}
.nav-right {
  grid-column: 2;
  grid-row: 2;
  justify-self: start;
}
.user-chip {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: #cfe4ff;
  b { font-weight: 600; }
  i { font-style: normal; color: #7fd7ff; }
  .link-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    font-size: 11px; color: #8aa5c8; text-decoration: underline;
    &:hover { color: #fff; }
  }
}
.tb-tools {
  position: absolute;
  right: 20px;
  top: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 1px;
  color: #9cc0ee;
  cursor: pointer;
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  background: rgba(20, 55, 115, 0.45);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  &:hover {
    color: #e8f6ff;
    background: rgba(35, 90, 180, 0.55);
  }
  &.active {
    color: #fff;
    background: linear-gradient(
      180deg,
      rgba(60, 140, 255, 0.75),
      rgba(25, 80, 190, 0.65)
    );
    box-shadow:
      0 0 14px rgba(60, 150, 255, 0.55),
      inset 0 0 12px rgba(120, 200, 255, 0.3);
    border-bottom-color: #4ee6ff;
  }
  .nav-icon {
    font-size: 14px;
  }
  .nav-badge {
    position: absolute;
    top: 2px;
    right: 4px;
    background: #ff4d4f;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    min-width: 14px;
    height: 14px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 6px rgba(255, 77, 79, 0.8);
  }
}

.datetime {
  font-size: 13px;
  color: #cfe4ff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.bell-btn {
  --el-button-bg-color: rgba(30, 80, 170, 0.6);
  --el-button-border-color: rgba(78, 160, 255, 0.5);
}

@media (max-width: 1600px) {
  .datetime {
    display: none;
  }
  .sys-name {
    font-size: 20px;
  }
}
@media (max-width: 1000px) {
  .topbar {
    padding-left: 8px;
    padding-right: 8px;
  }
  .nav-item {
    font-size: 11px;
    padding: 7px 9px;
  }
  .tb-tools {
    right: 10px;
    gap: 6px;
  }
  .sys-name {
    font-size: 17px;
    letter-spacing: 1px;
  }
}

/* ===== 主内容 ===== */
.main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  > * {
    flex: 1;
    min-height: 0;
  }
}
</style>
