<template>
  <el-dialog
    :model-value="modelValue"
    title="登录运维平台"
    width="420px"
    append-to-body
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <p class="login-tip">
      大屏读接口可匿名访问；<b>告警确认、工单流转、发布审核</b>等写操作需要登录。
      演示账号口令均为 <code>Lhsd@2026</code>。
    </p>
    <el-form label-width="64px" @submit.prevent="submit">
      <el-form-item label="账号">
        <el-input v-model="username" placeholder="admin / manager / engineer / operator / viewer" autocomplete="username" />
      </el-form-item>
      <el-form-item label="口令">
        <el-input v-model="password" type="password" show-password autocomplete="current-password" @keyup.enter="submit" />
      </el-form-item>
    </el-form>
    <div class="account-hints">
      <button v-for="account in ACCOUNTS" :key="account.username" type="button" class="hint-chip" @click="fill(account.username)">
        {{ account.label }}
      </button>
    </div>
    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button size="small" type="primary" :loading="loading" @click="submit">登录</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, ApiError, setSession, type AuthUser } from '../api/client'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success', user: AuthUser): void
}>()

const ACCOUNTS = [
  { username: 'admin', label: '管理员' },
  { username: 'manager', label: '值班长' },
  { username: 'engineer', label: '工程师' },
  { username: 'operator', label: '值班员' },
  { username: 'viewer', label: '访客' },
]

const username = ref('admin')
const password = ref('Lhsd@2026')
const loading = ref(false)

function fill(name: string) {
  username.value = name
  password.value = 'Lhsd@2026'
}

async function submit() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入账号与口令')
    return
  }
  loading.value = true
  try {
    const result = await api.post<{ token: string; user: AuthUser }>('/auth/login', {
      username: username.value.trim(),
      password: password.value,
    })
    setSession(result.token, result.user)
    ElMessage.success(`欢迎，${result.user.displayName}（${result.user.roleLabel}）`)
    emit('success', result.user)
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '登录失败，请检查后端服务')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-tip {
  font-size: 12px;
  color: #8aa5c8;
  line-height: 1.7;
  margin: 0 0 12px;
  b { color: #ffd591; }
  code { color: #7fd7ff; background: rgba(20, 60, 120, 0.6); padding: 0 4px; border-radius: 3px; }
}
.account-hints {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
  .hint-chip {
    font-size: 11px; padding: 2px 10px; border-radius: 999px; cursor: pointer;
    background: rgba(30, 70, 140, 0.5); border: 1px solid rgba(100, 170, 255, 0.35); color: #cfe4ff;
    &:hover { background: rgba(40, 100, 200, 0.6); }
  }
}
</style>
