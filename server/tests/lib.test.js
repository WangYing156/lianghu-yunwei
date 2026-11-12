import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  camelize,
  pagination,
  pageMeta,
  stakeToNumber,
  timeWindow,
  makeCode,
} from '../src/lib/format.js'
import {
  STATUS_FLOW,
  STATUS_LABEL,
  allowedNext,
  canTransition,
  computeDueAt,
  isValidStatus,
  transitionError,
} from '../src/lib/workflow.js'
import { hashPassword, verifyPassword } from '../src/lib/password.js'
import { nextBizCode, withCodeRetry } from '../src/lib/code.js'
import { ApiError, Errors, ERROR_CODES } from '../src/lib/errors.js'

/* ------------------------- format.js ------------------------- */

test('camelize：下划线转驼峰并递归数组/对象', () => {
  const row = {
    work_order_code: 'GD-1',
    nested_value: { inner_key: 1 },
    list_value: [{ a_b: 2 }],
    created_at: new Date('2026-01-02T03:04:05.000Z'),
  }
  const out = camelize(row)
  assert.equal(out.workOrderCode, 'GD-1')
  assert.deepEqual(out.nestedValue, { innerKey: 1 })
  assert.deepEqual(out.listValue, [{ aB: 2 }])
  assert.equal(out.createdAt, '2026-01-02T03:04:05.000Z')
})

test('camelize：null 与数组入参', () => {
  assert.equal(camelize(null), null)
  assert.deepEqual(camelize([{ a_b: 1 }]), [{ aB: 1 }])
})

