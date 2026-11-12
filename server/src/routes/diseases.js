/** 病害台账：发现 → 派发 → 维修 → 验收 → 闭环；统计与趋势供智慧养护页 */
import { Type } from '@sinclair/typebox'
import { pool, withTransaction } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { Disease } from '../schemas/domain.js'
import { nextBizCode, withCodeRetry } from '../lib/code.js'

const TAGS = ['病害养护']

const DISEASE_SELECT = `
  d.id, d.code, d.type, d.severity, d.stake, d.section_code, d.description, d.source, d.status,
  d.point_id, d.found_at, d.repaired_at,
  round(extract(epoch from (coalesce(d.repaired_at, now()) - d.found_at)) / 3600, 1) as elapsed_hours
`

function mapDisease(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    severity: row.severity,
    stake: row.stake,
    sectionCode: row.section_code,
    description: row.description,
    source: row.source,
    status: row.status,
    pointId: row.point_id,
    foundAt: row.found_at.toISOString(),
    repairedAt: row.repaired_at?.toISOString() ?? null,
    elapsedHours: Number(row.elapsed_hours ?? 0),
  }
}

export default async function diseaseRoutes(app) {
  app.get(
    '/diseases',
    {
      schema: {
        tags: TAGS,
        summary: '病害分页列表',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            type: Type.Optional(Type.String()),
            severity: Type.Optional(Type.String()),
            status: Type.Optional(Type.String()),
            source: Type.Optional(Type.String()),
            sectionCode: Type.Optional(Type.String()),
            keyword: Type.Optional(Type.String()),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(Disease),
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
      const add = (value, sql) => {
        params.push(value)
        conditions.push(sql(params.length))
      }
      if (q.type) add(q.type, (i) => `d.type = $${i}`)
      if (q.severity) add(q.severity, (i) => `d.severity = $${i}`)
      if (q.status) add(q.status.split(','), (i) => `d.status = any($${i}::text[])`)
      if (q.source) add(q.source, (i) => `d.source = $${i}`)
      if (q.sectionCode) add(q.sectionCode, (i) => `d.section_code = $${i}`)
      if (q.keyword) add(`%${q.keyword}%`, (i) => `(d.code ilike $${i} or d.description ilike $${i})`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const [list, count] = await Promise.all([
        pool.query(
          `select ${DISEASE_SELECT} from disease d ${where}
            order by d.found_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from disease d ${where}`, params),
      ])
      return reply.ok({
        items: list.rows.map(mapDisease),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.get(
    '/diseases/stats',
    {
      schema: {
        tags: TAGS,
        summary: '病害统计（类型分布 / 来源 / 闭环漏斗 / 月度趋势 / 区段健康）',
        description: '对应智慧养护页的「病害维修闭环」「病害统计」「结构健康评估」三块内容。',
        querystring: Type.Object({ months: Type.Optional(Type.Integer({ minimum: 1, maximum: 24, default: 6 })) }),
        response: {
          200: Envelope(
            Type.Object({
              funnel: Type.Array(Type.Object({ status: Type.String(), label: Type.String(), count: Type.Integer() })),
              byType: Type.Array(Type.Object({ type: Type.String(), label: Type.String(), count: Type.Integer() })),
              bySource: Type.Array(Type.Object({ source: Type.String(), label: Type.String(), count: Type.Integer() })),
              bySeverity: Type.Array(Type.Object({ severity: Type.String(), label: Type.String(), count: Type.Integer() })),
              trend: Type.Array(Type.Object({ month: Type.String(), created: Type.Integer(), closed: Type.Integer() })),
              health: Type.Array(
                Type.Object({
                  sectionCode: Type.String(),
                  sectionName: Type.String(),
                  score: Type.Number(),
                  level: Type.String(),
                  evaluatedAt: Type.String(),
                }),
              ),
              watchAdvice: Type.Union([Type.String(), Type.Null()]),
              meanCloseHours: Type.Number(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const months = request.query.months ?? 6
      const [byStatus, byType, bySource, bySeverity, trend, health, meanHours] = await Promise.all([
        pool.query('select status, count(*)::int as count from disease group by status'),
        pool.query('select type, count(*)::int as count from disease group by type order by count desc'),
        pool.query('select source, count(*)::int as count from disease group by source'),
        pool.query('select severity, count(*)::int as count from disease group by severity'),
        pool.query(
          `with months as (
             select generate_series(date_trunc('month', now()) - ($1::int - 1) * interval '1 month',
                                    date_trunc('month', now()), interval '1 month') as m
           )
           select to_char(months.m, 'YYYY-MM') as month,
                  (select count(*)::int from disease d where date_trunc('month', d.found_at) = months.m) as created,
                  (select count(*)::int from disease d
                    where d.repaired_at is not null and date_trunc('month', d.repaired_at) = months.m) as closed
             from months order by months.m`,
          [months],
        ),
        pool.query(
          `select distinct on (section_code) section_code, section_name, score, level, evaluated_at
             from structural_health order by section_code, evaluated_at desc`,
        ),
        pool.query(
          `select coalesce(avg(extract(epoch from (repaired_at - found_at)) / 3600), 0)::numeric as hours
             from disease where repaired_at is not null`,
        ),
      ])
      const statusLabels = {
        found: '病害发现',
        dispatched: '审核派发',
        repairing: '维修处置',
        reviewing: '现场验收',
        completed: '闭环归档',
        rejected: '已驳回',
      }
      const typeLabels = {
        crack: '裂缝',
        seepage: '渗漏水',
        spalling: '剥落',
        joint: '变形缝',
        corrosion: '腐蚀',
        other: '其他',
      }
      const sourceLabels = { manual: '人工巡检', ai: 'AI 识别', public: '公众反馈' }
      const severityLabels = { slight: '轻微', medium: '中等', severe: '严重' }
      const healthRows = health.rows.map((row) => ({
        sectionCode: row.section_code,
        sectionName: row.section_name,
        score: Number(row.score),
        level: row.level,
        evaluatedAt: row.evaluated_at.toISOString(),
      }))
      const watch = healthRows.filter((row) => row.score < 70)
      return reply.ok({
        funnel: Object.entries(statusLabels).map(([status, label]) => ({
          status,
          label,
          count: byStatus.rows.find((r) => r.status === status)?.count ?? 0,
        })),
        byType: byType.rows.map((row) => ({ type: row.type, label: typeLabels[row.type] ?? row.type, count: row.count })),
        bySource: bySource.rows.map((row) => ({
          source: row.source,
          label: sourceLabels[row.source] ?? row.source,
          count: row.count,
        })),
        bySeverity: bySeverity.rows.map((row) => ({
          severity: row.severity,
          label: severityLabels[row.severity] ?? row.severity,
          count: row.count,
        })),
        trend: trend.rows.map((row) => ({ month: row.month, created: row.created, closed: row.closed })),
        health: healthRows,
        watchAdvice: watch.length
          ? `${watch.map((row) => row.sectionName).join('、')} 健康指数低于 70（重点观察），建议安排结构复测与渗漏水专项维修。`
          : null,
        meanCloseHours: Number(Number(meanHours.rows[0].hours).toFixed(1)),
      })
    },
  )

  app.get(
    '/diseases/:id',
    {
      schema: {
        tags: TAGS,
        summary: '病害详情（含关联工单）',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              disease: Disease,
              workOrders: Type.Array(Type.Any()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(`select ${DISEASE_SELECT} from disease d where d.id = $1`, [request.params.id])
      if (!rows.length) throw Errors.notFound('病害记录不存在')
      const orders = await pool.query(
        `select id, code, title, status, priority, created_at from work_order where disease_id = $1 order by created_at desc`,
        [request.params.id],
      )
      return reply.ok({
        disease: mapDisease(rows[0]),
        workOrders: orders.rows.map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status,
          priority: row.priority,
          createdAt: row.created_at.toISOString(),
        })),
      })
    },
  )

  app.post(
    '/diseases',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '上报病害',
        description: '公众反馈或 AI 识别转病害时使用；created 成功后可按需再建工单（autoCreateOrder=true 会自动建单）。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          type: Type.Union(['crack', 'seepage', 'spalling', 'joint', 'corrosion', 'other'].map((v) => Type.Literal(v))),
          severity: Type.Union(['slight', 'medium', 'severe'].map((v) => Type.Literal(v))),
          stake: Type.String({ maxLength: 32 }),
          description: Type.String({ maxLength: 2000 }),
          source: Type.Union(['manual', 'ai', 'public'].map((v) => Type.Literal(v))),
          sectionCode: Type.Optional(Type.String({ maxLength: 32 })),
          pointId: Type.Optional(Type.String({ maxLength: 48 })),
          autoCreateOrder: Type.Optional(Type.Boolean({ default: false, description: '是否同时创建维修工单' })),
        }),
        response: {
          201: Envelope(
            Type.Object({
              disease: Disease,
              workOrder: Type.Union([Type.Any(), Type.Null()]),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const result = await withCodeRetry(() => withTransaction(async (tx) => {
        const code = await nextBizCode(tx, { table: 'disease', prefix: 'YH' })
        const row = await tx.one(
          `insert into disease (code, type, severity, stake, section_code, description, source, status, point_id)
           values ($1,$2,$3,$4,$5,$6,$7,'found',$8) returning id`,
          [code, body.type, body.severity, body.stake, body.sectionCode ?? null, body.description, body.source, body.pointId ?? null],
        )
        let order = null
        if (body.autoCreateOrder) {
          const slaHours = body.severity === 'severe' ? 2 : body.severity === 'medium' ? 8 : 24
          const orderCode = await nextBizCode(tx, { table: 'work_order', prefix: 'GD' })
          const orderRow = await tx.one(
            `insert into work_order (code, type, title, description, status, priority, source, stake, disease_id, reporter_id, sla_hours, due_at)
             values ($1,'repair',$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10::timestamptz) returning id`,
            [
              orderCode,
              `${body.type} 病害处置（${body.stake}）`,
              body.description,
              body.severity === 'severe' ? 'urgent' : body.severity === 'medium' ? 'high' : 'normal',
              body.source,
              body.stake,
              row.id,
              request.user.id,
              slaHours,
              new Date(Date.now() + slaHours * 3600 * 1000),
            ],
          )
          await tx.query(`update disease set status = 'dispatched' where id = $1`, [row.id])
          const detail = await tx.one(`select ${DISEASE_SELECT} from disease d where d.id = $1`, [row.id])
          order = {
            id: orderRow.id,
            code: orderCode,
            status: 'pending',
            slaHours,
          }
          return { id: row.id, order, diseaseRow: detail }
        }
        const detail = await tx.one(`select ${DISEASE_SELECT} from disease d where d.id = $1`, [row.id])
        return { id: row.id, order, diseaseRow: detail }
      }))
      return reply.code(201).ok({
        disease: mapDisease(result.diseaseRow),
        workOrder: result.order,
      })
    },
  )

  app.patch(
    '/diseases/:id',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '更新病害状态或补充说明',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          status: Type.Optional(
            Type.Union(['found', 'dispatched', 'repairing', 'reviewing', 'completed', 'rejected'].map((v) => Type.Literal(v))),
          ),
          severity: Type.Optional(Type.Union(['slight', 'medium', 'severe'].map((v) => Type.Literal(v)))),
          description: Type.Optional(Type.String({ maxLength: 2000 })),
        }),
        response: { 200: Envelope(Disease) },
      },
    },
    async (request, reply) => {
      const body = request.body
      const sets = []
      const params = []
      const push = (value, sql) => {
        params.push(value)
        sets.push(sql(params.length))
      }
      if (body.status) {
        if (!['found', 'dispatched', 'repairing', 'reviewing', 'completed', 'rejected'].includes(body.status))
          throw Errors.badRequest('病害状态不合法')
        push(body.status, (i) => `status = $${i}`)
        if (body.status === 'completed') sets.push('repaired_at = coalesce(repaired_at, now())')
      }
      if (body.severity) push(body.severity, (i) => `severity = $${i}`)
      if (body.description !== undefined) push(body.description, (i) => `description = $${i}`)
      if (!sets.length) throw Errors.badRequest('没有需要更新的字段')
      sets.push('updated_at = now()')
      params.push(request.params.id)
      const { rows } = await pool.query(
        `update disease set ${sets.join(', ')} where id = $${params.length} returning id`,
        params,
      )
      if (!rows.length) throw Errors.notFound('病害记录不存在')
      const detail = await pool.query(`select ${DISEASE_SELECT} from disease d where d.id = $1`, [request.params.id])
      return reply.ok(mapDisease(detail.rows[0]))
    },
  )
}
