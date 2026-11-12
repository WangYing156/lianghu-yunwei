/**
 * 鉴权：JWT + 角色。演示环境默认放行读接口（GET），写接口需要相应角色。
 * 角色：admin(管理员) > manager(值班长) > engineer(工程师) > operator(值班员) > viewer(只读)
 */
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import config from '../config.js'
import { Errors } from '../lib/errors.js'

export const ROLE_LEVEL = { viewer: 1, operator: 2, engineer: 3, manager: 4, admin: 5 }

/** 写接口默认放行角色 */
export const WRITE_ROLES = ['admin', 'manager', 'engineer', 'operator']

async function authPlugin(app) {
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  })

  app.decorate('config', config)

  /** 解析可选令牌：无令牌时返回 null（演示环境读接口允许匿名）。
   *  @fastify/jwt 注册后已占用 request.user，这里不再重复声明，直接按需赋值。 */
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    try {
      const payload = await request.jwtVerify()
      request.user = { id: payload.sub, username: payload.username, role: payload.role, name: payload.name }
    } catch {
      // 令牌无效时不在此处抛错，交给 requireAuth 判断，保证公开接口仍可用
      request.user = null
    }
  })

  app.decorate('requireAuth', (minRole = 'viewer') => async (request) => {
    if (!request.user) throw Errors.unauthorized()
    if ((ROLE_LEVEL[request.user.role] ?? 0) < (ROLE_LEVEL[minRole] ?? 1)) throw Errors.forbidden()
  })

  /** 演示环境：读接口可匿名；REQUIRE_AUTH_FOR_READ=true 时全量鉴权 */
  app.decorate('requireReader', async (request) => {
    if (!config.requireAuthForRead) return
    if (!request.user) throw Errors.unauthorized()
  })

  app.decorate('requireWriter', async (request) => {
    if (!request.user) throw Errors.unauthorized()
    if (!WRITE_ROLES.includes(request.user.role)) throw Errors.forbidden()
  })

  /** admin / manager 才能做的审核、配置类动作 */
  app.decorate('requireManager', async (request) => {
    if (!request.user) throw Errors.unauthorized()
    if (!['admin', 'manager'].includes(request.user.role)) throw Errors.forbidden('该操作需值班长或管理员权限')
  })

  app.decorate('currentUser', (request) => request.user ?? null)
}

export default fp(authPlugin, { name: 'auth' })
