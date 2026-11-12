/**
 * 场景点位与图层字典：三维/二维共用。
 * 前端 TunnelScene 需要 ScenePoint 列表，这里按模块下发，字段名与前端类型一致。
 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope } from '../lib/schemas.js'
import { Errors } from '../lib/errors.js'
import { PointGroupCode, ScenePoint } from '../schemas/domain.js'

const TAGS = ['场景点位']

function toScenePoint(row) {
  return {
    id: row.id,
    moduleCode: row.module_code,
    name: row.name,
    kind: row.kind,
    group: row.group_code,
    status: row.status,
    left: `${Number(row.left_pct)}%`,
    top: `${Number(row.top_pct)}%`,
    leftNum: Number(row.left_pct),
    scale: Number(row.scale),
    stake: row.stake,
    value: row.value,
    alarm: row.alarm,
    inspect: row.inspect_on ? row.inspect_on.toISOString().slice(0, 10) : null,
    deviceId: row.device_id,
  }
}

export default async function sceneRoutes(app) {
  app.get(
    '/scene/modules',
    {
      schema: {
        tags: TAGS,
        summary: '模块列表与默认图层',
        description: '模块默认开启图层与前端 MODULE_POINT_GROUPS 保持一致，可作为场景初始化的唯一来源。',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                code: Type.String(),
                name: Type.String(),
                path: Type.String(),
                icon: Type.String(),
                defaultGroups: Type.Array(PointGroupCode),
                pointCount: Type.Integer(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select m.code, m.name, m.path, m.icon,
                coalesce(json_agg(p.group_code) filter (where p.group_code is not null), '[]') as groups,
                (select count(*)::int from scene_point sp where sp.module_code = m.code) as point_count
           from scene_module m
           left join scene_point p on p.module_code = m.code
          group by m.code, m.name, m.path, m.icon, m.sort_no
          order by m.sort_no`,
      )
      const defaults = {
        overview: ['structure', 'env', 'traffic', 'monitor', 'mep'],
        traffic: ['traffic'],
        maintenance: ['monitor'],
        monitoring: ['env', 'monitor'],
        emergency: ['env', 'mep', 'structure'],
        service: ['monitor'],
        asset: ['structure', 'env', 'traffic', 'monitor', 'mep'],
      }
      return reply.ok(
        rows.map((row) => ({
          code: row.code,
          name: row.name,
          path: row.path,
          icon: row.icon,
          defaultGroups: defaults[row.code] ?? [],
          pointCount: row.point_count,
        })),
      )
    },
  )

  app.get(
    '/scene/points',
    {
      schema: {
        tags: TAGS,
        summary: '场景点位列表',
        description:
          '按模块（module）、分组（group）、类型（kind）、状态（status）筛选点位，返回可直接喂给 TunnelScene 的坐标与状态字段。',
        querystring: Type.Object({
          module: Type.Optional(Type.String({ description: '模块代码：overview/traffic/...' })),
          group: Type.Optional(PointGroupCode),
          kind: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          stake: Type.Optional(Type.String()),
        }),
        response: { 200: Envelope(Type.Array(ScenePoint)) },
      },
    },
    async (request, reply) => {
      const { module, group, kind, status, stake } = request.query
      const conditions = []
      const params = []
      if (module) {
        params.push(module)
        conditions.push(`module_code = $${params.length}`)
      }
      if (group) {
        params.push(group)
        conditions.push(`group_code = $${params.length}`)
      }
      if (kind) {
        params.push(kind)
        conditions.push(`kind = $${params.length}`)
      }
      if (status) {
        params.push(status)
        conditions.push(`status = $${params.length}`)
      }
      if (stake) {
        params.push(stake)
        conditions.push(`stake = $${params.length}`)
      }
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const { rows } = await pool.query(
        `select * from scene_point ${where} order by sort_no, id`,
        params,
      )
      return reply.ok(rows.map(toScenePoint))
    },
  )

  app.get(
    '/scene/overview',
    {
      schema: {
        tags: TAGS,
        summary: '场景总览点位（含实时告警叠加）',
        description:
          '按模块返回完整场景点位，并把未关闭告警按桩号就近映射到点位（alarm/alarmLevel/alertCode），' +
          '供大屏一次性渲染真实点位与告警态。',
        querystring: Type.Object({
          module: Type.Optional(Type.String({ description: '模块代码，默认 overview' })),
          withAlerts: Type.Optional(Type.Boolean({ description: '是否叠加未关闭告警，默认 true' })),
        }),
        response: {
          200: Envelope(
            Type.Object({
              module: Type.String(),
              generatedAt: Type.String(),
              total: Type.Integer(),
              alarmCount: Type.Integer(),
              groups: Type.Array(Type.Object({ key: Type.String(), label: Type.String(), count: Type.Integer() })),
              points: Type.Array(
                Type.Object({
                  id: Type.String(),
                  name: Type.String(),
                  kind: Type.String(),
                  group: Type.String(),
                  status: Type.String(),
                  left: Type.String(),
                  top: Type.String(),
                  leftNum: Type.Number(),
                  scale: Type.Number(),
                  stake: Type.Union([Type.String(), Type.Null()]),
                  value: Type.Union([Type.String(), Type.Null()]),
                  inspect: Type.Union([Type.String(), Type.Null()]),
                  alarm: Type.Union([Type.String(), Type.Null()]),
                  alertCode: Type.Union([Type.String(), Type.Null()]),
                  alarmLevel: Type.Union([Type.String(), Type.Null()]),
                  alarmCount: Type.Integer(),
                  deviceId: Type.Union([Type.Integer(), Type.Null()]),
                }),
              ),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const moduleCode = request.query.module ?? 'overview'
      const withAlerts = request.query.withAlerts !== false
      const { rows } = await pool.query('select * from scene_point where module_code = $1 order by sort_no, id', [
        moduleCode,
      ])
      if (!rows.length) throw Errors.notFound(`模块 ${moduleCode} 没有场景点位`)
      const points = rows.map(toScenePoint)

      // 未关闭告警：优先按 point_id 精确命中，其次按桩号就近匹配（真实工程里告警来自不同接入源）
      const alerts = withAlerts
        ? (
            await pool.query(
              `select id, code, level, status, title, description, stake, point_id, device_id
                 from alert where status <> 'closed' order by occurred_at desc`,
            )
          ).rows
        : []
      const byPoint = new Map()
      for (const alert of alerts) {
        if (alert.point_id) byPoint.set(alert.point_id, alert)
        else if (alert.device_id) {
          const hit = points.find((p) => p.deviceId === alert.device_id)
          if (hit) byPoint.set(hit.id, alert)
        }
      }
      const stakeOf = (value) => {
        const match = /K(\d+)\+(\d{1,4})/i.exec(value ?? '')
        return match ? Number(match[1]) * 1000 + Number(match[2]) : null
      }
      const enriched = points.map((point) => {
        const direct = byPoint.get(point.id)
        let alert = direct ?? null
        if (!alert) {
          const target = stakeOf(point.stake)
          if (target != null) {
            const candidates = alerts.filter((a) => a.stake && !byPoint.has(a.point_id ?? ''))
            let best = null
            for (const candidate of candidates) {
              const value = stakeOf(candidate.stake)
              if (value == null) continue
              if (Math.abs(value - target) > 60) continue
              if (!best || Math.abs(value - target) < Math.abs(stakeOf(best.stake) - target)) best = candidate
            }
            alert = best
          }
        }
        return {
          ...point,
          alarm: alert ? alert.description || alert.title : point.alarm,
          alertCode: alert ? alert.code : null,
          alarmLevel: alert ? alert.level : null,
          alarmCount: alert ? 1 : 0,
          status: alert ? (alert.level === 'critical' ? 'alarm' : 'warn') : point.status,
        }
      })
      const groupLabels = { structure: '隧道主体', env: '环控系统', traffic: '交通管控', monitor: '结构监测', mep: '隧道机电' }
      const groups = Object.entries(groupLabels).map(([key, label]) => ({
        key,
        label,
        count: enriched.filter((p) => p.group === key).length,
      }))
      return reply.ok({
        module: moduleCode,
        generatedAt: new Date().toISOString(),
        total: enriched.length,
        alarmCount: enriched.filter((p) => p.alarmCount > 0).length,
        groups,
        points: enriched,
      })
    },
  )

  app.get(
    '/scene/points/:id',
    {
      schema: {
        tags: TAGS,
        summary: '单个点位详情（含关联设备与告警）',
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Envelope(
            Type.Object({
              point: ScenePoint,
              device: Type.Union([Type.Any(), Type.Null()]),
              alerts: Type.Array(Type.Any()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query('select * from scene_point where id = $1', [request.params.id])
      if (!rows.length) throw Errors.notFound(`点位 ${request.params.id} 不存在`)
      const point = toScenePoint(rows[0])
      let device = null
      if (rows[0].device_id) {
        const deviceRows = await pool.query(
          `select d.*, c.name as category_name from device d join device_category c on c.code = d.category_code where d.id = $1`,
          [rows[0].device_id],
        )
        if (deviceRows.rows.length) {
          const d = deviceRows.rows[0]
          device = {
            id: d.id,
            code: d.code,
            name: d.name,
            categoryCode: d.category_code,
            categoryName: d.category_name,
            status: d.status,
            stake: d.stake,
            model: d.model,
            vendor: d.vendor,
            runState: d.run_state,
            installDate: d.install_date ? d.install_date.toISOString().slice(0, 10) : null,
          }
        }
      }
      const alerts = await pool.query(
        `select id, code, level, status, title, description, occurred_at
           from alert where point_id = $1 or (device_id is not null and device_id = $2)
          order by occurred_at desc limit 10`,
        [request.params.id, rows[0].device_id],
      )
      return reply.ok({
        point,
        device,
        alerts: alerts.rows.map((row) => ({
          id: row.id,
          code: row.code,
          level: row.level,
          status: row.status,
          title: row.title,
          description: row.description,
          occurredAt: row.occurred_at.toISOString(),
        })),
      })
    },
  )

  app.get(
    '/scene/groups',
    {
      schema: {
        tags: TAGS,
        summary: '图层分组字典与点位数量',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                key: PointGroupCode,
                label: Type.String(),
                count: Type.Integer(),
                alarmCount: Type.Integer(),
                kinds: Type.Array(Type.String()),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select group_code,
                count(*)::int as count,
                count(*) filter (where status in ('alarm', 'warn'))::int as alarm_count,
                array_agg(distinct kind order by kind) as kinds
           from scene_point group by group_code`,
      )
      const labels = {
        structure: '隧道主体',
        env: '环控系统',
        traffic: '交通管控',
        monitor: '结构监测',
        mep: '隧道机电',
      }
      return reply.ok(
        ['structure', 'env', 'traffic', 'monitor', 'mep'].map((key) => {
          const row = rows.find((r) => r.group_code === key)
          return {
            key,
            label: labels[key],
            count: row?.count ?? 0,
            alarmCount: row?.alarm_count ?? 0,
            kinds: row?.kinds ?? [],
          }
        }),
      )
    },
  )
}
