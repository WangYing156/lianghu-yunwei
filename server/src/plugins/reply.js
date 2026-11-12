/**
 * 统一响应：成功统一 { code, message, data, traceId }，
 * 失败统一 { code, message, details, traceId }；并使用 schema 序列化加速。
 */
import fp from 'fastify-plugin'
import { ApiError } from '../lib/errors.js'
import { ErrorResponse } from '../lib/schemas.js'

async function replyPlugin(app) {
  app.decorateReply('ok', function ok(data, meta) {
    const body = {
      code: 0,
      message: 'ok',
      data: data ?? null,
      traceId: this.request.id,
    }
    if (meta) body.meta = meta
    return this.send(body)
  })

  app.decorateReply('paged', function paged(result, message = 'ok') {
    return this.send({
      code: 0,
      message,
      data: {
        items: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages ?? (result.pageSize ? Math.ceil(result.total / result.pageSize) : 0),
      },
      traceId: this.request.id,
    })
  })

  app.setErrorHandler((error, request, reply) => {
    const isApi = error instanceof ApiError
    const statusCode = isApi ? error.statusCode : error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
    const code = isApi ? error.code : statusCode === 500 ? 50001 : statusCode
    if (statusCode >= 500) request.log.error({ err: error }, '请求处理失败')
    else request.log.warn({ err: error.message, path: request.url }, '请求被拒绝')
    reply.code(statusCode).send({
      code,
      message: error.message || '服务内部错误',
      details: isApi ? error.details : undefined,
      traceId: request.id,
    })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      code: 40401,
      message: `接口不存在：${request.method} ${request.url}`,
      traceId: request.id,
    })
  })

  // 供 OpenAPI 复用的通用错误响应
  app.addSchema({ $id: 'ErrorResponse', ...ErrorResponse })
}

export default fp(replyPlugin, { name: 'reply' })
