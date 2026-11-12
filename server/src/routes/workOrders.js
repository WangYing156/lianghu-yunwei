/**
 * 运维工单：状态机 pending → dispatched → processing → reviewing → completed
 * 允许 rejected / cancelled 终态；每次流转写 work_order_log，便于时效与责任追溯。
 */
import { Type } from '@sinclair/typebox'
import { pool, withTransaction } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { WorkOrder, WorkOrderLog } from '../schemas/domain.js'
import { nextBizCode, withCodeRetry } from '../lib/code.js'
import { STATUS_FLOW, STATUS_LABEL, transitionError } from '../lib/workflow.js'

const TAGS = ['运维工单']

const ORDER_SELECT = `
  w.id, w.code, w.type, w.title, w.description, w.status, w.priority, w.source, w.stake,
  w.disease_id, w.alert_id, w.assignee_id, w.sla_hours, w.due_at, w.dispatched_at, w.completed_at,
  w.created_at, w.updated_at, u.display_name as assignee_name,
  (w.due_at < now() and w.status not in ('completed', 'cancelled', 'rejected')) as overdue
`

function mapOrder(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    source: row.source,
    stake: row.stake,
    diseaseId: row.disease_id,
    alertId: row.alert_id,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    slaHours: row.sla_hours,
    dueAt: row.due_at?.toISOString() ?? null,
    dispatchedAt: row.dispatched_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    overdue: Boolean(row.overdue),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export default async function workOrderRoutes(app) {
  app.get(
    '/work-orders',
    {
      schema: {
        tags: TAGS,
        summary: '工单分页列表',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            status: Type.Optional(Type.String()),
            type: Type.Optional(Type.String()),
            priority: Type.Optional(Type.String()),
            assigneeId: Type.Optional(Type.Integer()),
            stake: Type.Optional(Type.String()),
            overdue: Type.Optional(Type.Boolean()),
            keyword: Type.Optional(Type.String()),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(WorkOrder),
              page: Type.Integer(),
              pageSize: Type.Integer(),
              total: Type.Integer(),
              totalPages: Type.Integer(),
              stats: Type.Object({
                byStatus: Type.Array(Type.Object({ status: Type.String(), label: Type.String(), count: Type.Integer() })),
                byType: Type.Array(Type.Object({ type: Type.String(), count: Type.Integer() })),
                overdue: Type.Integer(),
                completedToday: Type.Integer(),
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
      if (q.status) add(q.status.split(','), (i) => `w.status = any($${i}::text[])`)
      if (q.type) add(q.type, (i) => `w.type = $${i}`)
      if (q.priority) add(q.priority, (i) => `w.priority = $${i}`)
      if (q.assigneeId) add(q.assigneeId, (i) => `w.assignee_id = $${i}`)
      if (q.stake) add(q.stake, (i) => `w.stake = $${i}`)
      if (q.keyword) add(`%${q.keyword}%`, (i) => `(w.code ilike $${i} or w.title ilike $${i})`)
      if (q.overdue) conditions.push(`w.due_at < now() and w.status not in ('completed','cancelled','rejected')`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

      const [list, count, byStatus, byType, overdue, today] = await Promise.all([
        pool.query(
          `select ${ORDER_SELECT} from work_order w left join sys_user u on u.id = w.assignee_id
            ${where} order by w.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from work_order w ${where}`, params),
        pool.query(`select w.status, count(*)::int as count from work_order w ${where} group by w.status`, params),
        pool.query(`select w.type, count(*)::int as count from work_order w ${where} group by w.type`, params),
        pool.query(
          `select count(*)::int as n from work_order w
            where w.due_at < now() and w.status not in ('completed','cancelled','rejected')`,
        ),
        pool.query(`select count(*)::int as n from work_order where completed_at::date = now()::date`),
      ])
      return reply.ok({
        items: list.rows.map(mapOrder),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
        stats: {
          byStatus: Object.entries(STATUS_LABEL).map(([status, label]) => ({
            status,
            label,
            count: byStatus.rows.find((r) => r.status === status)?.count ?? 0,
          })),
          byType: byType.rows,
          overdue: overdue.rows[0].n,
          completedToday: today.rows[0].n,
        },
      })
    },
  )

  app.get(
    '/work-orders/:id',
    {
      schema: {
        tags: TAGS,
        summary: '工单详情与流转日志',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              order: WorkOrder,
              logs: Type.Array(WorkOrderLog),
              allowedNext: Type.Array(Type.String()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select ${ORDER_SELECT} from work_order w left join sys_user u on u.id = w.assignee_id where w.id = $1`,
        [request.params.id],
      )
      if (!rows.length) throw Errors.notFound('工单不存在')
      const logs = await pool.query(
        `select l.id, l.action, l.from_status, l.to_status, l.remark, l.created_at, u.display_name as operator_name
           from work_order_log l left join sys_user u on u.id = l.operator_id
          where l.work_order_id = $1 order by l.created_at`,
        [request.params.id],
      )
      return reply.ok({
        order: mapOrder(rows[0]),
        logs: logs.rows.map((row) => ({
          id: row.id,
          action: row.action,
          fromStatus: row.from_status,
          toStatus: row.to_status,
          operatorName: row.operator_name,
          remark: row.remark,
          createdAt: row.created_at.toISOString(),
        })),
        allowedNext: STATUS_FLOW[rows[0].status] ?? [],
      })
    },
  )

  app.post(
    '/work-orders',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '新建工单',
        description: '支持关联病害或告警；创建后写入 create 日志，dueAt 缺省按 SLA 计算。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          type: Type.Union(
            ['inspection', 'repair', 'maintain', 'emergency'].map((v) => Type.Literal(v)),
          ),
          title: Type.String({ maxLength: 128 }),
          description: Type.Optional(Type.String({ maxLength: 2000 })),
          priority: Type.Optional(
            Type.Union(['low', 'normal', 'high', 'urgent'].map((v) => Type.Literal(v)), { default: 'normal' }),
          ),
          source: Type.Optional(Type.Union(['manual', 'ai', 'public', 'inspection'].map((v) => Type.Literal(v)))),
          stake: Type.Optional(Type.String({ maxLength: 32 })),
          diseaseId: Type.Optional(Type.Integer()),
          alertId: Type.Optional(Type.Integer()),
          assigneeId: Type.Optional(Type.Integer()),
          slaHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 720, default: 24 })),
        }),
        response: { 201: Envelope(WorkOrder) },
      },
    },
    async (request, reply) => {
      const body = request.body
      const id = await withCodeRetry(() => withTransaction(async (tx) => {
        const code = await nextBizCode(tx, { table: 'work_order', prefix: 'GD' })
        const sla = body.slaHours ?? (body.priority === 'urgent' ? 4 : body.priority === 'high' ? 8 : 24)
        const row = await tx.one(
          `insert into work_order (code, type, title, description, status, priority, source, stake,
                                   disease_id, alert_id, reporter_id, assignee_id, sla_hours, due_at)
           values ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz)
           returning id`,
          [
            code, body.type, body.title, body.description ?? '', body.priority ?? 'normal',
            body.source ?? 'manual', body.stake ?? null, body.diseaseId ?? null, body.alertId ?? null,
            request.user.id, body.assigneeId ?? null, sla,
            new Date(Date.now() + sla * 3600 * 1000),
          ],
        )
        await tx.query(
          `insert into work_order_log (work_order_id, action, from_status, to_status, operator_id, remark)
           values ($1,'create',null,'pending',$2,$3)`,
          [row.id, request.user.id, '工单创建'],
        )
        return row.id
      }))
      const { rows } = await pool.query(
        `select ${ORDER_SELECT} from work_order w left join sys_user u on u.id = w.assignee_id where w.id = $1`,
        [id],
      )
      return reply.code(201).ok(mapOrder(rows[0]))
    },
  )

  app.patch(
    '/work-orders/:id',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '修改工单基础信息（不改变状态）',
        description: '状态流转请使用 /work-orders/{id}/transition，避免绕过状态机。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          title: Type.Optional(Type.String({ maxLength: 128 })),
          description: Type.Optional(Type.String({ maxLength: 2000 })),
          priority: Type.Optional(Type.Union(['low', 'normal', 'high', 'urgent'].map((v) => Type.Literal(v)))),
          assigneeId: Type.Optional(Type.Integer()),
          stake: Type.Optional(Type.String({ maxLength: 32 })),
          slaHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 720 })),
        }),
        response: { 200: Envelope(WorkOrder) },
      },
    },
    async (request, reply) => {
      const b = request.body
      const sets = []
      const params = []
      const push = (value, sql) => {
        params.push(value)
        sets.push(sql(params.length))
      }
      if (b.title !== undefined) push(b.title, (i) => `title = $${i}`)
      if (b.description !== undefined) push(b.description, (i) => `description = $${i}`)
      if (b.priority !== undefined) push(b.priority, (i) => `priority = $${i}`)
      if (b.assigneeId !== undefined) push(b.assigneeId, (i) => `assignee_id = $${i}`)
      if (b.stake !== undefined) push(b.stake, (i) => `stake = $${i}`)
      if (b.slaHours !== undefined) {
        push(b.slaHours, (i) => `sla_hours = $${i}`)
        sets.push('due_at = created_at + (sla_hours || \' hours\')::interval')
      }
      if (!sets.length) throw Errors.badRequest('没有需要更新的字段')
      sets.push('updated_at = now()')
      params.push(request.params.id)
      const { rows } = await pool.query(
        `update work_order set ${sets.join(', ')} where id = $${params.length} returning id`,
        params,
      )
      if (!rows.length) throw Errors.notFound('工单不存在')
      const detail = await pool.query(
        `select ${ORDER_SELECT} from work_order w left join sys_user u on u.id = w.assignee_id where w.id = $1`,
        [request.params.id],
      )
      return reply.ok(mapOrder(detail.rows[0]))
    },
  )

  app.post(
    '/work-orders/:id/transition',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '工单状态流转',
        description:
          '合法流转：pending→dispatched→processing→reviewing→completed；rejected 可重派。非法流转返回 409。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          toStatus: Type.Union(
            ['dispatched', 'processing', 'reviewing', 'completed', 'rejected', 'cancelled'].map((v) => Type.Literal(v)),
          ),
          remark: Type.Optional(Type.String({ maxLength: 500 })),
          assigneeId: Type.Optional(Type.Integer({ description: '派发时指定责任人' })),
        }),
        response: { 200: Envelope(WorkOrder) },
      },
    },
    async (request, reply) => {
      const { toStatus, remark, assigneeId } = request.body
      await withTransaction(async (tx) => {
        const current = await tx.one('select id, status, title from work_order where id = $1 for update', [
          request.params.id,
        ])
        if (!current) throw Errors.notFound('工单不存在')
        const allowed = STATUS_FLOW[current.status] ?? []
        const illegal = transitionError(current.status, toStatus)
        if (illegal) throw Errors.conflict(illegal, { allowed })
        const timestampSets = []
        if (toStatus === 'dispatched') timestampSets.push('dispatched_at = now()')
        if (toStatus === 'completed') timestampSets.push('completed_at = now()')
        if (toStatus === 'rejected') timestampSets.push('reject_reason = ' + (remark ? '$3' : 'null'))
        const params = [request.params.id, toStatus]
        if (toStatus === 'rejected' && remark) params.push(remark)
        if (assigneeId != null) {
          params.push(assigneeId)
          timestampSets.push(`assignee_id = $${params.length}`)
        }
        await tx.query(
          `update work_order set status = $2, updated_at = now()
             ${timestampSets.length ? `, ${timestampSets.join(', ')}` : ''}
           where id = $1`,
          params,
        )
        await tx.query(
          `insert into work_order_log (work_order_id, action, from_status, to_status, operator_id, remark)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            request.params.id,
            { dispatched: 'dispatch', processing: 'start', reviewing: 'submit-review', completed: 'complete', rejected: 'reject', cancelled: 'cancel' }[toStatus],
            current.status,
            toStatus,
            request.user.id,
            remark ?? null,
          ],
        )
      })
      const detail = await pool.query(
        `select ${ORDER_SELECT} from work_order w left join sys_user u on u.id = w.assignee_id where w.id = $1`,
        [request.params.id],
      )
      return reply.ok(mapOrder(detail.rows[0]))
    },
  )
}
