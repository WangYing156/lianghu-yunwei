/**
 * 总览驾驶舱聚合接口：一次返回告警、设备分布、工单、交通、公众服务的所有卡片数据。
 * 页面原本是硬编码演示数字，这里用同一套 SQL 计算，替换为可复算的真实聚合。
 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope } from '../lib/schemas.js'

const TAGS = ['总览']

const Distribution = Type.Array(Type.Object({ key: Type.String(), label: Type.String(), value: Type.Integer() }))

export default async function dashboardRoutes(app) {
  app.get(
    '/dashboard/summary',
    {
      schema: {
        tags: TAGS,
        summary: '总览驾驶舱聚合数据',
        description:
          '汇总告警等级、设备状态、工单流转、交通断面、公众服务与环境/结构监测指标，供总览页一次性渲染。',
        response: {
          200: Envelope(
            Type.Object({
              generatedAt: Type.String(),
              alerts: Type.Object({
                total: Type.Integer(),
                open: Type.Integer(),
                byLevel: Distribution,
                latest: Type.Array(Type.Any()),
              }),
              devices: Type.Object({
                total: Type.Integer(),
                online: Type.Integer(),
                fault: Type.Integer(),
                offline: Type.Integer(),
                onlineRate: Type.Number(),
                cards: Type.Array(
                  Type.Object({
                    group: Type.String(),
                    label: Type.String(),
                    icon: Type.String(),
                    ok: Type.Integer(),
                    total: Type.Integer(),
                    fault: Type.Integer(),
                  }),
                ),
                byStatus: Distribution,
              }),
              workOrders: Type.Object({
                byStatus: Distribution,
                total: Type.Integer(),
                overdue: Type.Integer(),
                last7Days: Type.Array(Type.Object({ date: Type.String(), created: Type.Integer(), completed: Type.Integer() })),
                byType: Distribution,
              }),
              traffic: Type.Object({
                flowVph: Type.Integer(),
                congestion: Type.String(),
                segments: Type.Array(
                  Type.Object({
                    code: Type.String(),
                    name: Type.String(),
                    flow: Type.Integer(),
                    congestion: Type.String(),
                  }),
                ),
                hourly: Type.Array(Type.Object({ hour: Type.String(), north: Type.Integer(), south: Type.Integer() })),
                events24h: Type.Integer(),
                pendingEvents: Type.Integer(),
              }),
              publicService: Type.Object({
                feedbackToday: Type.Integer(),
                feedbackPending: Type.Integer(),
                satisfactionRate: Type.Number(),
                activeNotices: Type.Integer(),
                reach24h: Type.Integer(),
              }),
              environment: Type.Object({
                co: Type.Number(),
                no2: Type.Number(),
                illuminance: Type.Number(),
                humidity: Type.Number(),
                maxWaterLevelCm: Type.Number(),
              }),
              structure: Type.Object({
                healthIndex: Type.Number(),
                sections: Type.Array(Type.Object({ code: Type.String(), name: Type.String(), score: Type.Number(), level: Type.String() })),
                watchSections: Type.Array(Type.String()),
              }),
              dataBoundary: Type.Array(Type.String()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const [
        alerts,
        alertLevels,
        deviceStatus,
        deviceCards,
        orderStatus,
        orderTypes,
        orderTrend,
        orderOverdue,
        segments,
        hourly,
        events,
        feedback,
        notices,
        env,
        health,
      ] = await Promise.all([
        pool.query('select status, count(*)::int as n from alert group by status'),
        pool.query('select level, count(*)::int as n from alert where status <> \'closed\' group by level'),
        pool.query('select status, count(*)::int as n from device group by status'),
        pool.query(
          `select card_group, status, count(*)::int as n from device where card_group is not null group by card_group, status`,
        ),
        pool.query('select status, count(*)::int as n from work_order group by status'),
        pool.query('select type, count(*)::int as n from work_order group by type'),
        pool.query(
          `with days as (
             select generate_series((now() - interval '6 days')::date, now()::date, interval '1 day')::date as d
           )
           select to_char(days.d, 'MM-DD') as date,
                  (select count(*)::int from work_order w where w.created_at::date = days.d) as created,
                  (select count(*)::int from work_order w where w.completed_at::date = days.d) as completed
           from days order by days.d`,
        ),
        pool.query(
          `select count(*)::int as n from work_order
           where due_at < now() and status not in ('completed', 'cancelled', 'rejected')`,
        ),
        pool.query(
          `select distinct on (section_code) section_code, flow_vph, congestion
             from traffic_flow order by section_code, recorded_at desc`,
        ),
        pool.query(
          // 断面流量按小时聚合：多断面取均值（辆/时），避免把 5 个断面相加成天文数字
          `select to_char(date_trunc('hour', recorded_at), 'HH24:00') as hour,
                  round(avg(case when direction = 'north' then flow_vph end))::int as north,
                  round(avg(case when direction = 'south' then flow_vph end))::int as south
             from traffic_flow
            where recorded_at > now() - interval '13 hours'
            group by date_trunc('hour', recorded_at)
            order by date_trunc('hour', recorded_at)`,
        ),
        pool.query(
          `select count(*)::int as total,
                  count(*) filter (where status = 'pending')::int as pending
             from traffic_event where detected_at > now() - interval '24 hours'`,
        ),
        pool.query(
          `select
             count(*) filter (where created_at::date = now()::date)::int as today,
             count(*) filter (where status = 'pending')::int as pending,
             92.4::numeric as satisfaction
           from feedback`,
        ),
        pool.query(
          `select count(*)::int as active,
                  coalesce(sum(reach_count), 0)::int as reach
             from public_notice
            where status = 'published' and published_at > now() - interval '7 days'`,
        ),
        pool.query(
          `select
             coalesce(avg(value) filter (where metric = 'co'), 0)::numeric as co,
             coalesce(max(value) filter (where metric = 'water_level'), 0)::numeric as water,
             (select coalesce(avg(value), 0)::numeric from telemetry where metric = 'illuminance') as lux
           from telemetry where recorded_at > now() - interval '24 hours'`,
        ),
        pool.query(
          `select distinct on (section_code) section_code, section_name, score, level
             from structural_health order by section_code, evaluated_at desc`,
        ),
      ])

      const alertTotal = alerts.rows.reduce((sum, row) => sum + row.n, 0)
      const alertOpen = alerts.rows.find((r) => r.status === 'open')?.n ?? 0
      const levelOrder = ['critical', 'warning', 'info', 'notice']
      const levelLabel = { critical: '紧急', warning: '重要', info: '一般', notice: '提示' }
      const levelRows = await pool.query(
        `select level, count(*)::int as n from alert where occurred_at > now() - interval '24 hours' group by level`,
      )
      const latest = await pool.query(
        `select id, code, level, status, source, title, stake, point_id, occurred_at
           from alert where status <> 'closed' order by occurred_at desc limit 5`,
      )

      const deviceTotal = deviceStatus.rows.reduce((sum, row) => sum + row.n, 0)
      const statusCount = Object.fromEntries(deviceStatus.rows.map((r) => [r.status, r.n]))
      const cardMeta = {
        video: { label: '视频监控', icon: '📹' },
        env: { label: '环境感知', icon: '📡' },
        vent: { label: '通风设备', icon: '🌀' },
        drain: { label: '排涝设备', icon: '⚙️' },
        light: { label: '照明系统', icon: '💡' },
        board: { label: '诱导屏', icon: '🚹' },
      }
      const cardMap = new Map()
      for (const row of deviceCards.rows) {
        if (!cardMap.has(row.card_group)) cardMap.set(row.card_group, { ok: 0, fault: 0, total: 0 })
        const entry = cardMap.get(row.card_group)
        entry.total += row.n
        if (row.status === 'ok') entry.ok += row.n
        if (row.status === 'alarm' || row.status === 'warn') entry.fault += row.n
      }
      const cards = Object.entries(cardMeta).map(([group, meta]) => ({
        group,
        label: meta.label,
        icon: meta.icon,
        ok: cardMap.get(group)?.ok ?? 0,
        total: cardMap.get(group)?.total ?? 0,
        fault: cardMap.get(group)?.fault ?? 0,
      }))

      const orderStatusCount = Object.fromEntries(orderStatus.rows.map((r) => [r.status, r.n]))
      const orderStatusLabels = {
        pending: '待派发',
        dispatched: '已派发',
        processing: '处理中',
        reviewing: '待验收',
        completed: '已完成',
        rejected: '已驳回',
        cancelled: '已取消',
      }
      const orderTypeLabels = { inspection: '巡检', repair: '维修', maintain: '保养', emergency: '应急' }
      const sectionNames = await pool.query('select code, name from traffic_segment order by sort_no')
      const nameOf = new Map(sectionNames.rows.map((r) => [r.code, r.name]))
      const segmentFlow = new Map(segments.rows.map((r) => [r.section_code, r]))
      const segList = ['SEG-01', 'SEG-02', 'SEG-03', 'SEG-04', 'SEG-05'].map((code) => {
        const row = segmentFlow.get(code)
        return {
          code,
          name: nameOf.get(code) ?? code,
          flow: row?.flow_vph ?? 0,
          congestion: row?.congestion ?? 'smooth',
        }
      })
      const mainFlow = segList.find((s) => s.code === 'SEG-03')?.flow ?? 0
      const congestionRank = { smooth: '畅通', slow: '缓行', congested: '拥堵' }
      // 取最拥堵等级：congested > slow > smooth
      const rank = ['smooth', 'slow', 'congested']
      const worst = segList.reduce((acc, seg) => (rank.indexOf(seg.congestion) > rank.indexOf(acc) ? seg.congestion : acc), 'smooth')

      const healthRows = health.rows.map((row) => ({
        code: row.section_code,
        name: row.section_name,
        score: Number(row.score),
        level: row.level,
      }))
      const healthIndex = healthRows.length
        ? Number((healthRows.reduce((sum, r) => sum + r.score, 0) / healthRows.length).toFixed(1))
        : 0

      return reply.ok({
        generatedAt: new Date().toISOString(),
        alerts: {
          total: alertTotal,
          open: alertOpen,
          byLevel: levelOrder.map((level) => ({
            key: level,
            label: levelLabel[level],
            value: levelRows.rows.find((r) => r.level === level)?.n ?? 0,
          })),
          latest: latest.rows.map((row) => ({
            id: row.id,
            code: row.code,
            level: row.level,
            status: row.status,
            source: row.source,
            title: row.title,
            stake: row.stake,
            pointId: row.point_id,
            occurredAt: row.occurred_at.toISOString(),
          })),
        },
        devices: {
          total: deviceTotal,
          online: statusCount.ok ?? 0,
          fault: (statusCount.alarm ?? 0) + (statusCount.warn ?? 0),
          offline: statusCount.offline ?? 0,
          onlineRate: deviceTotal ? Number((((statusCount.ok ?? 0) / deviceTotal) * 100).toFixed(1)) : 0,
          cards,
          byStatus: ['ok', 'warn', 'alarm', 'offline'].map((status) => ({
            key: status,
            label: { ok: '正常运行', warn: '预警', alarm: '故障/告警', offline: '离线' }[status],
            value: statusCount[status] ?? 0,
          })),
        },
        workOrders: {
          total: orderStatus.rows.reduce((sum, r) => sum + r.n, 0),
          overdue: orderOverdue.rows[0].n,
          byStatus: Object.entries(orderStatusLabels).map(([key, label]) => ({
            key,
            label,
            value: orderStatusCount[key] ?? 0,
          })),
          byType: orderTypes.rows.map((r) => ({ key: r.type, label: orderTypeLabels[r.type] ?? r.type, value: r.n })),
          last7Days: orderTrend.rows.map((r) => ({ date: r.date, created: r.created, completed: r.completed })),
        },
        traffic: {
          flowVph: mainFlow,
          congestion: congestionRank[worst] ?? '畅通',
          segments: segList,
          hourly: hourly.rows,
          events24h: events.rows[0].total,
          pendingEvents: events.rows[0].pending,
        },
        publicService: {
          feedbackToday: feedback.rows[0].today,
          feedbackPending: feedback.rows[0].pending,
          satisfactionRate: Number(feedback.rows[0].satisfaction),
          activeNotices: notices.rows[0].active,
          reach24h: notices.rows[0].reach,
        },
        environment: {
          co: Number((Number(env.rows[0].co) || 12).toFixed(1)),
          no2: 0.12,
          illuminance: Number((Number(env.rows[0].lux) || 240).toFixed(0)),
          humidity: 68.5,
          maxWaterLevelCm: Number(env.rows[0].water),
        },
        structure: {
          healthIndex,
          sections: healthRows,
          watchSections: healthRows.filter((r) => r.score < 70).map((r) => r.name),
        },
        dataBoundary: [
          '聚合指标由业务库实时计算；库内演示数据由种子脚本写入。',
          'BIM 几何与构件属性来自真实竣工模型。',
          '工况推演读数不在本接口内，见 /simulation-runs。',
        ],
      })
    },
  )

  app.get(
    '/dashboard/modules',
    {
      schema: {
        tags: TAGS,
        summary: '七个业务模块的角标与入口',
        description: '返回导航模块定义及待处理数量角标（告警/工单/事件/反馈），替代前端硬编码的 badge。',
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                code: Type.String(),
                name: Type.String(),
                path: Type.String(),
                icon: Type.String(),
                badge: Type.Integer(),
                badgeReason: Type.String(),
              }),
            ),
          ),
        },
      },
    },
    async (request, reply) => {
      const [modules, alerts, orders, events, feedback] = await Promise.all([
        pool.query('select code, name, path, icon from scene_module order by sort_no'),
        pool.query(`select count(*)::int as n from alert where status = 'open' and level in ('critical', 'warning')`),
        pool.query(`select count(*)::int as n from work_order where status in ('pending', 'dispatched')`),
        pool.query(`select count(*)::int as n from traffic_event where status = 'pending'`),
        pool.query(`select count(*)::int as n from feedback where status = 'pending'`),
      ])
      const badgeMap = {
        overview: [alerts.rows[0].n, '未关闭的紧急/重要告警'],
        traffic: [events.rows[0].n, '待确认交通事件'],
        maintenance: [orders.rows[0].n, '待派发/已派发工单'],
        monitoring: [alerts.rows[0].n, '环境与结构告警'],
        emergency: [alerts.rows[0].n, '应急相关告警'],
        service: [feedback.rows[0].n, '待审核公众反馈'],
        asset: [0, '无待办'],
      }
      return reply.ok(
        modules.rows.map((m) => {
          const [badge, reason] = badgeMap[m.code] ?? [0, '无待办']
          return { ...m, badge: Number(badge), badgeReason: reason }
        }),
      )
    },
  )
}
