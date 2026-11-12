/**
 * 演示账号。口令只用于演示环境，首次部署请修改。
 */
import { hashPassword } from '../../lib/password.js'

export const DEMO_USERS = [
  { username: 'admin', name: '系统管理员', role: 'admin', phone: '13800000001', dept: '运管中心' },
  { username: 'manager', name: '值班长 王工', role: 'manager', phone: '13800000002', dept: '监控中心' },
  { username: 'engineer', name: '养护工程师 李工', role: 'engineer', phone: '13800000003', dept: '养护部' },
  { username: 'operator', name: '值班员 张工', role: 'operator', phone: '13800000004', dept: '监控中心' },
  { username: 'viewer', name: '只读账号', role: 'viewer', phone: '13800000005', dept: '参观浏览' },
]

export const DEMO_PASSWORD = 'Lhsd@2026'

export function buildUsers() {
    // 每次种子使用固定口令，但散列带随机盐；重复执行时靠 username 冲突跳过
  const hash = hashPassword(DEMO_PASSWORD)
  return DEMO_USERS.map((user) => ({ ...user, passwordHash: hash }))
}
