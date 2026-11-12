/** 系统类接口：健康检查、元数据、审计日志 */
import { Type } from '@sinclair/typebox'
import config from '../config.js'
import { pool } from '../db/pool.js'
import { Envelope, PagedEnvelope, PageQuery } from '../lib/schemas.js'
import { pagination } from '../lib/format.js'
import { ERRORS_BY_CODE } from '../lib/codes.js'
import { DEMO_USERS } from '../db/seed/users.js'

const TAGS = ['系统']

const HealthSchema = Envelope(
  Type.Object({
    status: Type.String({ example: 'ok' }),
    database: Type.String({ example: 'ok' }),
    latencyMs: Type.Integer(),
    serverTime: Type.String(),
    version: Type.String(),
    env: Type.String(),
    uptimeSeconds: Type.Integer(),
  }),
  '健康检查',
)

export default async function systemRoutes(app) {
  app.get(
    '/health',
    {
      schema: {
        tags: TAGS,
        summary: '健康检查',
        description: '返回服务与数据库连通状态，供 Windows 启动脚本与运维探针使用。',
        response: { 200: HealthSchema },
      },
    },
    async (request, reply) => {
      const started = Date.now()
      let database = 'down'
      try {
        await pool.query('select 1')
        database = 'ok'
      } catch {
        database = 'down'
      }
      const body = {
        status: database === 'ok' ? 'ok' : 'degraded',
        database,
        latencyMs: Date.now() - started,
        serverTime: new Date().toISOString(),
        version: config.version,
        env: config.env,
        uptimeSeconds: Math.round(process.uptime()),
      }
      return reply.code(database === 'ok' ? 200 : 200).send({ code: 0, message: 'ok', data: body, traceId: request.id })
    },
  )

  app.get(
    '/meta',
    {
      schema: {
        tags: TAGS,
        summary: '平台元数据',
        description: '一次性下发枚举字典、页面模块、角色、错误码与演示账号，前端可据此渲染筛选器与权限提示。',
        response: {
          200: Envelope(
            Type.Object({
              platform: Type.Object({
                name: Type.String(),
                version: Type.String(),
                env: Type.String(),
                apiPrefix: Type.String(),
                docsUrl: Type.String(),
              }),
              enums: Type.Object({
                alertLevel: Type.Array(Type.Object({ value: Type.String(), label: Type.String(), color: Type.String() })),
                alertStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                deviceStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                workOrderStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                diseaseStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                diseaseType: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                severity: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                trafficEventType: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                feedbackStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                publishStatus: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                roles: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
                pointGroups: Type.Array(Type.Object({ value: Type.String(), label: Type.String() })),
              }),
              modules: Type.Array(Type.Object({ code: Type.String(), name: Type.String(), path: Type.String(), icon: Type.String() })),
              errorCodes: Type.Array(Type.Object({ code: Type.Integer(), message: Type.String() })),
              demoAccounts: Type.Array(Type.Object({ username: Type.String(), role: Type.String(), password: Type.String() })),
              dataBoundary: Type.Array(Type.String()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const modules = await pool.query('select code, name, path, icon from scene_module order by sort_no')
      return reply.ok({
        platform: {
          name: '两湖隧道（南湖段）智能运维管理平台',
          version: config.version,
          env: config.env,
          apiPrefix: config.apiPrefix,
          docsUrl: `${config.apiPrefix}/docs`,
        },
        enums: {
          alertLevel: [
            { value: 'critical', label: '紧急', color: '#f08d91' },
            { value: 'warning', label: '重要', color: '#e6b779' },
            { value: 'info', label: '一般', color: '#7fb7db' },
            { value: 'notice', label: '提示', color: '#879cb0' },
          ],
          alertStatus: [
            { value: 'open', label: '未确认' },
            { value: 'acknowledged', label: '已确认' },
            { value: 'closed', label: '已关闭' },
          ],
          deviceStatus: [
            { value: 'ok', label: '正常' },
            { value: 'warn', label: '预警' },
            { value: 'alarm', label: '告警' },
            { value: 'offline', label: '离线' },
          ],
          workOrderStatus: [
            { value: 'pending', label: '待派发' },
            { value: 'dispatched', label: '已派发' },
            { value: 'processing', label: '处理中' },
            { value: 'reviewing', label: '待验收' },
            { value: 'completed', label: '已完成' },
            { value: 'rejected', label: '已驳回' },
            { value: 'cancelled', label: '已取消' },
          ],
          diseaseStatus: [
            { value: 'found', label: '病害发现' },
            { value: 'dispatched', label: '审核派发' },
            { value: 'repairing', label: '维修处置' },
            { value: 'reviewing', label: '现场验收' },
            { value: 'completed', label: '闭环归档' },
            { value: 'rejected', label: '已驳回' },
          ],
          diseaseType: [
            { value: 'crack', label: '裂缝' },
            { value: 'seepage', label: '渗漏水' },
            { value: 'spalling', label: '剥落' },
            { value: 'joint', label: '变形缝' },
            { value: 'corrosion', label: '腐蚀' },
            { value: 'other', label: '其他' },
          ],
          severity: [
            { value: 'slight', label: '轻微' },
            { value: 'medium', label: '中等' },
            { value: 'severe', label: '严重' },
          ],
          trafficEventType: [
            { value: 'parking', label: '违停' },
            { value: 'congestion', label: '拥堵' },
            { value: 'debris', label: '抛洒物' },
            { value: 'pedestrian', label: '行人闯入' },
            { value: 'wrongway', label: '逆行' },
            { value: 'accident', label: '事故' },
            { value: 'other', label: '其他' },
          ],
          feedbackStatus: [
            { value: 'pending', label: '待审核' },
            { value: 'reviewed', label: '已审核' },
            { value: 'converted', label: '已转工单' },
            { value: 'invalid', label: '无效反馈' },
            { value: 'closed', label: '已关闭' },
          ],
          publishStatus: [
            { value: 'draft', label: '草稿' },
            { value: 'pending_review', label: '待审核' },
            { value: 'published', label: '已发布' },
            { value: 'offline', label: '已下刊' },
            { value: 'rejected', label: '已驳回' },
          ],
          roles: [
            { value: 'admin', label: '管理员' },
            { value: 'manager', label: '值班长' },
            { value: 'engineer', label: '工程师' },
            { value: 'operator', label: '值班员' },
            { value: 'viewer', label: '只读' },
          ],
          pointGroups: [
            { value: 'structure', label: '隧道主体' },
            { value: 'env', label: '环控系统' },
            { value: 'traffic', label: '交通管控' },
            { value: 'monitor', label: '结构监测' },
            { value: 'mep', label: '隧道机电' },
          ],
        },
        modules: modules.rows,
        errorCodes: ERRORS_BY_CODE,
        demoAccounts: DEMO_USERS.map((u) => ({ username: u.username, role: u.role, password: 'Lhsd@2026' })),
        dataBoundary: [
          'BIM 几何、构件属性、竣工模型设备位置来自真实模型。',
          '告警、工单、交通事件、公众反馈、工况推演读数为演示数据，结构已按生产口径设计。',
          '视频点位仅登记台账与示例画面，未接入实时视频流与云台控制。',
          '本服务不真实下发诱导屏内容、不控制现场设备。',
        ],
      })
    },
  )

  app.get(
    '/audit-logs',
    {
      preValidation: app.requireManager,
      schema: {
        tags: TAGS,
        summary: '操作审计日志（需值班长及以上）',
        querystring: Type.Composite([PageQuery, Type.Object({ resource: Type.Optional(Type.String()) })]),
        response: {
          200: PagedEnvelope(
            Type.Object({
              id: Type.Integer(),
              username: Type.Union([Type.String(), Type.Null()]),
              action: Type.String(),
              resource: Type.String(),
              method: Type.Union([Type.String(), Type.Null()]),
              path: Type.Union([Type.String(), Type.Null()]),
              resourceId: Type.Union([Type.String(), Type.Null()]),
              ip: Type.Union([Type.String(), Type.Null()]),
              createdAt: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, offset, limit } = pagination(request.query)
      const { resource } = request.query
      const where = resource ? 'where resource = $3' : ''
      const params = resource ? [limit, offset, resource] : [limit, offset]
      const { rows } = await pool.query(
        `select id, username, action, resource, method, path, resource_id, host(ip) as ip, created_at
         from audit_log ${where} order by created_at desc limit $1 offset $2`,
        params,
      )
      const { rows: countRows } = await pool.query(`select count(*)::int as n from audit_log ${where}`, resource ? [resource] : [])
      return reply.paged({
        items: rows.map((r) => ({
          id: r.id,
          username: r.username,
          action: r.action,
          resource: r.resource,
          method: r.method,
          path: r.path,
          resourceId: r.resource_id,
          ip: r.ip,
          createdAt: r.created_at.toISOString(),
        })),
        page,
        pageSize,
        total: countRows[0].n,
      })
    },
  )
}
