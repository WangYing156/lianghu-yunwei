/** 告警中心：列表 / 详情 / 统计 / 确认 / 关闭 / 新增 / 批量确认 */
import { Type } from '@sinclair/typebox'
import { pool, withTransaction } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { Alert, AlertLevel, AlertStatus } from '../schemas/domain.js'

const TAGS = ['告警中心']

const ALERT_COLUMNS = `
  a.id, a.code, a.level, a.status, a.source, a.title, a.description, a.stake, a.point_id,
  a.group_code, a.kind, a.device_id, a.occurred_at, a.acked_at, a.closed_at, a.ack_note,
  d.name as device_name, u.display_name as acked_by_name,
  floor(extract(epoch from (now() - a.occurred_at)) / 60)::int as elapsed_minutes
`

function mapAlert(row) {
  return {
    id: row.id,
    code: row.code,
    level: row.level,
    status: row.status,
    source: row.source,
    title: row.title,
    description: row.description,
    stake: row.stake,
    pointId: row.point_id,
    group: row.group_code,
    kind: row.kind,
    deviceId: row.device_id,
    deviceName: row.device_name,
    occurredAt: row.occurred_at.toISOString(),
    ackedAt: row.acked_at?.toISOString() ?? null,
    ackedByName: row.acked_by_name,
    closedAt: row.closed_at?.toISOString() ?? null,
    elapsedMinutes: Math.max(0, row.elapsed_minutes ?? 0),
  }
}

