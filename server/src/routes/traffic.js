/** 智能交通：视频点位、交通流量、AI 事件、诱导屏与发布任务 */
import { Type } from '@sinclair/typebox'
import { pool, withTransaction } from '../db/pool.js'
import { Envelope, PageQuery, TimeRangeQuery } from '../lib/schemas.js'
import { pagination, timeWindow } from '../lib/format.js'
import { Errors } from '../lib/errors.js'
import { TrafficEvent, PublishTask } from '../schemas/domain.js'
import { nextBizCode, withCodeRetry } from '../lib/code.js'

const TAGS = ['智能交通']

const CAMERA_SELECT = `
  c.id, c.code, c.name, c.type, c.stake, c.status, c.stream_url, c.preview_url, c.point_id, c.ai_enabled, c.last_online_at
`

export default async function trafficRoutes(app) {
  // ------------------------------ 视频点位 ------------------------------
  app.get(
    '/cameras',
    {
      schema: {
        tags: TAGS,
        summary: '视频点位台账',
        description:
          '返回摄像机点位、在线状态与示例画面地址。未接入实时流时 streamUrl 为 null，前端应标注“模拟画面”。',
        querystring: Type.Object({
          status: Type.Optional(Type.String()),
          type: Type.Optional(Type.String()),
          aiEnabled: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  code: Type.String(),
                  name: Type.String(),
                  type: Type.String(),
                  stake: Type.String(),
                  status: Type.String(),
                  streamUrl: Type.Union([Type.String(), Type.Null()]),
                  previewUrl: Type.Union([Type.String(), Type.Null()]),
                  pointId: Type.Union([Type.String(), Type.Null()]),
                  aiEnabled: Type.Boolean(),
                  lastOnlineAt: Type.Union([Type.String(), Type.Null()]),
                  live: Type.Boolean({ description: '是否已接入可播放的实时流' }),
                }),
              ),
              summary: Type.Object({
                total: Type.Integer(),
                online: Type.Integer(),
                offline: Type.Integer(),
                alarm: Type.Integer(),
              }),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const q = request.query
      const conditions = []
      const params = []
      const add = (value, sql) => {
        params.push(value)
        conditions.push(sql(params.length))
      }
      if (q.status) add(q.status, (i) => `status = $${i}`)
      if (q.type) add(q.type, (i) => `type = $${i}`)
      if (q.aiEnabled !== undefined) add(q.aiEnabled, (i) => `ai_enabled = $${i}`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const { rows } = await pool.query(`select ${CAMERA_SELECT} from camera c ${where} order by code`, params)
      return reply.ok({
        items: rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          stake: row.stake,
          status: row.status,
          streamUrl: row.stream_url,
          previewUrl: row.preview_url,
          pointId: row.point_id,
          aiEnabled: row.ai_enabled,
          lastOnlineAt: row.last_online_at?.toISOString() ?? null,
          live: Boolean(row.stream_url),
        })),
        summary: {
          total: rows.length,
          online: rows.filter((r) => r.status === 'online').length,
          offline: rows.filter((r) => r.status === 'offline').length,
          alarm: rows.filter((r) => r.status === 'alarm').length,
        },
      })
    },
  )

  app.get(
    '/cameras/:code',
    {
      schema: {
        tags: TAGS,
        summary: '摄像机详情与最近 AI 事件',
        params: Type.Object({ code: Type.String() }),
        response: { 200: Envelope(Type.Object({ camera: Type.Any(), recentEvents: Type.Array(TrafficEvent) })) },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(`select ${CAMERA_SELECT} from camera c where c.code = $1`, [request.params.code])
      if (!rows.length) throw Errors.notFound('摄像机不存在')
      const events = await pool.query(
        `select e.id, e.code, e.type, e.level, e.stake, e.confidence, e.status, e.camera_id, e.detected_at, e.handled_at,
                e.remark, c.name as camera_name
           from traffic_event e left join camera c on c.id = e.camera_id
          where e.camera_id = $1 order by e.detected_at desc limit 10`,
        [rows[0].id],
      )
      return reply.ok({
        camera: {
          id: rows[0].id,
          code: rows[0].code,
          name: rows[0].name,
          type: rows[0].type,
          stake: rows[0].stake,
          status: rows[0].status,
          streamUrl: rows[0].stream_url,
          previewUrl: rows[0].preview_url,
          pointId: rows[0].point_id,
          aiEnabled: rows[0].ai_enabled,
          lastOnlineAt: rows[0].last_online_at?.toISOString() ?? null,
          live: Boolean(rows[0].stream_url),
        },
        recentEvents: events.rows.map((row) => ({
          id: row.id,
          code: row.code,
          type: row.type,
          level: row.level,
          stake: row.stake,
          confidence: Number(row.confidence),
          status: row.status,
          cameraId: row.camera_id,
          cameraName: row.camera_name,
          detectedAt: row.detected_at.toISOString(),
          handledAt: row.handled_at?.toISOString() ?? null,
          remark: row.remark,
        })),
      })
    },
  )

  app.get(
    '/cameras/:code/stream',
    {
      schema: {
        tags: TAGS,
        summary: '视频流地址（占位实现）',
        description:
          '本平台未接入 GB28181 / RTSP 网关。返回 501 与接入说明，避免前端把示例画面当成 LIVE。',
        params: Type.Object({ code: Type.String() }),
        response: {
          200: Envelope(Type.Object({ code: Type.String(), streamUrl: Type.String(), protocol: Type.String() })),
          501: Type.Object({ code: Type.Integer(), message: Type.String(), traceId: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query('select code, name, stream_url from camera where code = $1', [request.params.code])
      if (!rows.length) throw Errors.notFound('摄像机不存在')
      if (!rows[0].stream_url) {
        return reply.code(501).send({
          code: 50101,
          message: `摄像机 ${rows[0].name} 未接入实时视频流；请在 camera.stream_url 配置已授权的 GB28181/RTSP 网关地址。`,
          traceId: request.id,
        })
      }
      return reply.ok({ code: rows[0].code, streamUrl: rows[0].stream_url, protocol: 'hls' })
    },
  )

  // ------------------------------ 交通流量 ------------------------------
  app.get(
    '/traffic/segments',
    {
      schema: {
        tags: TAGS,
        summary: '断面流量与拥堵状态',
        description: '返回各断面最新流量、平均车速与拥堵等级，可直接替换智能交通页的彩色分段条。',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                code: Type.String(),
                name: Type.String(),
                stakeStart: Type.String(),
                stakeEnd: Type.String(),
                flowVph: Type.Integer(),
                speedKmh: Type.Number(),
                occupancy: Type.Number(),
                congestion: Type.String(),
                recordedAt: Type.String(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select distinct on (f.section_code)
                f.section_code, s.name, s.stake_start, s.stake_end,
                f.flow_vph, f.speed_kmh, f.occupancy, f.congestion, f.recorded_at
           from traffic_flow f
           join traffic_segment s on s.code = f.section_code
          order by f.section_code, f.recorded_at desc`,
      )
      return reply.ok(
        rows.map((row) => ({
          code: row.section_code,
          name: row.name,
          stakeStart: row.stake_start,
          stakeEnd: row.stake_end,
          flowVph: row.flow_vph,
          speedKmh: Number(row.speed_kmh),
          occupancy: Number(row.occupancy),
          congestion: row.congestion,
          recordedAt: row.recorded_at.toISOString(),
        })),
      )
    },
  )

  app.get(
    '/traffic/flow',
    {
      schema: {
        tags: TAGS,
        summary: '流量时序（按断面/方向聚合）',
        querystring: Type.Composite([
          TimeRangeQuery,
          Type.Object({
            sectionCode: Type.Optional(Type.String()),
            direction: Type.Optional(Type.Union([Type.Literal('north'), Type.Literal('south')])),
            bucket: Type.Optional(Type.Union([Type.Literal('hour'), Type.Literal('day')], { default: 'hour' })),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                sectionCode: Type.String(),
                direction: Type.String(),
                bucket: Type.String(),
                flowVph: Type.Integer(),
                speedKmh: Type.Number(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { start, end } = timeWindow(request.query, 12)
      const params = [start, end]
      const conditions = ['recorded_at >= $1', 'recorded_at <= $2']
      if (request.query.sectionCode) {
        params.push(request.query.sectionCode)
        conditions.push(`section_code = $${params.length}`)
      }
      if (request.query.direction) {
        params.push(request.query.direction)
        conditions.push(`direction = $${params.length}`)
      }
      const bucketSql = request.query.bucket === 'day' ? "date_trunc('day', recorded_at)" : "date_trunc('hour', recorded_at)"
      const { rows } = await pool.query(
        `select section_code, direction, ${bucketSql} as bucket,
                avg(flow_vph)::int as flow_vph, avg(speed_kmh)::numeric as speed_kmh
           from traffic_flow
          where ${conditions.join(' and ')}
          group by section_code, direction, ${bucketSql}
          order by bucket`,
        params,
      )
      return reply.ok(
        rows.map((row) => ({
          sectionCode: row.section_code,
          direction: row.direction,
          bucket: row.bucket.toISOString(),
          flowVph: row.flow_vph,
          speedKmh: Number(row.speed_kmh),
        })),
      )
    },
  )

  app.post(
    '/traffic/flow',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '写入断面流量采样（检测器/算法接入点）',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          sectionCode: Type.String({ maxLength: 32 }),
          direction: Type.Union([Type.Literal('north'), Type.Literal('south')]),
          flowVph: Type.Integer({ minimum: 0, maximum: 20000 }),
          speedKmh: Type.Optional(Type.Number({ minimum: 0, maximum: 200 })),
          occupancy: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
          recordedAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
        response: { 201: Envelope(Type.Object({ inserted: Type.Boolean(), congestion: Type.String() })) },
      },
    },
    async (request, reply) => {
      const { sectionCode, direction, flowVph, speedKmh, occupancy, recordedAt } = request.body
      const section = await pool.query('select code from traffic_segment where code = $1', [sectionCode])
      if (!section.rows.length) throw Errors.badRequest(`断面不存在：${sectionCode}`)
      const congestion = flowVph >= 2000 ? 'congested' : flowVph >= 1600 ? 'slow' : 'smooth'
      await pool.query(
        `insert into traffic_flow (section_code, direction, flow_vph, speed_kmh, occupancy, congestion, recorded_at)
         values ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now()))`,
        [sectionCode, direction, flowVph, speedKmh ?? null, occupancy ?? null, congestion, recordedAt ?? null],
      )
      return reply.code(201).ok({ inserted: true, congestion })
    },
  )

  // ------------------------------ AI 事件 ------------------------------
  app.get(
    '/traffic-events',
    {
      schema: {
        tags: TAGS,
        summary: 'AI 交通事件分页列表',
        querystring: Type.Composite([
          PageQuery,
          Type.Object({
            type: Type.Optional(Type.String()),
            level: Type.Optional(Type.String()),
            status: Type.Optional(Type.String()),
            stake: Type.Optional(Type.String()),
            minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
          }),
        ]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(TrafficEvent),
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
      if (q.type) add(q.type, (i) => `e.type = $${i}`)
      if (q.level) add(q.level, (i) => `e.level = $${i}`)
      if (q.status) add(q.status.split(','), (i) => `e.status = any($${i}::text[])`)
      if (q.stake) add(q.stake, (i) => `e.stake = $${i}`)
      if (q.minConfidence != null) add(q.minConfidence, (i) => `e.confidence >= $${i}`)
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const [list, count] = await Promise.all([
        pool.query(
          `select e.id, e.code, e.type, e.level, e.stake, e.confidence, e.status, e.camera_id, e.detected_at,
                  e.handled_at, e.remark, c.name as camera_name
             from traffic_event e left join camera c on c.id = e.camera_id
             ${where} order by e.detected_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from traffic_event e ${where}`, params),
      ])
      return reply.ok({
        items: list.rows.map((row) => ({
          id: row.id,
          code: row.code,
          type: row.type,
          level: row.level,
          stake: row.stake,
          confidence: Number(row.confidence),
          status: row.status,
          cameraId: row.camera_id,
          cameraName: row.camera_name,
          detectedAt: row.detected_at.toISOString(),
          handledAt: row.handled_at?.toISOString() ?? null,
          remark: row.remark,
        })),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.post(
    '/traffic-events',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '上报 AI 识别事件（算法服务接入点）',
        description: '置信度 < 85 的事件仅入库，不升级为告警；行人闯入与逆行默认高优先级。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          type: Type.Union(['parking', 'congestion', 'debris', 'pedestrian', 'wrongway', 'accident', 'other'].map((v) => Type.Literal(v))),
          stake: Type.String({ maxLength: 32 }),
          confidence: Type.Number({ minimum: 0, maximum: 100 }),
          cameraCode: Type.Optional(Type.String({ maxLength: 48 })),
          level: Type.Optional(Type.Union(['high', 'medium', 'low'].map((v) => Type.Literal(v)))),
          snapshotUrl: Type.Optional(Type.String({ maxLength: 500 })),
          detectedAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
        response: {
          201: Envelope(
            Type.Object({
              event: TrafficEvent,
              alertCreated: Type.Boolean(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const result = await withCodeRetry(() => withTransaction(async (tx) => {
        let cameraId = null
        if (body.cameraCode) {
          const camera = await tx.one('select id from camera where code = $1', [body.cameraCode])
          if (!camera) throw Errors.badRequest(`摄像机不存在：${body.cameraCode}`)
          cameraId = camera.id
        }
        const level = body.level ?? (['pedestrian', 'wrongway', 'accident'].includes(body.type) ? 'high' : 'medium')
        const code = await nextBizCode(tx, { table: 'traffic_event', prefix: 'JT' })
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const row = await tx.one(
          `insert into traffic_event (code, type, level, stake, confidence, status, camera_id, snapshot_url, detected_at)
           values ($1,$2,$3,$4,$5,'pending',$6,$7, coalesce($8::timestamptz, now()))
           returning id, code, type, level, stake, confidence, status, camera_id, detected_at, handled_at, remark`,
          [code, body.type, level, body.stake, body.confidence, cameraId, body.snapshotUrl ?? null, body.detectedAt ?? null],
        )
        let alertCreated = false
        if (body.confidence >= 85) {
          const alertCode = `AL-${stamp}-${String(Date.now() % 100000).padStart(5, '0')}`
          await tx.query(
            `insert into alert (code, level, status, source, title, description, stake, group_code, kind, dedup_key)
             values ($1,$2,'open','智能交通',$3,$4,$5,'traffic','camera',$6)`,
            [
              alertCode,
              level === 'high' ? 'critical' : 'warning',
              `AI 识别${body.type}事件`,
              `${body.stake} 置信度 ${body.confidence}%，请调取视频核实。`,
              body.stake,
              `traffic:${body.stake}:camera`,
            ],
          )
          alertCreated = true
        }
        return { row, alertCreated }
      }))
      const camera = result.row.camera_id
        ? await pool.query('select name from camera where id = $1', [result.row.camera_id])
        : null
      return reply.code(201).ok({
        event: {
          id: result.row.id,
          code: result.row.code,
          type: result.row.type,
          level: result.row.level,
          stake: result.row.stake,
          confidence: Number(result.row.confidence),
          status: result.row.status,
          cameraId: result.row.camera_id,
          cameraName: camera?.rows[0]?.name ?? null,
          detectedAt: result.row.detected_at.toISOString(),
          handledAt: null,
          remark: null,
        },
        alertCreated: result.alertCreated,
      })
    },
  )

  app.patch(
    '/traffic-events/:id',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '确认/处置/忽略交通事件',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          status: Type.Union(['confirmed', 'handled', 'ignored'].map((v) => Type.Literal(v))),
          remark: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: { 200: Envelope(TrafficEvent) },
      },
    },
    async (request, reply) => {
      const { status, remark } = request.body
      const { rows } = await pool.query(
        `update traffic_event set status = $1::text, remark = coalesce($2, remark),
                handled_at = case when $1::text in ('handled','ignored') then now() else handled_at end,
                handled_by = $3
          where id = $4
          returning id, code, type, level, stake, confidence, status, camera_id, detected_at, handled_at, remark`,
        [status, remark ?? null, request.user.id, request.params.id],
      )
      if (!rows.length) throw Errors.notFound('交通事件不存在')
      const camera = rows[0].camera_id
        ? await pool.query('select name from camera where id = $1', [rows[0].camera_id])
        : null
      return reply.ok({
        id: rows[0].id,
        code: rows[0].code,
        type: rows[0].type,
        level: rows[0].level,
        stake: rows[0].stake,
        confidence: Number(rows[0].confidence),
        status: rows[0].status,
        cameraId: rows[0].camera_id,
        cameraName: camera?.rows[0]?.name ?? null,
        detectedAt: rows[0].detected_at.toISOString(),
        handledAt: rows[0].handled_at?.toISOString() ?? null,
        remark: rows[0].remark,
      })
    },
  )

  // ------------------------------ 诱导屏 / 发布 ------------------------------
  app.get(
    '/info-boards',
    {
      schema: {
        tags: TAGS,
        summary: '诱导屏 / 情报板台账',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                id: Type.Integer(),
                code: Type.String(),
                name: Type.String(),
                type: Type.String(),
                stake: Type.String(),
                status: Type.String(),
                content: Type.Union([Type.String(), Type.Null()]),
                pointId: Type.Union([Type.String(), Type.Null()]),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        'select id, code, name, type, stake, status, content, point_id from info_board order by code',
      )
      return reply.ok(
        rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          stake: row.stake,
          status: row.status,
          content: row.content,
          pointId: row.point_id,
        })),
      )
    },
  )

  app.get(
    '/publish-tasks',
    {
      schema: {
        tags: TAGS,
        summary: '发布任务列表',
        querystring: Type.Composite([PageQuery, Type.Object({ status: Type.Optional(Type.String()) })]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(PublishTask),
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
      if (request.query.status) {
        params.push(request.query.status)
        where = `where p.status = $${params.length}`
      }
      const [list, count] = await Promise.all([
        pool.query(
          `select p.*, coalesce(array_agg(b.name) filter (where b.name is not null), '{}') as board_names
             from publish_task p
             left join info_board b on b.id = any(p.board_ids)
             ${where}
            group by p.id
            order by p.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from publish_task p ${where}`, params),
      ])
      return reply.ok({
        items: list.rows.map((row) => ({
          id: row.id,
          taskNo: row.task_no,
          title: row.title,
          content: row.content,
          level: row.level,
          channels: row.channels ?? [],
          status: row.status,
          scheduledStart: row.scheduled_start?.toISOString() ?? null,
          scheduledEnd: row.scheduled_end?.toISOString() ?? null,
          boardIds: row.board_ids ?? [],
          boardNames: row.board_names ?? [],
          publishedAt: row.published_at?.toISOString() ?? null,
          reachCount: row.reach_count,
          createdAt: row.created_at.toISOString(),
        })),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.post(
    '/publish-tasks',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '新建发布任务（草稿）',
        description:
          '内容限 120 字（诱导屏 30 字建议另加校验）；status=draft 或 pending_review。预警/紧急级别需值班长审核后才会发布。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          title: Type.String({ maxLength: 128 }),
          content: Type.String({ maxLength: 120 }),
          level: Type.Optional(Type.Union(['normal', 'info', 'warning', 'emergency'].map((v) => Type.Literal(v)))),
          channels: Type.Optional(Type.Array(Type.String({ maxLength: 16 }), { maxItems: 5 })),
          boardIds: Type.Optional(Type.Array(Type.Integer(), { maxItems: 20 })),
          scheduledStart: Type.Optional(Type.String({ format: 'date-time' })),
          scheduledEnd: Type.Optional(Type.String({ format: 'date-time' })),
          submit: Type.Optional(Type.Boolean({ description: 'true 表示直接提交审核', default: false })),
        }),
        response: { 201: Envelope(PublishTask) },
      },
    },
    async (request, reply) => {
      const body = request.body
      const status = body.submit ? 'pending_review' : 'draft'
      const rows = await withCodeRetry(async () => {
        const taskNo = await nextBizCode({ one: async (text, params) => (await pool.query(text, params)).rows[0] }, {
          table: 'publish_task',
          prefix: 'FB',
        })
        // 发布任务编号列名为 task_no，需要在插入时单独赋值
        const inserted = await pool.query(
          `insert into publish_task (task_no, title, content, level, channels, status, scheduled_start, scheduled_end, board_ids, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
          [
            taskNo, body.title, body.content, body.level ?? 'info', body.channels ?? [], status,
            body.scheduledStart ?? null, body.scheduledEnd ?? null, body.boardIds ?? [], request.user.id,
          ],
        )
        return inserted.rows
      })
      return reply.code(201).ok({
        id: rows[0].id,
        taskNo: rows[0].task_no,
        title: rows[0].title,
        content: rows[0].content,
        level: rows[0].level,
        channels: rows[0].channels ?? [],
        status: rows[0].status,
        scheduledStart: rows[0].scheduled_start?.toISOString() ?? null,
        scheduledEnd: rows[0].scheduled_end?.toISOString() ?? null,
        boardIds: rows[0].board_ids ?? [],
        boardNames: [],
        publishedAt: null,
        reachCount: 0,
        createdAt: rows[0].created_at.toISOString(),
      })
    },
  )

  app.post(
    '/publish-tasks/:id/review',
    {
      preValidation: app.requireManager,
      schema: {
        tags: TAGS,
        summary: '审核发布任务（值班长/管理员）',
        description: 'approve=true 立即发布并把内容下发给关联诱导屏；approve=false 驳回并回退草稿。',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          approve: Type.Boolean(),
          reason: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: { 200: Envelope(PublishTask) },
      },
    },
    async (request, reply) => {
      const { approve, reason } = request.body
      const row = await withTransaction(async (tx) => {
        const current = await tx.one('select id, status, board_ids, content from publish_task where id = $1 for update', [
          request.params.id,
        ])
        if (!current) throw Errors.notFound('发布任务不存在')
        if (!['pending_review', 'draft'].includes(current.status))
          throw Errors.conflict(`当前状态 ${current.status} 不可审核`)
        if (!approve) {
          const updated = await tx.one(
            `update publish_task set status = 'rejected', reject_reason = $1, reviewed_by = $2, updated_at = now()
              where id = $3 returning *`,
            [reason ?? '内容不合规', request.user.id, request.params.id],
          )
          return updated
        }
        const updated = await tx.one(
          `update publish_task set status = 'published', reviewed_by = $1, published_at = now(),
                  reach_count = reach_count + 12000, updated_at = now()
            where id = $2 returning *`,
          [request.user.id, request.params.id],
        )
        if (current.board_ids?.length) {
          await tx.query(`update info_board set content = $1 where id = any($2::bigint[])`, [
            current.content,
            current.board_ids,
          ])
        }
        return updated
      })
      const boardNames = row.board_ids?.length
        ? (await pool.query('select name from info_board where id = any($1::bigint[])', [row.board_ids])).rows.map((r) => r.name)
        : []
      return reply.ok({
        id: row.id,
        taskNo: row.task_no,
        title: row.title,
        content: row.content,
        level: row.level,
        channels: row.channels ?? [],
        status: row.status,
        scheduledStart: row.scheduled_start?.toISOString() ?? null,
        scheduledEnd: row.scheduled_end?.toISOString() ?? null,
        boardIds: row.board_ids ?? [],
        boardNames,
        publishedAt: row.published_at?.toISOString() ?? null,
        reachCount: row.reach_count,
        createdAt: row.created_at.toISOString(),
      })
    },
  )

  app.post(
    '/publish-tasks/:id/offline',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '下刊发布内容',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        response: { 200: Envelope(Type.Object({ id: Type.Integer(), status: Type.String(), offlineAt: Type.String() })) },
      },
    },
    async (request, reply) => {
      const row = await withTransaction(async (tx) => {
        const current = await tx.one('select id, status, board_ids from publish_task where id = $1 for update', [
          request.params.id,
        ])
        if (!current) throw Errors.notFound('发布任务不存在')
        if (current.status !== 'published') throw Errors.conflict('仅已发布内容可以下刊')
        const updated = await tx.one(
          `update publish_task set status = 'offline', offline_at = now(), updated_at = now() where id = $1 returning offline_at`,
          [request.params.id],
        )
        if (current.board_ids?.length)
          await tx.query(`update info_board set content = null where id = any($1::bigint[])`, [current.board_ids])
        return updated
      })
      return reply.ok({ id: request.params.id, status: 'offline', offlineAt: row.offline_at.toISOString() })
    },
  )
}
