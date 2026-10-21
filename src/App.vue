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
        <el-button size="small" :type="prd.state.visible ? 'primary' : 'default'" class="view-toggle" @click="prd.state.visible = !prd.state.visible">
          <el-icon><View /></el-icon>{{ prd.state.visible ? '界面+标号' : '仅界面' }}
        </el-button>
        <el-badge :value="3" class="alarm-badge">
          <el-button size="small" circle class="bell-btn"><el-icon><Bell /></el-icon></el-button>
        </el-badge>
      </div>
    </header>

    <!-- 告警滚动横幅 -->
    <div class="alarm-ticker" v-if="route.path === '/overview' || route.path === '/emergency' || route.path === '/monitoring'">
      <span class="tk-icon">⚠️</span>
      <span class="tk-text">【积涝黄色预警】K3+050 积水监测点 1h 降雨量 15.9mm，达内涝警戒值，请加强巡查并预置排涝设备</span>
      <span class="tk-time">30s 后刷新</span>
    </div>

    <!-- 主内容（全屏场景） -->
    <main class="main">
      <router-view />
    </main>
  </div>

  <!-- PRD 说明弹窗（琥珀色系） -->
  <el-dialog v-model="docVisible" width="720px" :close-on-click-modal="false">
    <template #header>
      <div class="prd-header">
        <span class="prd-tag">PRD</span>
        <span>{{ editing?.title }}</span>
        <span class="prd-editable">内容可编辑</span>
      </div>
    </template>
    <table class="prd-table" v-if="editing">
      <tbody>
        <tr v-for="f in fields" :key="f.key">
          <td class="prd-key">{{ f.label }}</td>
          <td class="prd-val">
            <el-input
              v-model="editing[f.key]"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 5 }"
              :readonly="!editMode"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <template #footer>
      <el-button size="small" @click="docVisible = false">关闭</el-button>
      <el-button size="small" :type="editMode ? 'warning' : 'default'" @click="editMode = !editMode">
        {{ editMode ? '取消编辑' : '编辑' }}
      </el-button>
      <el-button size="small" type="warning" @click="save">保存修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrd, type PrdDoc } from './prd'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const prd = usePrd()

const menus = [
  { path: '/overview', label: '总览', icon: '🏠', badge: '' },
  { path: '/traffic', label: '智能交通', icon: '🚦', badge: '3' },
  { path: '/maintenance', label: '智慧养护', icon: '🛠️', badge: '2' },
  { path: '/monitoring', label: '智慧监测', icon: '📡', badge: '1' },
  { path: '/emergency', label: '数字应急', icon: '🚨', badge: '1' },
  { path: '/service', label: '数字服务', icon: '📱', badge: '' },
  { path: '/asset', label: '资产资料中心', icon: '📚', badge: '' }
]

