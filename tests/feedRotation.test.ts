import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceFeed } from '../src/utils/feedRotation'
import { DEMO_ALERTS } from '../src/config/alerts'
test('轮播倒计时及循环，不改变告警源数据', () => {
  const original = JSON.stringify(DEMO_ALERTS)
  assert.deepEqual(advanceFeed(0, 7000, 200, 5, 7000), { index: 0, remaining: 6800 })
  assert.deepEqual(advanceFeed(0, 200, 200, 5, 7000), { index: 1, remaining: 7000 })
  assert.deepEqual(advanceFeed(4, 200, 200, 5, 7000), { index: 0, remaining: 7000 })
  assert.equal(original, JSON.stringify(DEMO_ALERTS))
})
test('恢复后台后最多切换一条，空列表与单条列表安全', () => {
  assert.deepEqual(advanceFeed(1, 50, 60000, 5, 7000), { index: 2, remaining: 7000 })
  assert.deepEqual(advanceFeed(3, 50, 100, 0, 7000), { index: 0, remaining: 7000 })
  assert.deepEqual(advanceFeed(0, 50, 100, 1, 7000), { index: 0, remaining: 7000 })
})