test('pagination：默认值、上限与非法输入', () => {
  assert.deepEqual(pagination({}), { page: 1, pageSize: 20, offset: 0, limit: 20 })
  assert.deepEqual(pagination({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, offset: 20, limit: 10 })
  // 超过上限被截断到 200
  assert.equal(pagination({ pageSize: '9999' }).pageSize, 200)
  // 非法/负数回落到安全值
  assert.equal(pagination({ page: '0' }).page, 1)
  assert.equal(pagination({ page: '-5' }).page, 1)
  assert.equal(pagination({ pageSize: 'abc' }).pageSize, 20)
})

test('pageMeta：总页数向上取整', () => {
  assert.deepEqual(pageMeta(0, 1, 20), { page: 1, pageSize: 20, total: 0, totalPages: 0 })
  assert.deepEqual(pageMeta(41, 2, 20), { page: 2, pageSize: 20, total: 41, totalPages: 3 })
})

test('stakeToNumber：桩号解析', () => {
  assert.equal(stakeToNumber('K3+050'), 3050)
  assert.equal(stakeToNumber('k12+480'), 12480)
  assert.equal(stakeToNumber('K3+5'), 3005)
  assert.equal(stakeToNumber(''), null)
  assert.equal(stakeToNumber(null), null)
  assert.equal(stakeToNumber('匝道'), null)
})

test('timeWindow：from/to/hours 三种入参与非法值', () => {
  const { start, end } = timeWindow({ hours: '6' })
  assert.equal(Math.round((end - start) / 3600000), 6)

  const explicit = timeWindow({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T12:00:00.000Z' })
  assert.equal(explicit.start.toISOString(), '2026-01-01T00:00:00.000Z')
  assert.equal(explicit.end.toISOString(), '2026-01-01T12:00:00.000Z')

  // 默认窗口 24h
  assert.equal(Math.round((timeWindow({}).end - timeWindow({}).start) / 3600000), 24)
  assert.throws(() => timeWindow({ from: 'not-a-date' }), /时间区间参数不合法/)
})

test('makeCode：业务编号补零', () => {
  assert.equal(makeCode('YH', new Date(2026, 10, 12), 7), 'YH-20261112-07')
})

/* ------------------------- workflow.js ------------------------- */

test('工单状态机：主链路可流转', () => {
  const path = ['pending', 'dispatched', 'processing', 'reviewing', 'completed']
  for (let i = 0; i < path.length - 1; i += 1) {
    assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]} → ${path[i + 1]}`)
    assert.equal(transitionError(path[i], path[i + 1]), null)
  }
})

test('工单状态机：终态不可再流转', () => {
  assert.equal(STATUS_FLOW.completed.length, 0)
  assert.equal(STATUS_FLOW.cancelled.length, 0)
  assert.equal(canTransition('completed', 'dispatched'), false)
  assert.equal(canTransition('cancelled', 'pending'), false)
})

test('工单状态机：驳回后允许重新派发', () => {
  assert.deepEqual(allowedNext('rejected'), ['dispatched', 'cancelled'])
  assert.equal(canTransition('rejected', 'dispatched'), true)
})

test('工单状态机：非法流转给出中文原因', () => {
  assert.match(transitionError('pending', 'completed'), /不能流转到/)
  assert.match(transitionError('pending', 'unknown'), /未知的目标状态/)
  assert.match(transitionError('unknown', 'pending'), /未知的工单状态/)
  assert.equal(isValidStatus('reviewing'), true)
  assert.equal(isValidStatus('done'), false)
})

test('工单状态标签：覆盖全部状态', () => {
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), Object.keys(STATUS_FLOW).sort())
  assert.equal(STATUS_LABEL.pending, '待派发')
})

test('computeDueAt：按 SLA 小时计算到期时间', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  assert.equal(computeDueAt(4, from).toISOString(), '2026-01-01T04:00:00.000Z')
  assert.equal(computeDueAt('2', from).toISOString(), '2026-01-01T02:00:00.000Z')
  assert.equal(computeDueAt(0), null)
  assert.equal(computeDueAt('abc'), null)
})

/* ------------------------- password.js ------------------------- */

test('口令散列：可校验且不落明文', () => {
  const stored = hashPassword('Lhsd@2026')
  assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/)
  assert.ok(!stored.includes('Lhsd@2026'))
  assert.equal(verifyPassword('Lhsd@2026', stored), true)
  assert.equal(verifyPassword('wrong', stored), false)
  // 同一口令两次散列结果不同（随机盐）
  assert.notEqual(hashPassword('Lhsd@2026'), stored)
})

test('口令校验：异常入参不抛异常', () => {
  assert.equal(verifyPassword('x', null), false)
  assert.equal(verifyPassword('x', ''), false)
  assert.equal(verifyPassword('x', 'plain-text'), false)
  assert.equal(verifyPassword('x', 'scrypt$1$2$3$4'), false)
})

/* ------------------------- errors.js ------------------------- */

test('业务异常：HTTP 状态码与业务码成对', () => {
  const notFound = Errors.notFound('工单不存在')
  assert.ok(notFound instanceof ApiError)
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.code, 40401)
  assert.equal(notFound.message, '工单不存在')

  assert.equal(Errors.unauthorized().statusCode, 401)
  assert.equal(Errors.forbidden().code, 40301)
  assert.equal(Errors.conflict().statusCode, 409)
  assert.equal(Errors.badRequest().code, 40001)
})

test('业务错误码：每个码都有说明文案', () => {
  const pairs = [
    [Errors.badRequest(), 40001],
    [Errors.unauthorized(), 40101],
    [Errors.forbidden(), 40301],
    [Errors.notFound(), 40401],
    [Errors.conflict(), 40901],
    [Errors.tooMany(), 42901],
    [Errors.internal(), 50001],
    [Errors.unavailable(), 50301],
  ]
  for (const [error, code] of pairs) {
    assert.equal(error.code, code)
    assert.equal(typeof ERROR_CODES[code], 'string')
  }
})

/* ------------------------- code.js ------------------------- */

function fakeRunner(rows) {
  return {
    one: async () => rows,
  }
}

test('nextBizCode：按前缀+日期取当日最大序号并递增', async () => {
  const runner = fakeRunner({ last: 7 })
  const date = new Date(2026, 10, 12)
  assert.equal(await nextBizCode(runner, { table: 'work_order', prefix: 'GD', date }), 'GD-20261112-08')
})

test('nextBizCode：首号为 01', async () => {
  const runner = fakeRunner({ last: 0 })
  assert.equal(
    await nextBizCode(runner, { table: 'disease', prefix: 'BH', date: new Date(2026, 0, 5) }),
    'BH-20260105-01',
  )
})

test('nextBizCode：publish_task 使用 task_no 列', async () => {
  let sql = ''
  const runner = {
    one: async (statement) => {
      sql = statement
      return { last: 2 }
    },
  }
  const code = await nextBizCode(runner, { table: 'publish_task', prefix: 'FB', date: new Date(2026, 10, 12) })
  assert.equal(code, 'FB-20261112-03')
  assert.match(sql, /task_no/)
  assert.ok(!/\bcode\b\s+like/.test(sql))
})

test('nextBizCode：拒绝白名单外的表（防 SQL 注入）', async () => {
  await assert.rejects(() => nextBizCode(fakeRunner({ last: 0 }), { table: 'sys_user; drop table x', prefix: 'X' }), /不允许的编号表/)
})

test('withCodeRetry：唯一键冲突重试后成功', async () => {
  let calls = 0
  const result = await withCodeRetry(async () => {
    calls += 1
    if (calls < 2) {
      const error = new Error('duplicate key')
      error.code = '23505'
      throw error
    }
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('withCodeRetry：非 23505 立即抛出', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withCodeRetry(async () => {
        calls += 1
        throw new Error('boom')
      }),
    /boom/,
  )
  assert.equal(calls, 1)
})

test('withCodeRetry：连续冲突达到上限后抛出', async () => {
  let calls = 0
  await assert.rejects(() =>
    withCodeRetry(async () => {
      calls += 1
      const error = new Error('duplicate')
      error.code = '23505'
      throw error
    }, 3),
  )
  assert.equal(calls, 3)
})
