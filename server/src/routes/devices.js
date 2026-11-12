/** 设备台账：列表 / 详情 / 状态汇总 / 遥测 / 状态更新 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { Device, DeviceStatus, TimeSeries } from '../schemas/domain.js'

const TAGS = ['设备台账']

const DEVICE_SELECT = `
  d.id, d.code, d.name, d.category_code, c.name as category_name, d.group_code, d.stake,
  d.position_desc, d.system_name, d.model, d.vendor, d.install_date, d.status, d.card_group,
  d.run_state, d.ip, d.point_id, d.attrs, d.last_seen_at,
  (select count(*)::int from alert a where a.device_id = d.id and a.status <> 'closed') as open_alert_count
`

function mapDevice(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    group: row.group_code,
    stake: row.stake,
    positionDesc: row.position_desc,
    systemName: row.system_name,
    model: row.model,
    vendor: row.vendor,
    installDate: row.install_date ? row.install_date.toISOString().slice(0, 10) : null,
    status: row.status,
    cardGroup: row.card_group,
    runState: row.run_state,
    ip: row.ip,
    pointId: row.point_id,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    openAlertCount: row.open_alert_count ?? 0,
  }
}

export default async function deviceRoutes(app) {
  app.get(
    '/device-categories',
    {
      schema: {
        tags: TAGS,
        summary: '设备分类字典（含数量与状态分布）',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                code: Type.String(),
                name: Type.String(),
                icon: Type.Union([Type.String(), Type.Null()]),
                group: Type.String(),
                total: Type.Integer(),
                ok: Type.Integer(),
                fault: Type.Integer(),
                offline: Type.Integer(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select c.code, c.name, c.icon, c.group_code, c.sort_no,
                count(d.id)::int as total,
                count(d.id) filter (where d.status = 'ok')::int as ok,
                count(d.id) filter (where d.status in ('warn', 'alarm'))::int as fault,
                count(d.id) filter (where d.status = 'offline')::int as offline
           from device_category c
           left join device d on d.category_code = c.code
          group by c.code, c.name, c.icon, c.group_code, c.sort_no
          order by c.sort_no`,
      )
      return reply.ok(
        rows.map((row) => ({
          code: row.code,
          name: row.name,
          icon: row.icon,
          group: row.group_code,
          total: row.total,
          ok: row.ok,
          fault: row.fault,
          offline: row.offline,
        })),
      )
    },
  )

  app.get(
    '/devices',
    {
      schema: {
        tags: TAGS,
        summary: '设备分页列表',
        description: '支持按分类、分组、状态、桩号、关键字搜索，并可按状态/编号/桩号排序。',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            category: Type.Optional(Type.String()),
            group: Type.Optional(Type.String()),
            status: Type.Optional(DeviceStatus),
            stake: Type.Optional(Type.String()),
            keyword: Type.Optional(Type.String({ description: '编号 / 名称 / 型号模糊搜索' })),
            sort: Type.Optional(
              Type.Union([Type.Literal('code'), Type.Literal('stake'), Type.Literal('status'), Type.Literal('name')], {
                default: 'code',
              }),
            ),
            order: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'asc' })),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(Device),
              page: Type.Integer(),
              pageSize: Type.Integer(),
              total: Type.Integer(),
              totalPages: Type.Integer(),
              byStatus: Type.Array(Type.Object({ status: Type.String(), count: Type.Integer() })),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const q = request.query
      const { page, pageSize, offset, limit } = pagination(q)
      const conditions = []
      const params = []
      const add = (value, sql) => {
        params.push(value)
        conditions.push(sql(params.length))
      }
      if (q.category) add(q.category, (i) => `d.category_code = $${i}`)
      if (q.group) add(q.group, (i) => `d.group_code = $${i}`)
      if (q.status) add(q.status, (i) => `d.status = $${i}`)
      if (q.stake) add(q.stake, (i) => `d.stake = $${i}`)
      if (q.keyword) add(`%${q.keyword}%`, (i) => `(d.code ilike $${i} or d.name ilike $${i} or d.model ilike $${i})`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const sortColumn = { code: 'd.code', stake: 'd.stake', status: 'd.status', name: 'd.name' }[q.sort ?? 'code']
      const direction = q.order === 'desc' ? 'desc' : 'asc'
      const [list, count, byStatus] = await Promise.all([
        pool.query(
          `select ${DEVICE_SELECT}
             from device d join device_category c on c.code = d.category_code
             ${where}
            order by ${sortColumn} ${direction}
            limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(
          `select count(*)::int as n from device d join device_category c on c.code = d.category_code ${where}`,
          params,
        ),
        pool.query(
          `select d.status, count(*)::int as count from device d ${where} group by d.status`,
          params,
        ),
      ])
      return reply.ok({
        items: list.rows.map(mapDevice),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
        byStatus: byStatus.rows,
      })
    },
  )

  app.get(
    '/devices/:id',
    {
      schema: {
        tags: TAGS,
        summary: '设备详情：台账 + 最近遥测 + 未关闭告警 + 关联工单',
        description: '资产资料中心面板可直接使用该接口；未建档构件可回退到 BIM 构件属性。',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              device: Device,
              telemetry: Type.Array(
                Type.Object({
                  metric: Type.String(),
                  unit: Type.Union([Type.String(), Type.Null()]),
                  latest: Type.Union([Type.Number(), Type.Null()], { description: '最新读数' }),
                  recordedAt: Type.Union([Type.String(), Type.Null()]),
                  min: Type.Union([Type.Number(), Type.Null()], { description: '窗口最小值' }),
                  max: Type.Union([Type.Number(), Type.Null()], { description: '窗口最大值' }),
                }),
              ),
              alerts: Type.Array(Type.Any()),
              workOrders: Type.Array(Type.Any()),
              point: Type.Union([Type.Any(), Type.Null()]),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { rows } = await pool.query(
        `select ${DEVICE_SELECT} from device d join device_category c on c.code = d.category_code where d.id = $1`,
        [id],
      )
      if (!rows.length) throw Errors.notFound('设备不存在')
      const [telemetry, alerts, orders, point] = await Promise.all([
        pool.query(
          `select metric, unit,
                  (array_agg(value order by recorded_at desc))[1] as latest,
                  max(recorded_at) as recorded_at,
                  min(value) as min_value,
                  max(value) as max_value
             from telemetry where device_id = $1 group by metric, unit`,
          [id],
        ),
        pool.query(
          `select id, code, level, status, title, occurred_at from alert
            where device_id = $1 order by occurred_at desc limit 10`,
          [id],
        ),
        pool.query(
          `select w.id, w.code, w.title, w.status, w.priority, w.created_at, u.display_name as assignee
             from work_order w left join sys_user u on u.id = w.assignee_id
            where w.stake = $1 order by w.created_at desc limit 5`,
          [rows[0].stake],
        ),
        pool.query('select * from scene_point where device_id = $1 limit 1', [id]),
      ])
      return reply.ok({
        device: mapDevice(rows[0]),
        telemetry: telemetry.rows.map((row) => ({
          metric: row.metric,
          unit: row.unit,
          latest: row.latest == null ? null : Number(row.latest),
          recordedAt: row.recorded_at?.toISOString() ?? null,
          min: row.min_value == null ? null : Number(row.min_value),
          max: row.max_value == null ? null : Number(row.max_value),
        })),
        alerts: alerts.rows.map((row) => ({
          id: row.id,
          code: row.code,
          level: row.level,
          status: row.status,
          title: row.title,
          occurredAt: row.occurred_at.toISOString(),
        })),
        workOrders: orders.rows.map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status,
          priority: row.priority,
          assignee: row.assignee,
          createdAt: row.created_at.toISOString(),
        })),
        point: point.rows[0]
          ? {
              id: point.rows[0].id,
              name: point.rows[0].name,
              stake: point.rows[0].stake,
              left: `${Number(point.rows[0].left_pct)}%`,
              top: `${Number(point.rows[0].top_pct)}%`,
            }
          : null,
      })
    },
  )

  app.get(
    '/devices/:id/telemetry',
    {
      schema: {
        tags: TAGS,
        summary: '设备遥测时序',
        description: '按指标返回时间序列，用于监测页折线图；数据来源为遥测表（演示为脚本序列）。',
        params: Type.Object({ id: Type.Integer() }),
        querystring: Type.Object({
          metric: Type.Optional(Type.String()),
          hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 2160, default: 72 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 200 })),
        }),
        response: { 200: Envelope(Type.Array(TimeSeries)) },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const hours = request.query.hours ?? 72
      const limit = request.query.limit ?? 200
      const device = await pool.query(
        'select id, code, name from device where id = $1',
        [id],
      )
      if (!device.rows.length) throw Errors.notFound('设备不存在')
      const params = [id, String(hours)]
      let metricFilter = ''
      if (request.query.metric) {
        params.push(request.query.metric)
        metricFilter = `and metric = $${params.length}`
      }
      params.push(limit)
      const { rows } = await pool.query(
        `select metric, unit, value, recorded_at from telemetry
          where device_id = $1 and recorded_at > now() - ($2 || ' hours')::interval ${metricFilter}
          order by recorded_at asc limit $${params.length}`,
        params,
      )
      const grouped = new Map()
      for (const row of rows) {
        if (!grouped.has(row.metric)) grouped.set(row.metric, [])
        grouped.get(row.metric).push(row)
      }
      return reply.ok(
        [...grouped.entries()].map(([metric, points]) => ({
          deviceId: device.rows[0].id,
          deviceCode: device.rows[0].code,
          deviceName: device.rows[0].name,
          metric,
          unit: points[0].unit,
          points: points.map((p) => ({ time: p.recorded_at.toISOString(), value: Number(p.value) })),
        })),
      )
    },
  )

  app.patch(
    '/devices/:id/status',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '更新设备运行状态（心跳/巡检回填）',
        description: '更新状态与运行描述，同时刷新 last_seen_at；用于模拟站点状态回传。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          status: DeviceStatus,
          runState: Type.Optional(Type.String({ maxLength: 64 })),
        }),
        response: { 200: Envelope(Device) },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { status, runState } = request.body
      const { rows } = await pool.query(
        `update device set status = $1, run_state = coalesce($2, run_state), last_seen_at = now(), updated_at = now()
          where id = $3 returning id`,
        [status, runState ?? null, id],
      )
      if (!rows.length) throw Errors.notFound('设备不存在')
      const detail = await pool.query(
        `select ${DEVICE_SELECT} from device d join device_category c on c.code = d.category_code where d.id = $1`,
        [id],
      )
      return reply.ok(mapDevice(detail.rows[0]))
    },
  )

  app.post(
    '/devices/:id/telemetry',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '写入设备遥测点（IoT 网关接入点）',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.Integer() }),
        body: Type.Object({
          metric: Type.String({ maxLength: 48 }),
          value: Type.Number(),
          unit: Type.Optional(Type.String({ maxLength: 16 })),
          quality: Type.Optional(Type.Union([Type.Literal('good'), Type.Literal('suspect'), Type.Literal('bad')])),
          recordedAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
        response: {
          201: Envelope(
            Type.Object({
              id: Type.Integer(),
              deviceId: Type.Integer(),
              metric: Type.String(),
              value: Type.Number(),
              recordedAt: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const { metric, value, unit, quality = 'good', recordedAt } = request.body
      const device = await pool.query('select id from device where id = $1', [id])
      if (!device.rows.length) throw Errors.notFound('设备不存在')
      const { rows } = await pool.query(
        `insert into telemetry (device_id, metric, unit, value, quality, recorded_at)
         values ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now()))
         returning id, device_id, metric, value, recorded_at`,
        [id, metric, unit ?? null, value, quality, recordedAt ?? null],
      )
      await pool.query('update device set last_seen_at = now() where id = $1', [id])
      return reply.code(201).ok({
        id: rows[0].id,
        deviceId: rows[0].device_id,
        metric: rows[0].metric,
        value: Number(rows[0].value),
        recordedAt: rows[0].recorded_at.toISOString(),
      })
    },
  )
}
