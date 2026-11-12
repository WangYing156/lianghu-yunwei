/**
 * 幂等种子器：每次启动都会补齐缺失的演示数据（按业务编号冲突跳过），
 * 已有业务数据不会被覆盖，便于现场在演示库上继续录入真实数据。
 */
import { pool } from '../pool.js'
import { buildUsers } from './users.js'
import * as S from './scene.js'

const HOUR = 3600 * 1000

function ago(hours = 0, minutes = 0) {
  return new Date(Date.now() - hours * HOUR - minutes * 60 * 1000)
}

async function seedUsers(client) {
  for (const user of buildUsers()) {
    await client.query(
      `insert into sys_user (username, display_name, password_hash, role, phone, dept)
       values ($1,$2,$3,$4,$5,$6) on conflict (username) do nothing`,
      [user.username, user.name, user.passwordHash, user.role, user.phone, user.dept],
    )
  }
  const { rows } = await client.query('select id, username from sys_user')
  return new Map(rows.map((row) => [row.username, row.id]))
}

async function seedModules(client) {
  for (const m of S.MODULES) {
    await client.query(
      `insert into scene_module (code, name, path, icon, sort_no) values ($1,$2,$3,$4,$5)
       on conflict (code) do update set name = excluded.name, path = excluded.path, icon = excluded.icon, sort_no = excluded.sort_no`,
      [m.code, m.name, m.path, m.icon, m.sort],
    )
  }
}

async function seedSections(client) {
  for (const s of S.SECTIONS) {
    await client.query(
      `insert into tunnel_section (code, name, stake_start, stake_end, length_m, sort_no)
       values ($1,$2,$3,$4,$5,$6) on conflict (code) do nothing`,
      [s.code, s.name, s.start, s.end, s.length, s.sort],
    )
  }
}

async function seedCategories(client) {
  for (const c of S.CATEGORIES) {
    await client.query(
      `insert into device_category (code, name, icon, group_code, sort_no) values ($1,$2,$3,$4,$5)
       on conflict (code) do update set name = excluded.name, icon = excluded.icon, group_code = excluded.group_code, sort_no = excluded.sort_no`,
      [c.code, c.name, c.icon, c.group, c.sort],
    )
  }
}

