/** 智慧监测：监测点位实时值、时序曲线、结构健康、巡检任务与周期维护 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { nextBizCode, withCodeRetry } from '../lib/code.js'

const TAGS = ['智慧监测']

const METRIC_META = {
  water_level: { label: '积水液位', unit: 'cm', warn: 15, alarm: 25 },
  co: { label: 'CO 浓度', unit: 'ppm', warn: 30, alarm: 50 },
  no2: { label: 'NO₂ 浓度', unit: 'ppm', warn: 0.15, alarm: 0.25 },
  illuminance: { label: '照度', unit: 'lux', warn: 220, alarm: 150, lowerIsWorse: true },
  settlement: { label: '沉降', unit: 'mm', warn: 1.0, alarm: 2.0 },
  strain: { label: '应力应变', unit: 'με', warn: 175, alarm: 200 },
  bolt_force: { label: '螺栓受力', unit: 'kN', warn: 20, alarm: 25 },
  pressure: { label: '管网压力', unit: 'MPa', warn: 0.45, alarm: 0.55 },
  fan_frequency: { label: '风机频率', unit: 'Hz', warn: 30, alarm: 45 },
  flow: { label: '断面流量', unit: 'veh/h', warn: 2000, alarm: 2300 },
}

export default async function monitoringRoutes(app) {
  app.get(
    '/monitoring/overview',
    {
      schema: {
        tags: TAGS,
        summary: '监测总览：最新读数 + 阈值判定',
        description:
          '按设备汇总最新遥测值并按阈值给出 normal/warn/alarm 判定，对应智慧监测页的环控与结构监测卡片。',
        querystring: Type.Object({
          group: Type.Optional(Type.Union([Type.Literal('env'), Type.Literal('monitor')])),
        }),
        response: {
          200: Envelope(
            Type.Object({
              generatedAt: Type.String(),
              items: Type.Array(
                Type.Object({
                  deviceId: Type.Integer(),
                  deviceCode: Type.String(),
                  deviceName: Type.String(),
                  stake: Type.String(),
                  group: Type.String(),
                  metric: Type.String(),
                  metricLabel: Type.String(),
                  unit: Type.Union([Type.String(), Type.Null()]),
                  value: Type.Number(),
                  recordedAt: Type.String(),
                  level: Type.String({ description: 'normal / warn / alarm' }),
                  threshold: Type.Object({
                    warn: Type.Union([Type.Number(), Type.Null()], { description: '预警阈值' }),
                    alarm: Type.Union([Type.Number(), Type.Null()], { description: '告警阈值' }),
                  }),
                }),
              ),
              summary: Type.Object({
                total: Type.Integer(),
                normal: Type.Integer(),
                warn: Type.Integer(),
                alarm: Type.Integer(),
              }),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const group = request.query.group
      const params = []
      let filter = ''
      if (group) {
        params.push(group)
        filter = `and d.group_code = $${params.length}`
      }
      const { rows } = await pool.query(
        `select distinct on (t.device_id, t.metric)
                t.device_id, d.code, d.name, d.stake, d.group_code, t.metric, t.unit, t.value, t.recorded_at
           from telemetry t join device d on d.id = t.device_id
          where t.recorded_at > now() - interval '7 days' ${filter}
          order by t.device_id, t.metric, t.recorded_at desc`,
        params,
      )
      const items = rows.map((row) => {
        const meta = METRIC_META[row.metric] ?? { label: row.metric, unit: row.unit, warn: null, alarm: null }
        const value = Number(row.value)
        let level = 'normal'
        if (meta.alarm != null && (meta.lowerIsWorse ? value <= meta.alarm : value >= meta.alarm)) level = 'alarm'
        else if (meta.warn != null && (meta.lowerIsWorse ? value <= meta.warn : value >= meta.warn)) level = 'warn'
        return {
          deviceId: row.device_id,
          deviceCode: row.code,
          deviceName: row.name,
          stake: row.stake,
          group: row.group_code,
          metric: row.metric,
          metricLabel: meta.label,
          unit: row.unit,
          value,
          recordedAt: row.recorded_at.toISOString(),
          level,
          threshold: { warn: meta.warn ?? null, alarm: meta.alarm ?? null },
        }
      })
      return reply.ok({
        generatedAt: new Date().toISOString(),
        items,
        summary: {
          total: items.length,
          normal: items.filter((i) => i.level === 'normal').length,
          warn: items.filter((i) => i.level === 'warn').length,
          alarm: items.filter((i) => i.level === 'alarm').length,
        },
      })
    },
  )

  app.get(
    '/monitoring/series',
    {
      schema: {
        tags: TAGS,
        summary: '多指标时序曲线',
        description: '一次取多条曲线（如 CO / NO₂ / 照度），用于同图对比。',
        querystring: Type.Object({
          metrics: Type.Optional(Type.String({ description: '逗号分隔，如 co,no2', example: 'co,no2' })),
          hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 2160, default: 24 })),
          bucket: Type.Optional(
            Type.Union([Type.Literal('raw'), Type.Literal('hour'), Type.Literal('day')], { default: 'raw' }),
          ),
        }),
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                metric: Type.String(),
                label: Type.String(),
                unit: Type.Union([Type.String(), Type.Null()]),
                points: Type.Array(Type.Object({ time: Type.String(), value: Type.Number() })),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const hours = request.query.hours ?? 24
      const bucket = request.query.bucket ?? 'raw'
      const params = [String(hours)]
      let metricFilter = ''
      if (request.query.metrics) {
        params.push(request.query.metrics.split(',').map((m) => m.trim()).filter(Boolean))
        metricFilter = `and metric = any($${params.length}::text[])`
      }
      const bucketSql =
        bucket === 'hour'
          ? `date_trunc('hour', recorded_at)`
          : bucket === 'day'
            ? `date_trunc('day', recorded_at)`
            : 'recorded_at'
      const { rows } = await pool.query(
        `select metric, unit, ${bucketSql} as bucket, avg(value)::numeric as value
           from telemetry
          where recorded_at > now() - ($1 || ' hours')::interval ${metricFilter}
          group by metric, unit, ${bucketSql}
          order by ${bucketSql}`,
        params,
      )
      const grouped = new Map()
      for (const row of rows) {
        if (!grouped.has(row.metric)) grouped.set(row.metric, { unit: row.unit, points: [] })
        grouped.get(row.metric).points.push({ time: row.bucket.toISOString(), value: Number(row.value) })
      }
      return reply.ok(
        [...grouped.entries()].map(([metric, value]) => ({
          metric,
          label: METRIC_META[metric]?.label ?? metric,
          unit: value.unit,
          points: value.points,
        })),
      )
    },
  )

  app.get(
    '/monitoring/structural-health',
    {
      schema: {
        tags: TAGS,
        summary: '结构健康评估',
        description: '按区段返回最新健康指数与历史趋势；score<70 视为重点观察。',
        response: {
          200: Envelope(
            Type.Object({
              latest: Type.Array(
                Type.Object({
                  sectionCode: Type.String(),
                  sectionName: Type.String(),
                  score: Type.Number(),
                  level: Type.String(),
                  evaluatedAt: Type.String(),
                }),
              ),
              trend: Type.Array(
                Type.Object({
                  sectionCode: Type.String(),
                  points: Type.Array(Type.Object({ time: Type.String(), score: Type.Number() })),
                }),
              ),
              overallIndex: Type.Number(),
              watchSections: Type.Array(Type.String()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const [latest, trend] = await Promise.all([
        pool.query(
          `select distinct on (section_code) section_code, section_name, score, level, evaluated_at
             from structural_health order by section_code, evaluated_at desc`,
        ),
        pool.query(
          `select section_code, evaluated_at, score from structural_health
            where evaluated_at > now() - interval '180 days'
            order by evaluated_at`,
        ),
      ])
      const trendMap = new Map()
      for (const row of trend.rows) {
        if (!trendMap.has(row.section_code)) trendMap.set(row.section_code, [])
        trendMap.get(row.section_code).push({ time: row.evaluated_at.toISOString(), score: Number(row.score) })
      }
      const latestRows = latest.rows.map((row) => ({
        sectionCode: row.section_code,
        sectionName: row.section_name,
        score: Number(row.score),
        level: row.level,
        evaluatedAt: row.evaluated_at.toISOString(),
      }))
      return reply.ok({
        latest: latestRows,
        trend: [...trendMap.entries()].map(([sectionCode, points]) => ({ sectionCode, points })),
        overallIndex: latestRows.length
          ? Number((latestRows.reduce((sum, r) => sum + r.score, 0) / latestRows.length).toFixed(1))
          : 0,
        watchSections: latestRows.filter((r) => r.score < 70).map((r) => r.sectionName),
      })
    },
  )

  app.get(
    '/monitoring/inspection-tasks',
    {
      schema: {
        tags: TAGS,
        summary: '巡检任务列表',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({ status: Type.Optional(Type.String()), cycle: Type.Optional(Type.String()) }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  code: Type.String(),
                  name: Type.String(),
                  cycle: Type.String(),
                  planDate: Type.String(),
                  status: Type.String(),
                  assigneeName: Type.Union([Type.String(), Type.Null()]),
                  coverage: Type.Number(),
                }),
              ),
              page: Type.Integer(),
              pageSize: Type.Integer(),
              total: Type.Integer(),
              totalPages: Type.Integer(),
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
      if (q.status) {
        params.push(q.status)
        conditions.push(`t.status = $${params.length}`)
      }
      if (q.cycle) {
        params.push(q.cycle)
        conditions.push(`t.cycle = $${params.length}`)
      }
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const { rows } = await pool.query(
        `select t.id, t.code, t.name, t.cycle, t.plan_date, t.status, t.coverage, u.display_name
           from inspection_task t left join sys_user u on u.id = t.assignee_id
           ${where} order by t.plan_date desc limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      )
      const count = await pool.query(`select count(*)::int as n from inspection_task t ${where}`, params)
      return reply.ok({
        items: rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          cycle: row.cycle,
          planDate: row.plan_date.toISOString().slice(0, 10),
          status: row.status,
          assigneeName: row.display_name,
          coverage: Number(row.coverage),
        })),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.post(
    '/monitoring/inspection-tasks',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '新建巡检任务',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          name: Type.String({ maxLength: 128 }),
          cycle: Type.Optional(Type.Union(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((v) => Type.Literal(v)))),
          planDate: Type.String({ format: 'date' }),
          assigneeId: Type.Optional(Type.Integer()),
          remark: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: {
          201: Envelope(
            Type.Object({ id: Type.Integer(), code: Type.String(), name: Type.String(), planDate: Type.String() }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { name, cycle = 'daily', planDate, assigneeId, remark } = request.body
      const rows = await withCodeRetry(async () => {
        const code = await nextBizCode({ one: async (text, params) => (await pool.query(text, params)).rows[0] }, {
          table: 'inspection_task',
          prefix: 'XJ',
          date: new Date(`${planDate}T00:00:00`),
        })
        const inserted = await pool.query(
          `insert into inspection_task (code, name, cycle, plan_date, status, assignee_id, remark)
           values ($1,$2,$3,$4,'planned',$5,$6) returning id, code, name, plan_date`,
          [code, name, cycle, planDate, assigneeId ?? null, remark ?? null],
        )
        return inserted.rows
      })
      return reply.code(201).ok({
        id: rows[0].id,
        code: rows[0].code,
        name: rows[0].name,
        planDate: rows[0].plan_date.toISOString().slice(0, 10),
      })
    },
  )

  app.patch(
    '/monitoring/inspection-tasks/:id',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '更新巡检任务执行状态与覆盖率',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          status: Type.Optional(Type.Union(['planned', 'running', 'done', 'missed'].map((v) => Type.Literal(v)))),
          coverage: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
        }),
        response: { 200: Envelope(Type.Object({ id: Type.Integer(), status: Type.String(), coverage: Type.Number() })) },
      },
    },
    async (request, reply) => {
      const { status, coverage } = request.body
      const { rows } = await pool.query(
        `update inspection_task set status = coalesce($1, status), coverage = coalesce($2, coverage), updated_at = now()
          where id = $3 returning id, status, coverage`,
        [status ?? null, coverage ?? null, request.params.id],
      )
      if (!rows.length) throw Errors.notFound('巡检任务不存在')
      return reply.ok({ id: rows[0].id, status: rows[0].status, coverage: Number(rows[0].coverage) })
    },
  )

  app.get(
    '/monitoring/maintenance-plans',
    {
      schema: {
        tags: TAGS,
        summary: '周期维护计划',
        description: '返回下次执行日期与到期状态（scheduled / due / overdue / done）。',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                id: Type.Integer(),
                name: Type.String(),
                cycle: Type.String(),
                nextDate: Type.String(),
                lastDate: Type.Union([Type.String(), Type.Null()]),
                ownerDept: Type.Union([Type.String(), Type.Null()]),
                status: Type.String(),
                daysToDue: Type.Integer(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select id, name, cycle, next_date, last_date, owner_dept, status,
                (next_date - now()::date) as days_to_due
           from maintenance_plan order by next_date`,
      )
      return reply.ok(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          cycle: row.cycle,
          nextDate: row.next_date.toISOString().slice(0, 10),
          lastDate: row.last_date ? row.last_date.toISOString().slice(0, 10) : null,
          ownerDept: row.owner_dept,
          status: row.status,
          daysToDue: Number(row.days_to_due),
        })),
      )
    },
  )
}