const nowStr = ref('')
let timer: number | undefined
function tick() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  nowStr.value = `2026.10.18  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
onMounted(() => { tick(); timer = window.setInterval(tick, 1000) })
onBeforeUnmount(() => clearInterval(timer))

const docVisible = computed({
  get: () => !!prd.state.dialogDocKey,
  set: (v) => { if (!v) prd.state.dialogDocKey = null }
})
const editMode = ref(false)
const editing = ref<PrdDoc | null>(null)
const fields = [
  { key: '功能说明', label: '功能说明' },
  { key: '规则约束', label: '规则约束' },
  { key: '异常处理', label: '异常处理' },
  { key: '数据要求', label: '数据要求' },
  { key: '权限要求', label: '权限要求' }
] as const

watch(() => prd.state.dialogDocKey, (k) => {
  if (k && prd.state.docs[k]) {
    editing.value = { ...prd.state.docs[k] }
    editMode.value = false
  }
})

function save() {
  if (editing.value && prd.state.dialogDocKey) {
    prd.save(prd.state.dialogDocKey, editing.value)
    ElMessage.success('说明文档已保存')
  }
}
</script>

<style scoped lang="scss">
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 90% 50% at 50% -12%, rgba(30, 90, 200, 0.3), transparent 60%),
    linear-gradient(180deg, #071c42 0%, #04122e 60%, #030d22 100%);
}

/* ===== 顶部标题栏 ===== */
.topbar {
  height: 64px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 0 20px;
  position: relative;
  background: linear-gradient(180deg, rgba(14, 50, 120, 0.9) 0%, rgba(8, 30, 70, 0.95) 100%);
  border-bottom: 1px solid rgba(78, 160, 255, 0.35);
  box-shadow: 0 4px 18px rgba(10, 50, 140, 0.45);

  &::after {
    content: "";
    position: absolute;
    left: 50%; bottom: 0;
    transform: translateX(-50%);
    width: 46%; height: 3px;
    background: linear-gradient(90deg, transparent, #4ee6ff 30%, #4ee6ff 70%, transparent);
    filter: blur(1px);
  }
}

/* 标题居中，两侧导航 */
.title-block {
  flex: none;
  position: relative;
  padding: 0 18px;
  white-space: nowrap;
}
.sys-name {
  font-size: 24px; font-weight: 800; letter-spacing: 4px;
  background: linear-gradient(180deg, #ffffff 30%, #8fd0ff 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 16px rgba(78, 180, 255, 0.4);
}

/* 导航 */
.tb-nav { flex: none; display: flex; gap: 6px; }
.tb-tools {
  flex: none; position: absolute; right: 20px;
  display: flex; align-items: center; gap: 14px;
}
.nav-item {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 18px;
  font-size: 15px; font-weight: 600; letter-spacing: 1px;
  color: #9cc0ee;
  cursor: pointer;
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  background: rgba(20, 55, 115, 0.45);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  &:hover { color: #e8f6ff; background: rgba(35, 90, 180, 0.55); }
  &.active {
    color: #fff;
    background: linear-gradient(180deg, rgba(60, 140, 255, 0.75), rgba(25, 80, 190, 0.65));
    box-shadow: 0 0 14px rgba(60, 150, 255, 0.55), inset 0 0 12px rgba(120, 200, 255, 0.3);
    border-bottom-color: #4ee6ff;
  }
  .nav-icon { font-size: 14px; }
  .nav-badge {
    position: absolute; top: 2px; right: 4px;
    background: #ff4d4f; color: #fff; font-size: 9px; font-weight: 700;
    min-width: 14px; height: 14px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 6px rgba(255, 77, 79, 0.8);
  }
}

.datetime { font-size: 13px; color: #cfe4ff; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
.view-toggle, .bell-btn {
  --el-button-bg-color: rgba(30, 80, 170, 0.6);
  --el-button-border-color: rgba(78, 160, 255, 0.5);
}

/* ===== 告警滚动横幅 ===== */
.alarm-ticker {
  flex: none;
  margin: 10px 16px 0;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  color: #ffe3b8;
  background: linear-gradient(90deg, rgba(120, 60, 10, 0.55) 0%, rgba(60, 35, 10, 0.45) 60%, rgba(60, 35, 10, 0.1) 100%);
  border: 1px solid rgba(255, 170, 60, 0.45);
  box-shadow: 0 0 14px rgba(255, 150, 40, 0.18);
  .tk-icon { filter: drop-shadow(0 0 4px rgba(255, 170, 40, 0.8)); }
  .tk-text { flex: 1; letter-spacing: 0.5px; }
  .tk-time { font-size: 11px; color: #d9a05a; }
}

/* ===== 主内容 ===== */
.main {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
  > * { flex: 1; min-height: 0; }
}

/* ===== PRD 弹窗 琥珀色系 ===== */
.prd-header {
  display: flex; align-items: center; gap: 10px;
  font-size: 16px; font-weight: 700; color: #7a4a00;
  .prd-tag { background: #ff7d00; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 700; }
  .prd-editable { font-size: 11px; color: #b8863b; font-weight: 400; margin-left: auto; }
}
.prd-table {
  width: 100%; border-collapse: collapse;
  td { border: 1px solid #f0dcb8; padding: 0; vertical-align: top; }
  .prd-key {
    width: 90px; background: #fff7e6; color: #874d00;
    font-weight: 600; font-size: 13px; padding: 10px 12px; text-align: center;
  }
  .prd-val { background: #fffdf7; }
}
:deep(.el-dialog) { border-radius: 10px; }
:deep(.el-dialog__header) { background: #fff3dd; border-bottom: 2px solid #ffcf70; border-radius: 10px 10px 0 0; margin-right: 0; padding: 16px 20px; }
:deep(.el-dialog__body) { padding: 16px 20px; }
:deep(.prd-val .el-textarea__inner) {
  box-shadow: none; border: none; background: transparent;
  font-size: 13px; color: #5a4315; padding: 10px 12px; line-height: 1.6;
}
</style>