async function seedDevices(client) {
  for (const d of S.DEVICES) {
    await client.query(
      `insert into device (code, name, category_code, group_code, stake, system_name, model, vendor, install_date,
                           status, card_group, run_state, ip, point_id, attrs, last_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (code) do nothing`,
      [
        d.code, d.name, d.category, d.group, d.stake,
        S.CATEGORIES.find((c) => c.code === d.category)?.name, d.model, d.vendor, d.install,
        d.status, d.card ?? null, d.run, d.ip ?? null, d.point,
        JSON.stringify({ source: 'seed', demo: true }), ago(0, Math.floor(Math.random() * 5)),
      ],
    )
  }
  const { rows } = await client.query('select id, code from device')
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function seedPoints(client, deviceIds) {
  for (const p of S.POINTS) {
    const deviceCode = S.ASSET_DEVICE_MAP[p.id] ?? S.DEVICES.find((d) => d.point === p.id)?.code
    await client.query(
      `insert into scene_point (id, module_code, name, kind, group_code, status, left_pct, top_pct, scale, stake,
                                value, alarm, inspect_on, device_id, sort_no)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do nothing`,
      [
        p.id, p.module, p.name, p.kind, p.group, p.status, p.left, p.top, p.scale, p.stake,
        p.value, p.alarm, p.inspect, deviceCode ? deviceIds.get(deviceCode) ?? null : null, p.sort,
      ],
    )
  }
  // 总览点位同时属于资产模块的共用目录；先保证每个模块至少有对应记录（overview 与 asset 共用一份）
  await client.query(`update scene_point set device_id = d.id from device d where scene_point.device_id is null and d.point_id = scene_point.id`)
}

async function seedAlerts(client, deviceIds, userIds) {
  const ackUser = userIds.get('operator') ?? null
  const closeUser = userIds.get('manager') ?? null
  for (const a of S.ALERTS) {
    const occurred = ago(0, a.minutesAgo)
    await client.query(
      `insert into alert (code, level, status, source, title, description, stake, point_id, group_code, kind,
                          device_id, dedup_key, occurred_at, acked_at, acked_by, closed_at, closed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (code) do nothing`,
      [
        a.code, a.level, a.status, a.source, a.title, a.description, a.stake, a.point, a.group, a.kind,
        a.device ? deviceIds.get(a.device) ?? null : null,
        `${a.group}:${a.stake}:${a.kind}`,
        occurred,
        a.status === 'open' ? null : new Date(occurred.getTime() + 12 * 60 * 1000),
        a.status === 'open' ? null : ackUser,
        a.status === 'closed' ? new Date(occurred.getTime() + 55 * 60 * 1000) : null,
        a.status === 'closed' ? closeUser : null,
      ],
    )
  }
  const { rows } = await client.query('select id, code from alert')
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function seedDiseases(client) {
  for (const d of S.DISEASES) {
    const found = ago(d.hoursAgo)
    await client.query(
      `insert into disease (code, type, severity, stake, section_code, description, source, status, point_id,
                            found_at, repaired_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (code) do nothing`,
      [
        d.code, d.type, d.severity, d.stake, d.section, d.description, d.source, d.status, d.point,
        found,
        d.status === 'completed' ? new Date(found.getTime() + 6 * HOUR) : null,
        new Date(found.getTime() + 2 * HOUR),
      ],
    )
  }
  const { rows } = await client.query('select id, code from disease')
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function seedWorkOrders(client, userIds, diseaseIds, alertIds) {
  const engineer = userIds.get('engineer') ?? null
  const operator = userIds.get('operator') ?? null
  const manager = userIds.get('manager') ?? null
  const orders = [
    { code: 'GD-20261016-01', type: 'repair', title: 'K3+200 拱顶裂缝修补', status: 'pending', priority: 'high', source: 'ai', stake: 'K3+200', disease: 'YH-20261016-01', hoursAgo: 4 },
    { code: 'GD-20261016-02', type: 'repair', title: 'K3+350 顶板渗漏水处理', status: 'processing', priority: 'urgent', source: 'public', stake: 'K3+350', disease: 'YH-20261016-02', hoursAgo: 6 },
    { code: 'GD-20261015-07', type: 'repair', title: 'K2+700 侧墙剥落修复', status: 'reviewing', priority: 'normal', source: 'inspection', stake: 'K2+700', disease: 'YH-20261015-07', hoursAgo: 18 },
    { code: 'GD-20261015-05', type: 'repair', title: 'K3+500 路面裂缝灌浆', status: 'completed', priority: 'normal', source: 'ai', stake: 'K3+500', disease: 'YH-20261015-05', hoursAgo: 22 },
    { code: 'GD-20261014-09', type: 'maintain', title: 'K2+450 侧墙渗水注浆', status: 'completed', priority: 'normal', source: 'inspection', stake: 'K2+450', disease: 'YH-20261014-09', hoursAgo: 30 },
    { code: 'GD-20261014-04', type: 'repair', title: 'K3+800 变形缝止水带更换', status: 'dispatched', priority: 'high', source: 'inspection', stake: 'K3+800', disease: 'YH-20261014-04', hoursAgo: 34 },
    { code: 'GD-20261018-11', type: 'emergency', title: 'K3+050 积水应急排涝', status: 'processing', priority: 'urgent', source: 'manual', stake: 'K3+050', alert: 'AL-20261018-0001', hoursAgo: 1 },
    { code: 'GD-20261018-12', type: 'inspection', title: 'K4+050 情报板离线排查', status: 'dispatched', priority: 'normal', source: 'manual', stake: 'K4+050', alert: 'AL-20261018-0003', hoursAgo: 2 },
    { code: 'GD-20261018-13', type: 'inspection', title: '全线照明回路季度巡检', status: 'pending', priority: 'low', source: 'manual', stake: 'K2+100~K4+300', hoursAgo: 3 },
    { code: 'GD-20261018-14', type: 'maintain', title: '射流风机半年保养', status: 'pending', priority: 'low', source: 'manual', stake: 'K2+900', hoursAgo: 5 },
    { code: 'GD-20261018-15', type: 'inspection', title: '排水沟清淤（全线）', status: 'processing', priority: 'normal', source: 'manual', stake: 'K2+100~K4+300', hoursAgo: 8 },
    { code: 'GD-20261018-16', type: 'repair', title: 'K3+800 变形缝复检', status: 'reviewing', priority: 'normal', source: 'inspection', stake: 'K3+800', hoursAgo: 12 },
  ]
  for (const o of orders) {
    const created = ago(o.hoursAgo)
    const done = o.status === 'completed'
    await client.query(
      `insert into work_order (code, type, title, description, status, priority, source, stake, disease_id, alert_id,
                               reporter_id, assignee_id, sla_hours, due_at, dispatched_at, completed_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (code) do nothing`,
      [
        o.code, o.type, o.title, `${o.title}（演示工单，可用于验证流转接口）`, o.status, o.priority, o.source, o.stake,
        o.disease ? diseaseIds.get(o.disease) ?? null : null,
        o.alert ? alertIds.get(o.alert) ?? null : null,
        operator, o.status === 'pending' ? null : engineer,
        o.priority === 'urgent' ? 4 : o.priority === 'high' ? 8 : 24,
        new Date(created.getTime() + (o.priority === 'urgent' ? 4 : 24) * HOUR),
        o.status === 'pending' ? null : new Date(created.getTime() + HOUR),
        done ? new Date(created.getTime() + 5 * HOUR) : null,
        created,
        created,
      ],
    )
    const { rows } = await client.query('select id from work_order where code = $1', [o.code])
    const orderId = rows[0]?.id
    if (!orderId) continue
    const { rows: logRows } = await client.query('select count(*)::int as n from work_order_log where work_order_id = $1', [orderId])
    if (logRows[0].n === 0) {
      await client.query(
        `insert into work_order_log (work_order_id, action, from_status, to_status, operator_id, remark, created_at)
         values ($1,'create',null,'pending',$2,'工单创建', $3)`,
        [orderId, operator, created],
      )
      if (o.status !== 'pending') {
        await client.query(
          `insert into work_order_log (work_order_id, action, from_status, to_status, operator_id, remark, created_at)
           values ($1,'dispatch','pending','dispatched',$2,'已派发至养护工程师', $3)`,
          [orderId, manager, new Date(created.getTime() + HOUR)],
        )
      }
    }
  }
}

async function seedMonitoring(client, userIds) {
  for (const task of S.INSPECTION_TASKS) {
    await client.query(
      `insert into inspection_task (code, name, cycle, plan_date, status, assignee_id, coverage)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (code) do nothing`,
      [task.code, task.name, task.cycle, task.plan, task.status, userIds.get('operator') ?? null, task.coverage],
    )
  }
  for (const plan of S.MAINTENANCE_PLANS) {
    const { rows } = await client.query('select 1 from maintenance_plan where name = $1', [plan.name])
    if (rows.length) continue
    await client.query(
      `insert into maintenance_plan (name, cycle, next_date, status) values ($1,$2,$3,$4)`,
      [plan.name, plan.cycle, plan.next, plan.status],
    )
  }
  for (const h of S.HEALTH) {
    const { rows } = await client.query(
      'select 1 from structural_health where section_code = $1 and evaluated_at > now() - interval \'6 hours\'',
      [h.section],
    )
    if (rows.length) continue
    await client.query(
      `insert into structural_health (section_code, section_name, score, level) values ($1,$2,$3,$4)`,
      [h.section, h.name, h.score, h.level],
    )
  }
}

async function seedTraffic(client) {
  for (const seg of S.SEGMENTS) {
    await client.query(
      `insert into traffic_segment (code, name, stake_start, stake_end, sort_no)
       values ($1,$2,$3,$4,$5) on conflict (code) do nothing`,
      [seg.code, seg.name, seg.start, seg.end, Number(seg.code.slice(-2))],
    )
  }
  for (const board of S.BOARD_ROWS) {
    await client.query(
      `insert into info_board (code, name, type, stake, status, content, point_id)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (code) do nothing`,
      [board.code, board.name, board.type, board.stake, board.status, board.content, board.point],
    )
  }
  for (const camera of S.CAMERAS) {
    await client.query(
      `insert into camera (code, name, type, stake, status, preview_url, point_id, ai_enabled, last_online_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (code) do nothing`,
      [
        camera.code, camera.name, camera.type, camera.stake, camera.status,
        `/img/cctv-${camera.preview}.svg`, camera.point, camera.ai, ago(0, 3),
      ],
    )
  }
  const { rows: camRows } = await client.query('select id, code from camera')
  const camIds = new Map(camRows.map((row) => [row.code, row.id]))
  for (const event of S.TRAFFIC_EVENTS) {
    await client.query(
      `insert into traffic_event (code, type, level, stake, confidence, status, camera_id, detected_at, handled_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (code) do nothing`,
      [
        event.code, event.type, event.level, event.stake, event.confidence, event.status,
        camIds.get(event.camera) ?? null,
        ago(0, event.minutesAgo),
        ['handled', 'ignored'].includes(event.status) ? ago(0, Math.max(1, event.minutesAgo - 15)) : null,
      ],
    )
  }
  // 流量：近 12 小时、5 个断面的双方向序列
  const { rows: flowRows } = await client.query('select count(*)::int as n from traffic_flow')
  if (flowRows[0].n === 0) {
    for (let h = 11; h >= 0; h -= 1) {
      for (const seg of S.SEGMENTS) {
        const wave = Math.sin(((11 - h) / 11) * Math.PI)
        for (const [direction, factor] of [['north', 1], ['south', 0.92]]) {
          const flow = Math.round(seg.flow * (0.45 + 0.55 * wave) * factor)
          await client.query(
            `insert into traffic_flow (section_code, direction, flow_vph, speed_kmh, occupancy, congestion, recorded_at)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [
              seg.code, direction, flow,
              Number((72 - Math.min(28, flow / 90)).toFixed(1)),
              Number((flow / 45).toFixed(2)),
              seg.congestion, ago(h),
            ],
          )
        }
      }
    }
  }
}

async function seedPublishFeedbackService(client, userIds, alertIds) {
  const operator = userIds.get('operator') ?? null
  const manager = userIds.get('manager') ?? null
  const publishes = [
    { taskNo: 'FB-20261018-01', title: 'K3 段积水处置，请减速慢行', content: '前方 200m 积水，请减速慢行', level: 'emergency', status: 'published', channels: ['诱导屏', 'App推送'], hoursAgo: 6, reach: 126000 },
    { taskNo: 'FB-20261018-02', title: '雨天路滑，保持车距', content: '雨天路滑，注意车距', level: 'warning', status: 'published', channels: ['情报板'], hoursAgo: 11, reach: 98000 },
    { taskNo: 'FB-20261018-03', title: '前方畅通，限速 60', content: '前方畅通，限速 60', level: 'normal', status: 'published', channels: ['诱导屏'], hoursAgo: 54, reach: 72000 },
    { taskNo: 'FB-20261018-04', title: '夜间养护施工，临时占用左道', content: '夜间养护施工，临时占用左道', level: 'info', status: 'pending_review', channels: ['情报板', 'App推送'], hoursAgo: 12, reach: 0 },
  ]
  for (const p of publishes) {
    const created = ago(p.hoursAgo)
    await client.query(
      `insert into publish_task (task_no, title, content, level, channels, status, created_by, reviewed_by,
                                 published_at, reach_count, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (task_no) do nothing`,
      [
        p.taskNo, p.title, p.content, p.level, p.channels, p.status, operator,
        p.status === 'published' ? manager : null,
        p.status === 'published' ? created : null, p.reach, created, created,
      ],
    )
  }
  for (const f of S.FEEDBACKS) {
    await client.query(
      `insert into feedback (code, channel, content, stake, point_id, status, created_at, handled_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (code) do nothing`,
      [
        f.code, f.channel, f.content, f.stake, f.point, f.status,
        ago(0, f.minutesAgo),
        f.status === 'pending' ? null : ago(0, Math.max(1, f.minutesAgo - 30)),
      ],
    )
  }
  for (const n of S.NOTICES) {
    const { rows } = await client.query('select 1 from public_notice where title = $1', [n.title])
    if (rows.length) continue
    await client.query(
      `insert into public_notice (title, content, level, channels, status, published_at, reach_count)
       values ($1,$2,$3,$4,'published',$5,$6)`,
      [n.title, n.title, n.level, n.channels, ago(n.hoursAgo), n.reach],
    )
  }
  for (const a of S.ARTICLES) {
    const { rows } = await client.query('select 1 from safety_article where title = $1', [a.title])
    if (rows.length) continue
    await client.query(
      `insert into safety_article (title, category, icon, summary, content, views, published_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [a.title, a.category, a.icon, a.summary, a.summary, a.views, ago(a.daysAgo * 24)],
    )
  }
  for (const m of S.MATERIALS) {
    const { rows } = await client.query('select 1 from emergency_material where name = $1 and site = $2', [m.name, m.site])
    if (rows.length) continue
    await client.query(
      `insert into emergency_material (name, site, stake, quantity, unit, sufficient) values ($1,$2,$3,$4,$5,$6)`,
      [m.name, m.site, m.stake, m.quantity, m.unit, m.sufficient],
    )
  }
  const { rows: simRows } = await client.query('select count(*)::int as n from simulation_run')
  if (simRows[0].n === 0) {
    for (const run of S.SIMULATION_RUNS) {
      await client.query(
        `insert into simulation_run (scenario, operator_id, step_reached, total_steps, immersive, started_at, ended_at, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [run.scenario, operator, run.stepReached, run.totalSteps, run.immersive, ago(run.hoursAgo), ago(run.hoursAgo, -40), run.note],
      )
    }
  }
  void alertIds
}

async function seedTelemetry(client, deviceIds) {
  const { rows } = await client.query('select count(*)::int as n from telemetry')
  if (rows[0].n > 0) return
  for (const series of S.TELEMETRY_SERIES) {
    const deviceId = deviceIds.get(series.device)
    if (!deviceId) continue
    const count = series.points.length
    for (let i = 0; i < count; i += 1) {
      const minutesAgo = (count - 1 - i) * series.stepMinutes
      await client.query(
        `insert into telemetry (device_id, metric, unit, value, quality, recorded_at)
         values ($1,$2,$3,$4,'good',$5)`,
        [deviceId, series.metric, series.unit, series.points[i], ago(0, minutesAgo)],
      )
    }
  }
}

export async function seedDatabase({ silent = false } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userIds = await seedUsers(client)
    await seedModules(client)
    await seedSections(client)
    await seedCategories(client)
    const deviceIds = await seedDevices(client)
    await seedPoints(client, deviceIds)
    const alertIds = await seedAlerts(client, deviceIds, userIds)
    const diseaseIds = await seedDiseases(client)
    await seedWorkOrders(client, userIds, diseaseIds, alertIds)
    await seedMonitoring(client, userIds)
    await seedTraffic(client)
    await seedPublishFeedbackService(client, userIds, alertIds)
    await seedTelemetry(client, deviceIds)
    await client.query('COMMIT')
    if (!silent) console.log('[seed] 演示数据已就绪（幂等，不会覆盖已有业务数据）')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** 空库判断：没有任何设备或告警时视为需要初始化 */
export async function isDatabaseEmpty() {
  const { rows } = await pool.query('select (select count(*) from device) as devices, (select count(*) from alert) as alerts')
  return Number(rows[0].devices) === 0 && Number(rows[0].alerts) === 0
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seedDatabase()
    .then(async () => {
      await pool.end()
    })
    .catch(async (error) => {
      console.error('[seed] 失败:', error.message)
      await pool.end().catch(() => {})
      process.exit(1)
    })
}
