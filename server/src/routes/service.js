/** 数字服务：公众反馈、预警发布、安全知识教育 */
import { Type } from '@sinclair/typebox'
import { pool, withTransaction } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { Feedback } from '../schemas/domain.js'
import { nextBizCode, withCodeRetry } from '../lib/code.js'

const TAGS = ['数字服务']

function mapFeedback(row) {
  return {
    id: row.id,
    code: row.code,
    channel: row.channel,
    content: row.content,
    stake: row.stake,
    pointId: row.point_id,
    status: row.status,
    workOrderId: row.work_order_id,
    createdAt: row.created_at.toISOString(),
    handledAt: row.handled_at?.toISOString() ?? null,
  }
}

export default async function serviceRoutes(app) {
  app.get(
    '/feedback',
    {
      schema: {
        tags: TAGS,
        summary: '公众反馈分页列表',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            status: Type.Optional(Type.String()),
            channel: Type.Optional(Type.String()),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(Feedback),
              page: Type.Integer(),
              pageSize: Type.Integer(),
              total: Type.Integer(),
              totalPages: Type.Integer(),
              stats: Type.Array(Type.Object({ status: Type.String(), label: Type.String(), count: Type.Integer() })),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, offset, limit } = pagination(request.query)
      const params = []
      const conditions = []
      if (request.query.status) {
        params.push(request.query.status)
        conditions.push(`status = $${params.length}`)
      }
      if (request.query.channel) {
        params.push(request.query.channel)
        conditions.push(`channel = $${params.length}`)
      }
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const [list, count, stats] = await Promise.all([
        pool.query(`select * from feedback ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [
          ...params,
          limit,
          offset,
        ]),
        pool.query(`select count(*)::int as n from feedback ${where}`, params),
        pool.query('select status, count(*)::int as count from feedback group by status'),
      ])
      const labels = {
        pending: '待审核',
        reviewed: '已审核',
        converted: '已转工单',
        invalid: '无效反馈',
        closed: '已关闭',
      }
      return reply.ok({
        items: list.rows.map(mapFeedback),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
        stats: Object.entries(labels).map(([status, label]) => ({
          status,
          label,
          count: stats.rows.find((r) => r.status === status)?.count ?? 0,
        })),
      })
    },
  )

  app.post(
    '/feedback',
    {
      schema: {
        tags: TAGS,
        summary: '公众提交反馈（小程序/热线/网页）',
        description: '开放接口，用于模拟公众端上报；提交后可被审核并转工单。',
        body: Type.Object({
          channel: Type.Union(['miniapp', 'hotline', 'web', 'app'].map((v) => Type.Literal(v))),
          content: Type.String({ minLength: 4, maxLength: 2000 }),
          stake: Type.Optional(Type.String({ maxLength: 32 })),
          pointId: Type.Optional(Type.String({ maxLength: 48 })),
          contact: Type.Optional(Type.String({ maxLength: 64 })),
        }),
        response: { 201: Envelope(Feedback) },
      },
    },
    async (request, reply) => {
      const body = request.body
      const rows = await withCodeRetry(async () => {
        const code = await nextBizCode({ one: async (text, params) => (await pool.query(text, params)).rows[0] }, {
          table: 'feedback',
          prefix: 'FK',
        })
        const inserted = await pool.query(
          `insert into feedback (code, channel, content, stake, point_id, contact, status)
           values ($1,$2,$3,$4,$5,$6,'pending') returning *`,
          [code, body.channel, body.content, body.stake ?? null, body.pointId ?? null, body.contact ?? null],
        )
        return inserted.rows
      })
      return reply.code(201).ok(mapFeedback(rows[0]))
    },
  )

  app.post(
    '/feedback/:id/review',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '审核反馈；可一键转为养护工单',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          decision: Type.Union(['valid', 'invalid', 'suggestion'].map((v) => Type.Literal(v))),
          convertToOrder: Type.Optional(Type.Boolean({ default: false })),
          remark: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: {
          200: Envelope(
            Type.Object({
              feedback: Feedback,
              workOrder: Type.Union([Type.Any(), Type.Null()]),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { decision, convertToOrder, remark } = request.body
      const result = await withCodeRetry(() => withTransaction(async (tx) => {
        const current = await tx.one('select * from feedback where id = $1 for update', [request.params.id])
        if (!current) throw Errors.notFound('反馈不存在')
        if (current.status === 'invalid' || current.status === 'closed')
          throw Errors.conflict('该反馈已关闭，无法重复处理')
        let status = decision === 'invalid' ? 'invalid' : decision === 'suggestion' ? 'reviewed' : 'reviewed'
        let order = null
        if (convertToOrder && decision === 'valid') {
          const code = await nextBizCode(tx, { table: 'work_order', prefix: 'GD' })
          order = await tx.one(
            `insert into work_order (code, type, title, description, status, priority, source, stake, reporter_id, sla_hours, due_at)
             values ($1,'repair',$2,$3,'pending','normal','public',$4,$5,24, now() + interval '24 hours')
             returning id, code`,
            [code, `公众反馈处置：${current.content.slice(0, 40)}`, `${current.content}${remark ? `（审核说明：${remark}）` : ''}`, current.stake, request.user.id],
          )
          status = 'converted'
        }
        const updated = await tx.one(
          `update feedback set status = $1, work_order_id = coalesce($2, work_order_id), handler_id = $3, handled_at = now()
            where id = $4 returning *`,
          [status, order?.id ?? null, request.user.id, request.params.id],
        )
        return { updated, order }
      }))
      return reply.ok({ feedback: mapFeedback(result.updated), workOrder: result.order })
    },
  )

  app.get(
    '/public-notices',
    {
      schema: {
        tags: TAGS,
        summary: '对外预警信息列表',
        querystring: Type.Composite([PageQuery, Type.Object({ level: Type.Optional(Type.String()) })]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  title: Type.String(),
                  level: Type.String(),
                  channels: Type.Array(Type.String()),
                  status: Type.String(),
                  publishedAt: Type.String(),
                  reachCount: Type.Integer(),
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
      const { page, pageSize, offset, limit } = pagination(request.query)
      const params = []
      let where = ''
      if (request.query.level) {
        params.push(request.query.level)
        where = `where level = $${params.length}`
      }
      const [list, count] = await Promise.all([
        pool.query(`select * from public_notice ${where} order by published_at desc limit $${params.length + 1} offset $${params.length + 2}`, [
          ...params,
          limit,
          offset,
        ]),
        pool.query(`select count(*)::int as n from public_notice ${where}`, params),
      ])
      return reply.ok({
        items: list.rows.map((row) => ({
          id: row.id,
          title: row.title,
          level: row.level,
          channels: row.channels ?? [],
          status: row.status,
          publishedAt: row.published_at.toISOString(),
          reachCount: row.reach_count,
        })),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.post(
    '/public-notices',
    {
      preValidation: app.requireManager,
      schema: {
        tags: TAGS,
        summary: '发布对外预警信息（值班长/管理员）',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          title: Type.String({ maxLength: 160 }),
          content: Type.Optional(Type.String({ maxLength: 4000 })),
          level: Type.Union(['red', 'yellow', 'blue'].map((v) => Type.Literal(v))),
          channels: Type.Optional(Type.Array(Type.String({ maxLength: 16 }))),
        }),
        response: {
          201: Envelope(Type.Object({ id: Type.Integer(), title: Type.String(), level: Type.String(), publishedAt: Type.String() })),
        },
      },
    },
    async (request, reply) => {
      const { title, content, level, channels } = request.body
      const { rows } = await pool.query(
        `insert into public_notice (title, content, level, channels, status, published_at, reach_count)
         values ($1,$2,$3,$4,'published', now(), 0) returning id, title, level, published_at`,
        [title, content ?? title, level, channels ?? []],
      )
      return reply.code(201).ok({
        id: rows[0].id,
        title: rows[0].title,
        level: rows[0].level,
        publishedAt: rows[0].published_at.toISOString(),
      })
    },
  )

  app.get(
    '/safety-articles',
    {
      schema: {
        tags: TAGS,
        summary: '安全知识教育文章列表',
        querystring: Type.Object({ category: Type.Optional(Type.String()) }),
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                id: Type.Integer(),
                title: Type.String(),
                category: Type.String(),
                icon: Type.Union([Type.String(), Type.Null()]),
                summary: Type.String(),
                views: Type.Integer(),
                publishedAt: Type.String(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const params = []
      let where = ''
      if (request.query.category) {
        params.push(request.query.category)
        where = `where category = $${params.length}`
      }
      const { rows } = await pool.query(`select * from safety_article ${where} order by published_at desc`, params)
      return reply.ok(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          icon: row.icon,
          summary: row.summary,
          views: row.views,
          publishedAt: row.published_at.toISOString(),
        })),
      )
    },
  )

  app.get(
    '/safety-articles/:id',
    {
      schema: {
        tags: TAGS,
        summary: '安全知识文章详情（浏览数 +1）',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              id: Type.Integer(),
              title: Type.String(),
              category: Type.String(),
              content: Type.String(),
              views: Type.Integer(),
              publishedAt: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `update safety_article set views = views + 1 where id = $1
         returning id, title, category, content, views, published_at`,
        [request.params.id],
      )
      if (!rows.length) throw Errors.notFound('文章不存在')
      return reply.ok({
        id: rows[0].id,
        title: rows[0].title,
        category: rows[0].category,
        content: rows[0].content,
        views: rows[0].views,
        publishedAt: rows[0].published_at.toISOString(),
      })
    },
  )
}
