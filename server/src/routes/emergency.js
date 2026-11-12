/** 数字应急：应急物资、工况推演记录、应急汇总 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { Errors } from '../lib/errors.js'

const TAGS = ['数字应急']

export default async function emergencyRoutes(app) {
  app.get(
    '/emergency/materials',
    {
      schema: {
        tags: TAGS,
        summary: '应急物资台账与充足状态',
        description: '对应数字应急页的“应急物资点”列表；sufficient=false 时前端应给出补充提示。',
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  name: Type.String(),
                  site: Type.String(),
                  stake: Type.Union([Type.String(), Type.Null()]),
                  quantity: Type.Number(),
                  unit: Type.String(),
                  sufficient: Type.Boolean(),
                  updatedAt: Type.String(),
                }),
              ),
              insufficient: Type.Integer(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query('select * from emergency_material order by site, name')
      return reply.ok({
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          site: row.site,
          stake: row.stake,
          quantity: Number(row.quantity),
          unit: row.unit,
          sufficient: row.sufficient,
          updatedAt: row.updated_at.toISOString(),
        })),
        insufficient: rows.filter((row) => !row.sufficient).length,
      })
    },
  )

  app.patch(
    '/emergency/materials/:id',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '更新应急物资数量与充足状态',
        params: Type.Object({ id: Type.Integer() }),
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          quantity: Type.Number({ minimum: 0 }),
          sufficient: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Envelope(Type.Object({ id: Type.Integer(), quantity: Type.Number(), sufficient: Type.Boolean() })),
        },
      },
    },
    async (request, reply) => {
      const { quantity, sufficient } = request.body
      const resolved = sufficient ?? quantity > 0
      const { rows } = await pool.query(
        `update emergency_material set quantity = $1, sufficient = $2, updated_at = now()
          where id = $3 returning id, quantity, sufficient`,
        [quantity, resolved, request.params.id],
      )
      if (!rows.length) throw Errors.notFound('物资不存在')
      return reply.ok({ id: rows[0].id, quantity: Number(rows[0].quantity), sufficient: rows[0].sufficient })
    },
  )

  app.get(
    '/simulation-runs',
    {
      schema: {
        tags: TAGS,
        summary: '四维工况推演记录',
        description:
          '记录 fire/flood/accident/inspection 四类脚本推演的运行情况。推演读数为脚本值，不代表实时测点或设备指令。',
        querystring: Type.Composite([PageQuery, Type.Object({ scenario: Type.Optional(Type.String()) })]),
        response: {
          200: Envelope(
            Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Type.Integer(),
                  scenario: Type.String(),
                  scenarioLabel: Type.String(),
                  operatorName: Type.Union([Type.String(), Type.Null()]),
                  stepReached: Type.Integer(),
                  totalSteps: Type.Integer(),
                  immersive: Type.Boolean(),
                  startedAt: Type.String(),
                  endedAt: Type.Union([Type.String(), Type.Null()]),
                  note: Type.Union([Type.String(), Type.Null()]),
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
      if (request.query.scenario) {
        params.push(request.query.scenario)
        where = `where s.scenario = $${params.length}`
      }
      const [list, count] = await Promise.all([
        pool.query(
          `select s.*, u.display_name from simulation_run s left join sys_user u on u.id = s.operator_id
            ${where} order by s.started_at desc limit $${params.length + 1} offset $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(`select count(*)::int as n from simulation_run s ${where}`, params),
      ])
      const labels = { fire: '火灾疏散', flood: '积水排涝', accident: '交通事故', inspection: '日常巡检' }
      return reply.ok({
        items: list.rows.map((row) => ({
          id: row.id,
          scenario: row.scenario,
          scenarioLabel: labels[row.scenario] ?? row.scenario,
          operatorName: row.display_name,
          stepReached: row.step_reached,
          totalSteps: row.total_steps,
          immersive: row.immersive,
          startedAt: row.started_at.toISOString(),
          endedAt: row.ended_at?.toISOString() ?? null,
          note: row.note,
        })),
        page,
        pageSize,
        total: count.rows[0].n,
        totalPages: Math.ceil(count.rows[0].n / pageSize),
      })
    },
  )

  app.post(
    '/simulation-runs',
    {
      preValidation: app.requireWriter,
      schema: {
        tags: TAGS,
        summary: '记录一次工况推演',
        description: '前端在进入/退出推演时上报，用于留存演练证据；不写入任何设备控制指令。',
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          scenario: Type.Union(['fire', 'flood', 'accident', 'inspection'].map((v) => Type.Literal(v))),
          stepReached: Type.Integer({ minimum: 0, maximum: 20 }),
          totalSteps: Type.Integer({ minimum: 1, maximum: 20 }),
          immersive: Type.Optional(Type.Boolean()),
          note: Type.Optional(Type.String({ maxLength: 500 })),
        }),
        response: { 201: Envelope(Type.Object({ id: Type.Integer(), scenario: Type.String(), startedAt: Type.String() })) },
      },
    },
    async (request, reply) => {
      const { scenario, stepReached, totalSteps, immersive, note } = request.body
      const { rows } = await pool.query(
        `insert into simulation_run (scenario, operator_id, step_reached, total_steps, immersive, ended_at, note)
         values ($1,$2,$3,$4,$5, now(), $6) returning id, scenario, started_at`,
        [scenario, request.user.id, stepReached, totalSteps, immersive ?? false, note ?? null],
      )
      return reply.code(201).ok({
        id: rows[0].id,
        scenario: rows[0].scenario,
        startedAt: rows[0].started_at.toISOString(),
      })
    },
  )

  app.get(
    '/emergency/overview',
    {
      schema: {
        tags: TAGS,
        summary: '应急态势汇总',
        description: '积水阈值、联动泵组、应急告警与物资缺口，一次给出应急页首屏所需数据。',
        response: {
          200: Envelope(
            Type.Object({
              waterLevels: Type.Array(
                Type.Object({
                  deviceCode: Type.String(),
                  deviceName: Type.String(),
                  stake: Type.String(),
                  value: Type.Number(),
                  level: Type.String(),
                  yellow: Type.Number(),
                  red: Type.Number(),
                }),
              ),
              pumps: Type.Array(
                Type.Object({ code: Type.String(), name: Type.String(), runState: Type.Union([Type.String(), Type.Null()]), status: Type.String() }),
              ),
              activeAlerts: Type.Array(Type.Any()),
              materials: Type.Object({ total: Type.Integer(), insufficient: Type.Integer() }),
              thresholds: Type.Object({ yellow: Type.Number(), red: Type.Number() }),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const [water, pumps, alerts, materials] = await Promise.all([
        pool.query(
          `select distinct on (t.device_id) d.code, d.name, d.stake, t.value
             from telemetry t join device d on d.id = t.device_id
            where t.metric = 'water_level'
            order by t.device_id, t.recorded_at desc`,
        ),
        pool.query(
          `select code, name, run_state, status from device where category_code in ('pump', 'firePump') order by code`,
        ),
        pool.query(
          `select id, code, level, status, source, title, description, stake, point_id, occurred_at
             from alert where status <> 'closed' and source = '数字应急' order by occurred_at desc`,
        ),
        pool.query('select count(*)::int as total, count(*) filter (where not sufficient)::int as insufficient from emergency_material'),
      ])
      const yellow = 15
      const red = 25
      return reply.ok({
        waterLevels: water.rows.map((row) => {
          const value = Number(row.value)
          return {
            deviceCode: row.code,
            deviceName: row.name,
            stake: row.stake,
            value,
            level: value >= red ? 'red' : value >= yellow ? 'yellow' : 'normal',
            yellow,
            red,
          }
        }),
        pumps: pumps.rows.map((row) => ({
          code: row.code,
          name: row.name,
          runState: row.run_state,
          status: row.status,
        })),
        activeAlerts: alerts.rows.map((row) => ({
          id: row.id,
          code: row.code,
          level: row.level,
          status: row.status,
          source: row.source,
          title: row.title,
          description: row.description,
          stake: row.stake,
          pointId: row.point_id,
          occurredAt: row.occurred_at.toISOString(),
        })),
        materials: { total: materials.rows[0].total, insufficient: materials.rows[0].insufficient },
        thresholds: { yellow, red },
      })
    },
  )
}