export default async function alertRoutes(app) {
  app.get(
    '/alerts',
    {
      schema: {
        tags: TAGS,
        summary: '告警分页列表',
        description: '支持按等级、状态、来源、桩号、点位与时间范围筛选，默认按发生时间倒序。',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            level: Type.Optional(AlertLevel),
            status: Type.Optional(AlertStatus),
            source: Type.Optional(Type.String()),
            stake: Type.Optional(Type.String()),
            pointId: Type.Optional(Type.String()),
            keyword: Type.Optional(Type.String({ description: '标题/描述模糊搜索' })),
            from: Type.Optional(Type.String({ format: 'date-time' })),
            to: Type.Optional(Type.String({ format: 'date-time' })),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(Alert),
              page: Type.Integer(),
              pageSize: Type.Integer(),
              total: Type.Integer(),
              totalPages: Type.Integer(),
              summary: Type.Object({
                byLevel: Type.Array(Type.Object({ level: Type.String(), count: Type.Integer() })),
                byStatus: Type.Array(Type.Object({ status: Type.String(), count: Type.Integer() })),
              }),
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
      if (q.level) add(q.level, (i) => `a.level = $${i}`)
      if (q.status) add(q.status, (i) => `a.status = $${i}`)
      if (q.source) add(q.source, (i) => `a.source = $${i}`)
      if (q.stake) add(q.stake, (i) => `a.stake = $${i}`)
      if (q.pointId) add(q.pointId, (i) => `a.point_id = $${i}`)
      if (q.keyword) add(`%${q.keyword}%`, (i) => `(a.title ilike $${i} or a.description ilike $${i})`)
      if (q.from) add(q.from, (i) => `a.occurred_at >= $${i}`)
      if (q.to) add(q.to, (i) => `a.occurred_at <= $${i}`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

      const [list, count, byLevel, byStatus] = await Promise.all([
        pool.query(
          `select ${ALERT_COLUMNS}
             from alert a
             left join device d on d.id = a.device_id
             left join sys_user u on u.id = a.acked_by
             ${where}
            order by a.occurred_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from alert a ${where}`, params),
        pool.query(`select a.level, count(*)::int as count from alert a ${where} group by a.level`, params),
        pool.query(`select a.status, count(*)::int as count from alert a ${where} group by a.status`, params),
      ])
      return reply.ok({
        items: list.rows.map(mapAlert),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
        summary: { byLevel: byLevel.rows, byStatus: byStatus.rows },
      })
    },
  )

  app.get(
    '/alerts/active',
    {
      schema: {
        tags: TAGS,
        summary: '未关闭告警（横幅与告警面板数据源）',
        description: '按等级与时间排序，可直接作为顶部预警横幅和全局告警面板的数据源。',
        querystring: Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 10 })) }),
        response: { 200: Envelope(Type.Array(Alert)) },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? 10
      const { rows } = await pool.query(
        `select ${ALERT_COLUMNS}
           from alert a
           left join device d on d.id = a.device_id
           left join sys_user u on u.id = a.acked_by
          where a.status <> 'closed'
          order by case a.level when 'critical' then 1 when 'warning' then 2 when 'info' then 3 else 4 end,
                   a.occurred_at desc
          limit $1`,
        [limit],
      )
      return reply.ok(rows.map(mapAlert))
    },
  )

  app.get(
    '/alerts/stats',
    {
      schema: {
        tags: TAGS,
        summary: '告警统计（等级分布 / 趋势 / 来源 Top）',
        querystring: Type.Object({ hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 720, default: 24 })) }),
        response: {
          200: Envelope(
            Type.Object({
              hours: Type.Integer({ description: '统计时间窗口（小时）' }),
              total: Type.Integer({ description: '窗口内告警总数' }),
              open: Type.Integer({ description: '未确认数（全量）' }),
              acknowledged: Type.Integer({ description: '已确认数（全量）' }),
              closed: Type.Integer({ description: '已关闭数（全量）' }),
              meanAckMinutes: Type.Number({ description: '平均确认时长（分钟）' }),
              byLevel: Type.Array(Type.Object({ level: Type.String(), label: Type.String(), count: Type.Integer() })),
              bySource: Type.Array(Type.Object({ source: Type.String(), count: Type.Integer() })),
              trend: Type.Array(Type.Object({ bucket: Type.String(), count: Type.Integer() })),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const hours = request.query.hours ?? 24
      const [byLevel, bySource, byStatus, trend, meanAck] = await Promise.all([
        pool.query(
          `select level, count(*)::int as count from alert where occurred_at > now() - ($1 || ' hours')::interval group by level`,
          [String(hours)],
        ),
        pool.query(
          `select source, count(*)::int as count from alert where occurred_at > now() - ($1 || ' hours')::interval group by source order by count desc`,
          [String(hours)],
        ),
        pool.query('select status, count(*)::int as count from alert group by status'),
        pool.query(
          `select to_char(date_trunc('hour', occurred_at), 'MM-DD HH24:00') as bucket, count(*)::int as count
             from alert where occurred_at > now() - ($1 || ' hours')::interval
            group by date_trunc('hour', occurred_at) order by date_trunc('hour', occurred_at)`,
          [String(hours)],
        ),
        pool.query(
          `select coalesce(avg(extract(epoch from (acked_at - occurred_at)) / 60), 0)::numeric as minutes
             from alert where acked_at is not null`,
        ),
      ])
      const labels = { critical: '紧急', warning: '重要', info: '一般', notice: '提示' }
      const levelCount = Object.fromEntries(byLevel.rows.map((r) => [r.level, r.count]))
      const statusCount = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count]))
      return reply.ok({
        hours,
        total: Object.values(statusCount).reduce((a, b) => a + b, 0),
        open: statusCount.open ?? 0,
        acknowledged: statusCount.acknowledged ?? 0,
        closed: statusCount.closed ?? 0,
        meanAckMinutes: Number(Number(meanAck.rows[0].minutes).toFixed(1)),
        byLevel: ['critical', 'warning', 'info', 'notice'].map((level) => ({
          level,
          label: labels[level],
          count: levelCount[level] ?? 0,
        })),
        bySource: bySource.rows,
        trend: trend.rows,
      })
    },
  )

  app.get(
    '/alerts/:id',
    {
      schema: {
        tags: TAGS,
        summary: '告警详情（含处理时间线）',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              alert: Alert,
              timeline: Type.Array(
                Type.Object({
                  action: Type.String(),
                  status: Type.String(),
                  operator: Type.Union([Type.String(), Type.Null()]),
                  at: Type.String(),
                  remark: Type.Union([Type.String(), Type.Null()]),
                }),
              ),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select ${ALERT_COLUMNS}
           from alert a
           left join device d on d.id = a.device_id
           left join sys_user u on u.id = a.acked_by
          where a.id = $1`,
        [request.params.id],
      )
      if (!rows.length) throw Errors.notFound('告警不存在')
      const alert = mapAlert(rows[0])
      const timeline = [
        { action: '触发', status: 'open', operator: null, at: alert.occurredAt, remark: alert.title },
      ]
      if (alert.ackedAt) {
        timeline.push({
          action: '确认',
          status: 'acknowledged',
          operator: rows[0].acked_by_name,
          at: alert.ackedAt,
          remark: rows[0].ack_note,
        })
      }
      if (alert.closedAt) {
        timeline.push({ action: '关闭', status: 'closed', operator: null, at: alert.closedAt, remark: null })
      }
      return reply.ok({ alert, timeline })
    },
  )

  app.post(
    '/alerts',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '新增告警（IoT 网关或人工上报接入点）',
        description:
          '按 dedup_key 去重：同一点位同类型 5 分钟内的重复上报会合并到既有未关闭告警并返回 merged=true。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          level: AlertLevel,
          source: Type.String({ maxLength: 32, example: '智能交通' }),
          title: Type.String({ maxLength: 128 }),
          description: Type.Optional(Type.String({ maxLength: 1000 })),
          stake: Type.Optional(Type.String({ maxLength: 32 })),
          pointId: Type.Optional(Type.String({ maxLength: 48 })),
          group: Type.Optional(Type.String({ maxLength: 32 })),
          kind: Type.Optional(Type.String({ maxLength: 32 })),
          deviceCode: Type.Optional(Type.String({ maxLength: 48 })),
        }),
        response: { 201: Envelope(Type.Object({ alert: Alert, merged: Type.Boolean() })) },
      },
    },
    async (request, reply) => {
      const body = request.body
      const result = await withTransaction(async (tx) => {
        let deviceId = null
        if (body.deviceCode) {
          const device = await tx.one('select id from device where code = $1', [body.deviceCode])
          if (!device) throw Errors.badRequest(`设备不存在：${body.deviceCode}`)
          deviceId = device.id
        }
        const dedupKey = body.stake && body.kind ? `${body.group ?? ''}:${body.stake}:${body.kind}` : null
        if (dedupKey) {
          const existing = await tx.one(
            `select id from alert
              where dedup_key = $1 and status <> 'closed' and occurred_at > now() - interval '5 minutes'
              order by occurred_at desc limit 1`,
            [dedupKey],
          )
          if (existing) {
            const merged = await tx.one(
              `update alert set description = $1 where id = $2
                returning id, code, level, status, source, title, description, stake, point_id, group_code, kind,
                          device_id, occurred_at, acked_at, closed_at, 0::int as elapsed_minutes`,
              [body.description ?? body.title, existing.id],
            )
            return { merged: true, row: { ...merged, device_name: null, acked_by_name: null } }
          }
        }
        const code = `AL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
          Date.now() % 100000,
        ).padStart(5, '0')}`
        const row = await tx.one(
          `insert into alert (code, level, status, source, title, description, stake, point_id, group_code, kind, device_id, dedup_key)
           values ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning id, code, level, status, source, title, description, stake, point_id, group_code, kind,
                     device_id, occurred_at, acked_at, closed_at, 0::int as elapsed_minutes`,
          [
            code, body.level, body.source, body.title, body.description ?? '', body.stake ?? null,
            body.pointId ?? null, body.group ?? null, body.kind ?? null, deviceId, dedupKey,
          ],
        )
        return { merged: false, row: { ...row, device_name: null, acked_by_name: null } }
      })
      return reply.code(201).ok({ alert: mapAlert(result.row), merged: result.merged })
    },
  )

  app.post(
    '/alerts/:id/acknowledge',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '确认告警',
        description:
          '仅未确认(open)告警可确认；重复确认返回 409，避免值班重复操作。可选请求体 {"note":"确认说明"}，不传也可。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        response: { 200: Envelope(Alert) },
      },
    },
    async (request, reply) => {
      const note = request.body?.note ?? null
      const row = await withTransaction(async (tx) => {
        const current = await tx.one('select id, status from alert where id = $1 for update', [request.params.id])
        if (!current) throw Errors.notFound('告警不存在')
        if (current.status !== 'open') throw Errors.conflict(`当前告警状态为 ${current.status}，无需再次确认`)
        return tx.one(
          `update alert set status = 'acknowledged', acked_at = now(), acked_by = $2, ack_note = $3
            where id = $1
            returning id, code, level, status, source, title, description, stake, point_id, group_code, kind,
                      device_id, occurred_at, acked_at, closed_at, 0::int as elapsed_minutes`,
          [request.params.id, request.user.id, note],
        )
      })
      const detail = await pool.query(
        `select ${ALERT_COLUMNS} from alert a
           left join device d on d.id = a.device_id
           left join sys_user u on u.id = a.acked_by
          where a.id = $1`,
        [row.id],
      )
      return reply.ok(mapAlert(detail.rows[0]))
    },
  )

  app.post(
    '/alerts/:id/close',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '关闭告警',
        description: '可选请求体 {"note":"关闭说明"}；关闭会顺带补记确认人与确认时间。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        response: { 200: Envelope(Alert) },
      },
    },
    async (request, reply) => {
      const result = await withTransaction(async (tx) => {
        const current = await tx.one('select id, status from alert where id = $1 for update', [request.params.id])
        if (!current) throw Errors.notFound('告警不存在')
        if (current.status === 'closed') throw Errors.conflict('告警已关闭')
        await tx.query(
          `update alert set status = 'closed', closed_at = now(), closed_by = $2,
                  acked_at = coalesce(acked_at, now()), acked_by = coalesce(acked_by, $2),
                  ack_note = coalesce($3, ack_note)
            where id = $1`,
          [request.params.id, request.user.id, request.body?.note ?? null],
        )
        return true
      })
      void result
      const { rows } = await pool.query(
        `select ${ALERT_COLUMNS} from alert a
           left join device d on d.id = a.device_id
           left join sys_user u on u.id = a.acked_by
          where a.id = $1`,
        [request.params.id],
      )
      return reply.ok(mapAlert(rows[0]))
    },
  )

  app.post(
    '/alerts/batch-acknowledge',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '批量确认告警',
        security: [{ bearerAuth: [] }],
        body: Type.Object({ ids: Type.Array(Type.Integer(), { minItems: 1, maxItems: 100 }) }),
        response: {
          200: Envelope(Type.Object({ acknowledged: Type.Integer(), skipped: Type.Integer() })),
        },
      },
    },
    async (request, reply) => {
      const { ids } = request.body
      const { rows } = await pool.query(
        `update alert set status = 'acknowledged', acked_at = now(), acked_by = $1
          where id = any($2::bigint[]) and status = 'open' returning id`,
        [request.user.id, ids],
      )
      return reply.ok({ acknowledged: rows.length, skipped: ids.length - rows.length })
    },
  )
}
