#!/usr/bin/env node
/**
 * 接口自检（一键启动脚本的最后一步会调用）：
 *  1. 逐个调用全部 GET 接口，校验统一响应结构与关键字段
 *  2. 走通写链路：登录 → 新建告警 → 确认 → 关闭 → 建工单 → 流转 → 病害上报 → 反馈转工单 → 发布审核 → 下刊
 *  3. 校验鉴权与错误码（未登录 401、权限不足 403、资源不存在 404、状态冲突 409）
 * 失败时以非零码退出，便于 Windows 脚本判停。
 */
import config from '../src/config.js'

const BASE = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${config.port}`
const PREFIX = config.apiPrefix
const ONLY_READ = process.argv.includes('--read-only')

const checks = []
let token = ''
let adminToken = ''

function pass(name, detail = '') {
  checks.push({ ok: true, name, detail })
  console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail })
  console.log(`  ✘ ${name} — ${detail}`)
}

async function call(method, path, { body, expect = 200, auth = 'operator', query } = {}) {
  const url = new URL(PREFIX + path, BASE)
  if (query) for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, value)
  const headers = {}
  if (body) headers['content-type'] = 'application/json'
  const bearer = auth === 'operator' ? token : auth === 'admin' ? adminToken : ''
  if (bearer) headers.authorization = `Bearer ${bearer}`
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, json, text, expect }
}

async function expectOk(name, method, path, options, validate) {
  const res = await call(method, path, options)
  const want = options?.expect ?? 200
  if (res.status !== want) {
    fail(name, `HTTP ${res.status}，期望 ${want}；响应：${res.text.slice(0, 220)}`)
    return null
  }
  if (want < 400) {
    if (!res.json || res.json.code !== 0 || !('data' in res.json)) {
      fail(name, `响应结构不是统一信封：${res.text.slice(0, 220)}`)
      return null
    }
    if (validate) {
      const problem = validate(res.json.data)
      if (problem) {
        fail(name, problem)
        return null
      }
    }
    pass(name, `HTTP ${res.status}`)
  } else {
    pass(name, `HTTP ${res.status}（预期失败）`)
  }
  return res.json?.data ?? null
}

async function expectStatus(name, method, path, options, status) {
  const res = await call(method, path, options)
  if (res.status !== status) {
    fail(name, `HTTP ${res.status}，期望 ${status}；响应：${res.text.slice(0, 200)}`)
    return null
  }
  if (status >= 400 && (!res.json || typeof res.json.code !== 'number' || !res.json.message)) {
    fail(name, `错误响应缺少 code/message：${res.text.slice(0, 200)}`)
    return null
  }
  pass(name, `HTTP ${status}`)
  return res
}

/** 校验数组非空：可校验 data 本身，或用 items(...) 校验分页信封里的 items */
const notEmptyArray = (data) => {
  if (!Array.isArray(data)) return `期望数组，实际 ${typeof data}`
  if (!data.length) return '数组为空'
  return null
}

const items = (validate) => (data) => {
  if (!data || !Array.isArray(data.items)) return '期望分页对象 { items: [] }'
  if (!data.items.length) return 'items 为空'
  if (typeof data.total !== 'number' || typeof data.totalPages !== 'number') return '缺少 total / totalPages'
  return validate ? validate(data) : null
}

async function main() {
  console.log(`=== 接口自检 @ ${BASE}${PREFIX} ===`)
  const online = await call('GET', '/health', { auth: '' }).catch((error) => ({ status: 0, text: error.message }))
  if (online.status !== 200) {
    console.log(`✘ 服务未启动或不可访问：${online.text}`)
    process.exit(1)
  }
  pass('服务可访问', `HTTP ${online.status}`)

  console.log('\n[1] 只读接口')
  await expectOk('健康检查', 'GET', '/health', { auth: '' }, (d) =>
    d.database === 'ok' ? null : `数据库状态 ${d.database}`,
  )
  await expectOk('平台元数据', 'GET', '/meta', { auth: '' }, (d) =>
    d.enums?.alertLevel?.length === 4 ? null : '枚举字典缺失',
  )
  await expectOk('总览聚合', 'GET', '/dashboard/summary', { auth: '' }, (d) =>
    d.devices && d.alerts && d.workOrders && d.traffic ? null : '缺少聚合分区',
  )
  await expectOk('模块角标', 'GET', '/dashboard/modules', { auth: '' }, (d) =>
    notEmptyArray(d) ?? (d.length === 7 ? null : '模块数量应为 7'),
  )
  await expectOk('场景模块与默认图层', 'GET', '/scene/modules', { auth: '' }, (d) =>
    notEmptyArray(d) ?? (d[0].defaultGroups?.length ? null : '默认图层缺失'),
  )
  await expectOk('场景点位（总览）', 'GET', '/scene/points', { auth: '', query: { module: 'overview' } }, (d) =>
    notEmptyArray(d) ?? (d[0].left?.endsWith('%') && typeof d[0].leftNum === 'number' ? null : '坐标字段不符合 ScenePoint'),
  )
  await expectOk('场景点位（按分组）', 'GET', '/scene/points', { auth: '', query: { group: 'mep' } }, notEmptyArray)
  await expectOk('点位详情', 'GET', '/scene/points/c1', { auth: '' }, (d) =>
    d.point?.id === 'c1' ? null : '点位 ID 不一致',
  )
  await expectOk('图层分组字典', 'GET', '/scene/groups', { auth: '' }, (d) =>
    notEmptyArray(d) ?? (d.length === 5 ? null : '应为 5 个分组'),
  )
  await expectOk('告警列表', 'GET', '/alerts', { auth: '', query: { pageSize: 5 } }, items())
  await expectOk('未关闭告警', 'GET', '/alerts/active', { auth: '' }, notEmptyArray)
  await expectOk('告警统计', 'GET', '/alerts/stats', { auth: '', query: { hours: 48 } }, (d) =>
    d.byLevel?.length === 4 ? null : '等级统计缺失',
  )
  const alertList = await expectOk('告警筛选（紧急）', 'GET', '/alerts', {
    auth: '',
    query: { level: 'critical' },
  })
  const firstAlertId = alertList?.items?.[0]?.id
  if (firstAlertId) await expectOk('告警详情', 'GET', `/alerts/${firstAlertId}`, { auth: '' }, (d) =>
    d.alert?.id === firstAlertId && Array.isArray(d.timeline) ? null : '详情结构异常',
  )
  await expectOk('设备分类字典', 'GET', '/device-categories', { auth: '' }, notEmptyArray)
  const devices = await expectOk('设备列表', 'GET', '/devices', { auth: '', query: { pageSize: 5 } }, items((d) =>
    d.byStatus ? null : '缺少状态分布',
  ))
  const deviceId = devices?.items?.[0]?.id
  if (deviceId) {
    await expectOk('设备详情', 'GET', `/devices/${deviceId}`, { auth: '' }, (d) =>
      d.device?.id === deviceId ? null : '设备 ID 不一致',
    )
    await expectOk('设备遥测序列', 'GET', `/devices/${deviceId}/telemetry`, { auth: '', query: { hours: 240 } }, (d) =>
      Array.isArray(d) ? null : '遥测应为数组',
    )
  }
  await expectOk('设备筛选（离线）', 'GET', '/devices', { auth: '', query: { status: 'offline' } }, items())
  const orders = await expectOk('工单列表', 'GET', '/work-orders', { auth: '' }, items((d) =>
    d.stats?.byStatus?.length === 7 ? null : '状态统计不完整',
  ))
  const orderId = orders?.items?.find((item) => item.status === 'pending')?.id ?? orders?.items?.[0]?.id
  if (orderId) await expectOk('工单详情', 'GET', `/work-orders/${orderId}`, { auth: '' }, (d) =>
    Array.isArray(d.logs) && Array.isArray(d.allowedNext) ? null : '缺少日志或可流转状态',
  )
  await expectOk('病害列表', 'GET', '/diseases', { auth: '' }, items())
  await expectOk('病害统计', 'GET', '/diseases/stats', { auth: '' }, (d) =>
    d.funnel?.length === 6 && d.trend?.length ? null : '闭环漏斗或趋势缺失',
  )
  await expectOk('监测总览', 'GET', '/monitoring/overview', { auth: '' }, (d) =>
    d.items?.length && d.summary ? null : '监测读数缺失',
  )
  await expectOk('监测时序', 'GET', '/monitoring/series', { auth: '', query: { metrics: 'co,no2', hours: 240 } }, (d) =>
    Array.isArray(d) ? null : '时序应为数组',
  )
  await expectOk('结构健康', 'GET', '/monitoring/structural-health', { auth: '' }, (d) =>
    d.latest?.length && typeof d.overallIndex === 'number' ? null : '健康数据缺失',
  )
  await expectOk('巡检任务', 'GET', '/monitoring/inspection-tasks', { auth: '' }, items())
  await expectOk('周期维护计划', 'GET', '/monitoring/maintenance-plans', { auth: '' }, notEmptyArray)
  await expectOk('摄像机台账', 'GET', '/cameras', { auth: '' }, (d) =>
    notEmptyArray(d.items) ?? (typeof d.summary?.total === 'number' ? null : '缺少汇总'),
  )
  await expectOk('摄像机详情', 'GET', '/cameras/CAM-C02', { auth: '' }, (d) =>
    d.camera?.code === 'CAM-C02' ? null : '摄像机编号不一致',
  )
  await expectStatus('视频流未接入返回 501', 'GET', '/cameras/CAM-C01/stream', { auth: '' }, 501)
  await expectOk('交通断面', 'GET', '/traffic/segments', { auth: '' }, notEmptyArray)
  await expectOk('流量时序', 'GET', '/traffic/flow', { auth: '', query: { bucket: 'hour' } }, notEmptyArray)
  const events = await expectOk('AI 事件列表', 'GET', '/traffic-events', { auth: '' }, items())
  await expectOk('诱导屏台账', 'GET', '/info-boards', { auth: '' }, notEmptyArray)
  await expectOk('发布任务列表', 'GET', '/publish-tasks', { auth: '' }, items())
  await expectOk('公众反馈列表', 'GET', '/feedback', { auth: '' }, items((d) =>
    d.stats?.length === 5 ? null : '反馈统计不完整',
  ))
  await expectOk('对外预警', 'GET', '/public-notices', { auth: '' }, items())
  await expectOk('安全知识列表', 'GET', '/safety-articles', { auth: '' }, notEmptyArray)
  await expectOk('应急物资', 'GET', '/emergency/materials', { auth: '' }, (d) =>
    notEmptyArray(d.items) ?? (typeof d.insufficient === 'number' ? null : '缺少缺口统计'),
  )
  await expectOk('应急态势', 'GET', '/emergency/overview', { auth: '' }, (d) =>
    d.waterLevels && d.pumps && d.thresholds ? null : '应急汇总字段缺失',
  )
  await expectOk('推演记录', 'GET', '/simulation-runs', { auth: '' }, items())
  await expectOk('资产列表', 'GET', '/assets', { auth: '' }, notEmptyArray)
  await expectOk('资产详情', 'GET', `/assets/${deviceId}`, { auth: '' }, (d) =>
    d.asset && d.structure?.length && d.documents?.length ? null : '四页签数据缺失',
  )
  await expectStatus('点位未建档返回 404', 'GET', '/assets/by-point/not-exist', { auth: '' }, 404)
  await expectStatus('未知接口返回 404', 'GET', '/not-a-real-endpoint', { auth: '' }, 404)

  console.log('\n[2] 鉴权')
  await expectStatus('未登录写操作 401', 'POST', '/alerts', {
    auth: '',
    body: { level: 'info', source: '自检', title: '未授权写入' },
  }, 401)
  const badLogin = await expectStatus('错误口令 401', 'POST', '/auth/login', {
    auth: '',
    body: { username: 'operator', password: 'wrong-password' },
  }, 401)
  void badLogin

  const login = await expectOk('值班员登录', 'POST', '/auth/login', {
    auth: '',
    body: { username: 'operator', password: 'Lhsd@2026' },
  }, (d) => (d.token ? null : '未返回令牌'))
  token = login?.token ?? ''
  const adminLogin = await expectOk('管理员登录', 'POST', '/auth/login', {
    auth: '',
    body: { username: 'admin', password: 'Lhsd@2026' },
  })
  adminToken = adminLogin?.token ?? ''
  await expectOk('当前用户', 'GET', '/auth/me', {}, (d) => (d.username === 'operator' ? null : '用户不一致'))
  await expectStatus('值班员访问用户管理 403', 'GET', '/users', {}, 403)
  await expectOk('管理员读取审计日志', 'GET', '/audit-logs', { auth: 'admin' }, items())

  if (ONLY_READ) {
    report()
    return
  }

  console.log('\n[3] 写链路：告警')
  // 每次自检使用独立桩号，避免与上一次运行的去重窗口/未关闭告警互相干扰
  const runStake = `K9+${String((Date.now() % 900) + 100).padStart(3, '0')}`
  const created = await expectOk('新增告警', 'POST', '/alerts', {
    body: {
      level: 'warning',
      source: '自检脚本',
      title: '自检告警：照度偏低',
      description: '接口自检生成，可安全删除。',
      stake: runStake,
      pointId: 's2',
      group: 'env',
      kind: 'illum',
      deviceCode: 'SYS-ENV-0003',
    },
    expect: 201,
  }, (d) => (d.alert?.id ? null : '未返回告警 ID'))
  const merged = await expectOk('5 分钟内重复上报自动合并', 'POST', '/alerts', {
    body: {
      level: 'warning', source: '自检脚本', title: '自检告警：照度偏低（重复上报）',
      stake: runStake, group: 'env', kind: 'illum',
    },
    expect: 201,
  }, (d) => (d.merged === true ? null : '未按 dedupKey 合并'))
  void merged
  const newAlertId = created?.alert?.id
  await expectOk('确认告警', 'POST', `/alerts/${newAlertId}/acknowledge`, {
    body: { note: '自检确认' },
  }, (d) => (d.status === 'acknowledged' ? null : `状态为 ${d.status}`))
  await expectStatus('重复确认返回 409', 'POST', `/alerts/${newAlertId}/acknowledge`, { body: {} }, 409)
  await expectOk('关闭告警', 'POST', `/alerts/${newAlertId}/close`, {}, (d) =>
    d.status === 'closed' ? null : `状态为 ${d.status}`)

  console.log('\n[4] 写链路：工单状态机')
  const order = await expectOk('新建工单', 'POST', '/work-orders', {
    body: { type: 'repair', title: '自检工单：K3+200 灯具复测', priority: 'high', stake: 'K3+200', slaHours: 8 },
    expect: 201,
  }, (d) => (d.code?.startsWith('GD-') ? null : '工单编号异常'))
  const newOrderId = order?.id
  await expectStatus('非法流转 409（跳过派发）', 'POST', `/work-orders/${newOrderId}/transition`, {
    body: { toStatus: 'completed' },
  }, 409)
  await expectOk('派发工单', 'POST', `/work-orders/${newOrderId}/transition`, {
    body: { toStatus: 'dispatched', remark: '派发至养护工程师' },
  }, (d) => (d.status === 'dispatched' && d.dispatchedAt ? null : '派发时间缺失'))
  await expectOk('开始处置', 'POST', `/work-orders/${newOrderId}/transition`, { body: { toStatus: 'processing' } })
  await expectOk('提交验收', 'POST', `/work-orders/${newOrderId}/transition`, { body: { toStatus: 'reviewing' } })
  await expectOk('验收完成', 'POST', `/work-orders/${newOrderId}/transition`, {
    body: { toStatus: 'completed', remark: '自检闭环' },
  }, (d) => (d.status === 'completed' && d.completedAt ? null : '完成时间缺失'))
  await expectOk('工单日志含 5 条', 'GET', `/work-orders/${newOrderId}`, {}, (d) =>
    d.logs.length >= 5 ? null : `日志仅 ${d.logs.length} 条`)

  console.log('\n[5] 写链路：病害与反馈')
  const disease = await expectOk('上报病害并自动建单', 'POST', '/diseases', {
    body: {
      type: 'crack', severity: 'severe', stake: 'K3+320', description: '自检：拱顶新增裂缝 0.4mm',
      source: 'ai', sectionCode: 'SEC-03', autoCreateOrder: true,
    },
    expect: 201,
  }, (d) => (d.disease?.code?.startsWith('YH-') && d.workOrder?.code ? null : '未自动建单'))
  if (disease?.disease?.id) {
    await expectOk('病害置为闭环', 'PATCH', `/diseases/${disease.disease.id}`, {
      body: { status: 'completed' },
    }, (d) => (d.repairedAt ? null : '未记录修复时间'))
  }
  const feedback = await expectOk('公众提交反馈', 'POST', '/feedback', {
    auth: '',
    body: { channel: 'miniapp', content: '自检：K2+900 路面积水', stake: 'K2+900' },
    expect: 201,
  })
  if (feedback?.id) {
    await expectOk('反馈转工单', 'POST', `/feedback/${feedback.id}/review`, {
      body: { decision: 'valid', convertToOrder: true, remark: '自检转单' },
    }, (d) => (d.feedback?.status === 'converted' && d.workOrder?.code ? null : '未转工单'))
  }

  console.log('\n[6] 写链路：设备与监测')
  await expectOk('设备状态回填', 'PATCH', `/devices/${deviceId}/status`, {
    body: { status: 'ok', runState: '自检回填' },
  }, (d) => (d.status === 'ok' ? null : '状态未更新'))
  await expectOk('写入遥测点', 'POST', `/devices/${deviceId}/telemetry`, {
    body: { metric: 'self_check', value: 1.23, unit: 'μ', quality: 'good' },
    expect: 201,
  })
  await expectOk('新建巡检任务', 'POST', '/monitoring/inspection-tasks', {
    body: { name: '自检巡检任务', cycle: 'daily', planDate: new Date().toISOString().slice(0, 10) },
    expect: 201,
  })

  console.log('\n[7] 写链路：交通与发布')
  const trafficEvent = await expectOk('上报 AI 事件（自动生成告警）', 'POST', '/traffic-events', {
    body: { type: 'parking', stake: 'K3+100', confidence: 93, cameraCode: 'CAM-C02' },
    expect: 201,
  }, (d) => (d.event?.code && d.alertCreated ? null : '未生成告警'))
  if (trafficEvent?.event?.id) {
    await expectOk('确认交通事件', 'PATCH', `/traffic-events/${trafficEvent.event.id}`, {
      body: { status: 'confirmed', remark: '自检确认' },
    })
  }
  await expectOk('写入流量采样', 'POST', '/traffic/flow', {
    body: { sectionCode: 'SEG-03', direction: 'north', flowVph: 1750, speedKmh: 61 },
    expect: 201,
  }, (d) => (d.congestion ? null : '未返回拥堵判定'))
  const publish = await expectOk('新建发布任务（提交审核）', 'POST', '/publish-tasks', {
    body: {
      title: '自检发布：前方施工请减速',
      content: '前方施工，请减速慢行',
      level: 'warning',
      channels: ['诱导屏'],
      boardIds: [1],
      submit: true,
    },
    expect: 201,
  }, (d) => (d.status === 'pending_review' ? null : `状态为 ${d.status}`))
  await expectStatus('值班员审核发布 403', 'POST', `/publish-tasks/${publish?.id}/review`, {
    body: { approve: true },
  }, 403)
  await expectOk('值班长审核发布', 'POST', `/publish-tasks/${publish?.id}/review`, {
    auth: 'admin',
    body: { approve: true },
  }, (d) => (d.status === 'published' ? null : `状态为 ${d.status}`))
  await expectOk('下刊发布内容', 'POST', `/publish-tasks/${publish?.id}/offline`, {}, (d) =>
    d.status === 'offline' ? null : `状态为 ${d.status}`)

  console.log('\n[8] 其他写接口')
  await expectOk('更新应急物资', 'PATCH', '/emergency/materials/1', { body: { quantity: 660 } }, (d) =>
    typeof d.quantity === 'number' ? null : '数量缺失')
  await expectOk('记录推演', 'POST', '/simulation-runs', {
    body: { scenario: 'flood', stepReached: 4, totalSteps: 5, note: '自检推演记录' },
    expect: 201,
  })
  await expectOk('发布对外预警', 'POST', '/public-notices', {
    auth: 'admin',
    body: { title: '自检预警：强降雨注意积水', level: 'yellow', channels: ['App推送'] },
    expect: 201,
  })
  await expectOk('批量确认告警', 'POST', '/alerts/batch-acknowledge', {
    body: { ids: [1, 2] },
  }, (d) => (typeof d.acknowledged === 'number' ? null : '缺少确认数量'))
  await expectOk('文章详情浏览计数', 'GET', '/safety-articles/1', { auth: '' }, (d) =>
    typeof d.views === 'number' ? null : '缺少浏览数')

  report()
}

function report() {
  const failed = checks.filter((c) => !c.ok)
  console.log('\n=== 自检结果 ===')
  console.log(`通过 ${checks.length - failed.length} / ${checks.length}`)
  if (failed.length) {
    for (const item of failed) console.log(`  ✘ ${item.name} — ${item.detail}`)
    process.exit(1)
  }
  console.log('全部通过 ✅')
  process.exit(0)
}

main().catch((error) => {
  console.error('自检脚本异常:', error)
  process.exit(1)
})
