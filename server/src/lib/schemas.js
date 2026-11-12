/**
 * 统一响应信封 + 分页 + 错误码，全部以 schema 暴露到 OpenAPI，
 * 使在线文档能直接看到真实响应结构。
 */
import { Type } from '@sinclair/typebox'

export const Envelope = (dataSchema, description = '业务数据') =>
  Type.Object(
    {
      code: Type.Integer({ description: '业务状态码，0 表示成功', example: 0 }),
      message: Type.String({ description: '提示信息', example: 'ok' }),
      data: dataSchema,
      traceId: Type.String({ description: '请求追踪号，便于日志排查' }),
    },
    { description },
  )

export const Nullable = (schema) => Type.Union([schema, Type.Null()])

export const PagedOf = (itemSchema, description = '分页结果') =>
  Type.Object(
    {
      items: Type.Array(itemSchema),
      page: Type.Integer({ description: '当前页码，从 1 开始' }),
      pageSize: Type.Integer({ description: '每页条数' }),
      total: Type.Integer({ description: '总条数' }),
      totalPages: Type.Integer({ description: '总页数' }),
    },
    { description },
  )

export const PagedEnvelope = (itemSchema, description) => Envelope(PagedOf(itemSchema, description), description)

export const PageQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1, description: '页码' })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20, description: '每页条数' })),
})

export const IdParam = Type.Object({
  id: Type.Integer({ description: '主键 ID' }),
})

export const CodeParam = Type.Object({
  code: Type.String({ description: '业务编号' }),
})

export const TimeRangeQuery = Type.Object({
  from: Type.Optional(Type.String({ format: 'date-time', description: '开始时间（ISO8601，缺省按 hours 推算）' })),
  to: Type.Optional(Type.String({ format: 'date-time', description: '结束时间（ISO8601，缺省为当前时间）' })),
  hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 8760, description: '未给 from 时向前回溯小时数' })),
})

export const HealthResponse = Envelope(
  Type.Object({
    status: Type.String({ example: 'ok' }),
    database: Type.String({ example: 'ok' }),
    latencyMs: Type.Integer(),
    serverTime: Type.String({ format: 'date-time' }),
    version: Type.String(),
    env: Type.String(),
  }),
  '健康检查',
)

export const ErrorResponse = Type.Object({
  code: Type.Integer({ description: '业务错误码', example: 40001 }),
  message: Type.String({ example: '请求参数不合法' }),
  traceId: Type.String(),
  details: Type.Optional(Type.Unknown()),
})

export default { Envelope, PagedOf, PagedEnvelope, PageQuery, IdParam, TimeRangeQuery, HealthResponse, ErrorResponse }
