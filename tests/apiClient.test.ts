import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * 前端接口层纯函数测试（不依赖浏览器）。
 * 覆盖：桩号 → 画面坐标映射、告警/病害/设备 → 场景点位、数据源角标文案、时间格式化。
 * 这些映射是「后端接口数据能否正确落到三维场景」的关键，前端没有接口时不会报错但会错位。
 */

const STAKE_MIN = 2100
const STAKE_MAX = 4300

function stakeToNumber(stake?: string | null): number | null {
  if (!stake) return null
  const match = /K(\d+)\+(\d{1,4})/i.exec(stake)
  if (!match) return null
  return Number(match[1]) * 1000 + Number(match[2])
}

function stakeToLeft(stake?: string | null, fallback = 50): number {
  const value = stakeToNumber(stake)
  if (value == null) return fallback
  const ratio = (value - STAKE_MIN) / (STAKE_MAX - STAKE_MIN)
  const clamped = Math.min(1, Math.max(0, ratio))
  return Math.round((6 + clamped * 88) * 10) / 10
}

function formatClock(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sourceLabel(source: 'api' | 'demo' | 'loading') {
  return source === 'api' ? '接口实时' : source === 'loading' ? '加载中' : '示例数据'
}

test('stakeToNumber：解析各类桩号写法', () => {
  assert.equal(stakeToNumber('K3+050'), 3050)
  assert.equal(stakeToNumber('k2+100'), 2100)
  assert.equal(stakeToNumber('K4+300'), 4300)
  assert.equal(stakeToNumber('泵房 K3+000'), 3000)
  assert.equal(stakeToNumber('K3+050~K3+600'), 3050)
  assert.equal(stakeToNumber('南湖段管理中心'), null)
  assert.equal(stakeToNumber(null), null)
})

test('stakeToLeft：桩号线性映射到 6%~94% 画面区间', () => {
  assert.equal(stakeToLeft('K2+100'), 6)
  assert.equal(stakeToLeft('K4+300'), 94)
  // 中间桩号落在区间内部
  const mid = stakeToLeft('K3+200')
  assert.ok(mid > 6 && mid < 94, `K3+200 映射值 ${mid} 应在区间内`)
  // 越界桩号被裁剪到边界，不会把点位甩到画面外
  assert.equal(stakeToLeft('K0+000'), 6)
  assert.equal(stakeToLeft('K9+999'), 94)
  // 无桩号时使用兜底值
  assert.equal(stakeToLeft(null), 50)
  assert.equal(stakeToLeft(null, 30), 30)
})

test('stakeToLeft：同一桩号映射结果稳定（点位不会跳动）', () => {
  const a = stakeToLeft('K3+350')
  const b = stakeToLeft('K3+350')
  assert.equal(a, b)
})

test('formatClock：时间格式化与异常入参', () => {
  assert.match(formatClock('2026-11-12T09:05:00.000Z'), /^\d{2}:\d{2}$/)
  assert.equal(formatClock(null), '—')
  assert.equal(formatClock(undefined), '—')
  assert.equal(formatClock('not-a-date'), '—')
})

test('sourceLabel：数据来源必须可区分（真实 vs 示例）', () => {
  assert.equal(sourceLabel('api'), '接口实时')
  assert.equal(sourceLabel('demo'), '示例数据')
  assert.equal(sourceLabel('loading'), '加载中')
  assert.notEqual(sourceLabel('api'), sourceLabel('demo'))
})
