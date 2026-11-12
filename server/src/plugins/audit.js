/**
 * 操作审计：所有写操作（POST/PATCH/PUT/DELETE）成功后落库，用于追溯值班操作。
 */
import fp from 'fastify-plugin'
import { pool } from '../db/pool.js'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const RESOURCE_OF = [
  [/^\/api\/v1\/alerts/, 'alert'],
  [/^\/api\/v1\/devices/, 'device'],
  [/^\/api\/v1\/work-orders/, 'work_order'],
  [/^\/api\/v1\/diseases/, 'disease'],
  [/^\/api\/v1\/traffic-events/, 'traffic_event'],
  [/^\/api\/v1\/publish/, 'publish'],
  [/^\/api\/v1\/feedback/, 'feedback'],
  [/^\/api\/v1\/auth/, 'auth'],
]

function resourceOf(url) {
  const hit = RESOURCE_OF.find(([pattern]) => pattern.test(url))
  return hit ? hit[1] : 'other'
}

async function auditPlugin(app) {
  app.addHook('onResponse', async (request, reply) => {
    if (!WRITE_METHODS.has(request.method)) return
    if (!request.url.startsWith('/api/')) return
    if (reply.statusCode >= 400) return
    const user = request.user
    try {
      await pool.query(
        `insert into audit_log (user_id, username, action, resource, method, path, resource_id, ip, detail)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user?.id ?? null,
          user?.username ?? 'anonymous',
          `${request.method} ${request.routeOptions?.url ?? request.url}`,
          resourceOf(request.url),
          request.method,
          request.url,
          request.params?.id ? String(request.params.id) : null,
          request.ip ?? null,
          JSON.stringify(request.body ?? {}),
        ],
      )
    } catch (error) {
      request.log.error({ err: error }, '审计日志写入失败')
    }
  })
}

export default fp(auditPlugin, { name: 'audit' })
