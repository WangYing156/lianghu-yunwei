/** 资产资料中心：按点位/构件查台账与资料清单，并补充 BIM 构件属性占位 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope } from '../lib/schemas.js'
import { Errors } from '../lib/errors.js'

const TAGS = ['资产资料']

export default async function assetRoutes(app) {
  app.get(
    '/assets',
    {
      schema: {
        tags: TAGS,
        summary: '资产台账列表（可按分类/系统/桩号筛选）',
        description: '对应资产资料中心左侧列表；每项包含点位、所属系统、安装日期与资料数量。',
        querystring: Type.Object({
          category: Type.Optional(Type.String()),
          system: Type.Optional(Type.String()),
          stake: Type.Optional(Type.String()),
          keyword: Type.Optional(Type.String()),
          withPointOnly: Type.Optional(Type.Boolean({ default: false })),
        }),
        response: {
          200: Envelope(
            Type.Array(
              Type.Object({
                id: Type.Integer(),
                code: Type.String(),
                name: Type.String(),
                categoryCode: Type.String(),
                categoryName: Type.String(),
                systemName: Type.Union([Type.String(), Type.Null()]),
                stake: Type.String(),
                installDate: Type.Union([Type.String(), Type.Null()]),
                status: Type.String(),
                pointId: Type.Union([Type.String(), Type.Null()]),
                documentCount: Type.Integer(),
                alertCount: Type.Integer(),
              }),
            ),
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
      if (q.category) add(q.category, (i) => `d.category_code = $${i}`)
      if (q.system) add(q.system, (i) => `d.system_name = $${i}`)
      if (q.stake) add(q.stake, (i) => `d.stake = $${i}`)
      if (q.keyword) add(`%${q.keyword}%`, (i) => `(d.code ilike $${i} or d.name ilike $${i})`)
      if (q.withPointOnly) conditions.push('d.point_id is not null')
      const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
      const { rows } = await pool.query(
        `select d.id, d.code, d.name, d.category_code, c.name as category_name, d.system_name, d.stake,
                d.install_date, d.status, d.point_id,
                coalesce((d.attrs ->> 'documentCount')::int, 4) as document_count,
                (select count(*)::int from alert a where a.device_id = d.id and a.status <> 'closed') as alert_count
           from device d join device_category c on c.code = d.category_code
           ${where} order by d.category_code, d.code`,
        params,
      )
      return reply.ok(
        rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          categoryCode: row.category_code,
          categoryName: row.category_name,
          systemName: row.system_name,
          stake: row.stake,
          installDate: row.install_date ? row.install_date.toISOString().slice(0, 10) : null,
          status: row.status,
          pointId: row.point_id,
          documentCount: row.document_count,
          alertCount: row.alert_count,
        })),
      )
    },
  )

  app.get(
    '/assets/:id',
    {
      schema: {
        tags: TAGS,
        summary: '资产详情：结构 / 参数 / 材料 / 维保指引 / 资料清单',
        description:
          '四页签内容。真实 BIM 构件属性不在此接口内，前端对未建档构件应回退到 scenetree.json 构件属性。',
        params: Type.Object({ id: Type.Integer() }),
        response: {
          200: Envelope(
            Type.Object({
              asset: Type.Object({
                id: Type.Integer(),
                code: Type.String(),
                name: Type.String(),
                categoryCode: Type.String(),
                categoryName: Type.String(),
                systemName: Type.Union([Type.String(), Type.Null()]),
                stake: Type.String(),
                positionDesc: Type.Union([Type.String(), Type.Null()]),
                model: Type.Union([Type.String(), Type.Null()]),
                vendor: Type.Union([Type.String(), Type.Null()]),
                installDate: Type.Union([Type.String(), Type.Null()]),
                status: Type.String(),
                pointId: Type.Union([Type.String(), Type.Null()]),
              }),
              structure: Type.Array(Type.Object({ key: Type.String(), value: Type.String() })),
              params: Type.Array(Type.Object({ key: Type.String(), value: Type.String() })),
              materials: Type.Array(Type.Object({ key: Type.String(), value: Type.String() })),
              guides: Type.Array(Type.Object({ title: Type.String(), detail: Type.String() })),
              documents: Type.Array(
                Type.Object({
                  name: Type.String(),
                  type: Type.String(),
                  size: Type.String(),
                  date: Type.String(),
                  version: Type.String(),
                }),
              ),
              workOrders: Type.Array(Type.Any()),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select d.*, c.name as category_name from device d
           join device_category c on c.code = d.category_code where d.id = $1::bigint`,
        [request.params.id],
      )
      if (!rows.length) throw Errors.notFound('资产不存在')
      const device = rows[0]
      const attrs = device.attrs ?? {}
      const orders = await pool.query(
        `select id, code, title, status, priority, created_at from work_order where stake = $1 order by created_at desc limit 5`,
        [device.stake],
      )
      return reply.ok({
        asset: {
          id: device.id,
          code: device.code,
          name: device.name,
          categoryCode: device.category_code,
          categoryName: device.category_name,
          systemName: device.system_name,
          stake: device.stake,
          positionDesc: device.position_desc,
          model: device.model,
          vendor: device.vendor,
          installDate: device.install_date ? device.install_date.toISOString().slice(0, 10) : null,
          status: device.status,
          pointId: device.point_id,
        },
        structure: [
          { key: '型号规格', value: device.model ?? '—' },
          { key: '生产厂商', value: device.vendor ?? '—' },
          { key: '安装位置', value: device.position_desc ?? device.stake },
          { key: '所属系统', value: device.system_name ?? '—' },
          { key: '投运日期', value: device.install_date ? device.install_date.toISOString().slice(0, 10) : '—' },
        ],
        params: [
          { key: '运行状态', value: device.run_state ?? '—' },
          { key: '设备编号', value: device.code },
          { key: '通信地址', value: device.ip ?? '未接入' },
        ],
        materials: attrs.materials ?? [
          { key: '主体材质', value: device.category_code === 'pump' ? '铸铁 HT200' : '铝合金' },
          { key: '防腐处理', value: '热镀锌 / 环氧涂层' },
        ],
        guides: attrs.guides ?? [
          { title: '停机断电', detail: '切断电源并挂“检修中”警示牌，确认设备完全静止。' },
          { title: '外观检查', detail: '检查外壳、紧固件与线缆，记录异常。' },
          { title: '功能测试', detail: '按周期做点动试车，确认无异常振动与噪声。' },
        ],
        documents: attrs.documents ?? [
          { name: '产品使用说明书', type: 'PDF', size: '8.2MB', date: '2022-06', version: 'V1.0' },
          { name: '安装竣工图纸', type: 'DWG', size: '12.5MB', date: '2022-07', version: 'V2.1' },
          { name: '维保作业指导书', type: 'PDF', size: '3.1MB', date: '2023-03', version: 'V1.2' },
          { name: '产品合格证', type: 'PDF', size: '0.8MB', date: '2022-06', version: '—' },
        ],
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

  app.get(
    '/assets/by-point/:pointId',
    {
      schema: {
        tags: TAGS,
        summary: '按场景点位查资产（场景点击 → 资料面板）',
        description: '未建档点位返回 404，前端应回退到 BIM 构件属性页签。',
        params: Type.Object({ pointId: Type.String() }),
        response: {
          200: Envelope(Type.Object({ deviceId: Type.Integer(), code: Type.String(), name: Type.String(), hasAsset: Type.Boolean() })),
          404: Type.Object({ code: Type.Integer(), message: Type.String(), traceId: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        `select d.id, d.code, d.name from scene_point p join device d on d.id = p.device_id where p.id = $1`,
        [request.params.pointId],
      )
      if (!rows.length) throw Errors.notFound('该点位未建立资产档案，请回退到 BIM 构件属性')
      return reply.ok({ deviceId: rows[0].id, code: rows[0].code, name: rows[0].name, hasAsset: true })
    },
  )
}
