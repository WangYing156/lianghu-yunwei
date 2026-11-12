/** 登录 / 当前用户 / 修改口令 */
import { Type } from '@sinclair/typebox'
import { pool } from '../db/pool.js'
import { Envelope } from '../lib/schemas.js'
import { Errors } from '../lib/errors.js'
import { verifyPassword, hashPassword } from '../lib/password.js'

const TAGS = ['认证']

const UserSchema = Type.Object({
  id: Type.Integer(),
  username: Type.String(),
  displayName: Type.String(),
  role: Type.String(),
  dept: Type.Union([Type.String(), Type.Null()]),
  phone: Type.Union([Type.String(), Type.Null()]),
})

export default async function authRoutes(app) {
  app.post(
    '/auth/login',
    {
      schema: {
        tags: TAGS,
        summary: '账号登录，签发 JWT',
        description:
          '演示账号：admin / manager / engineer / operator / viewer，口令均为 Lhsd@2026。令牌放入 Authorization: Bearer <token>。',
        body: Type.Object({
          username: Type.String({ minLength: 2, maxLength: 64, example: 'operator' }),
          password: Type.String({ minLength: 6, maxLength: 64, example: 'Lhsd@2026' }),
        }),
        response: {
          200: Envelope(
            Type.Object({
              token: Type.String(),
              expiresIn: Type.String(),
              user: UserSchema,
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body
      const { rows } = await pool.query(
        'select id, username, display_name, password_hash, role, dept, phone, is_active from sys_user where username = $1',
        [username],
      )
      const user = rows[0]
      if (!user || !verifyPassword(password, user.password_hash)) throw Errors.unauthorized('用户名或口令不正确')
      if (!user.is_active) throw Errors.forbidden('账号已停用，请联系管理员')
      await pool.query('update sys_user set last_login_at = now() where id = $1', [user.id])
      const token = app.jwt.sign(
        { sub: user.id, username: user.username, role: user.role, name: user.display_name },
        { expiresIn: app.config.jwt.expiresIn },
      )
      return reply.ok({
        token,
        expiresIn: app.config.jwt.expiresIn,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          dept: user.dept,
          phone: user.phone,
        },
      })
    },
  )

  app.get(
    '/auth/me',
    {
      preValidation: async (request) => {
        if (!request.user) throw Errors.unauthorized()
      },
      schema: {
        tags: TAGS,
        summary: '当前登录用户',
        security: [{ bearerAuth: [] }],
        
        response: {
          200: Envelope(
            Type.Object({
              id: Type.Integer(),
              username: Type.String(),
              displayName: Type.String(),
              role: Type.String(),
              dept: Type.Union([Type.String(), Type.Null()]),
              phone: Type.Union([Type.String(), Type.Null()]),
              lastLoginAt: Type.Union([Type.String(), Type.Null()]),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        'select id, username, display_name, role, dept, phone, last_login_at from sys_user where id = $1',
        [request.user.id],
      )
      const user = rows[0]
      if (!user) throw Errors.unauthorized()
      return reply.ok({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        dept: user.dept,
        phone: user.phone,
        lastLoginAt: user.last_login_at?.toISOString() ?? null,
      })
    },
  )

  app.post(
    '/auth/change-password',
    {
      preValidation: async (request) => {
        if (!request.user) throw Errors.unauthorized()
      },
      schema: {
        tags: TAGS,
        summary: '修改本人登录口令',
        security: [{ bearerAuth: [] }],
        
        body: Type.Object({
          oldPassword: Type.String({ minLength: 6 }),
          newPassword: Type.String({ minLength: 8, maxLength: 64, description: '至少 8 位' }),
        }),
        response: { 200: Envelope(Type.Object({ changed: Type.Boolean() })) },
      },
    },
    async (request, reply) => {
      const { oldPassword, newPassword } = request.body
      const { rows } = await pool.query('select password_hash from sys_user where id = $1', [request.user.id])
      if (!rows[0] || !verifyPassword(oldPassword, rows[0].password_hash)) throw Errors.badRequest('原口令不正确')
      await pool.query('update sys_user set password_hash = $1, updated_at = now() where id = $2', [
        hashPassword(newPassword),
        request.user.id,
      ])
      return reply.ok({ changed: true })
    },
  )

  app.get(
    '/users',
    {
      preValidation: app.requireManager,
      schema: {
        tags: TAGS,
        summary: '用户列表（需值班长及以上）',
        security: [{ bearerAuth: [] }],
        
        response: { 200: Envelope(Type.Array(UserSchema)) },
      },
    },
    async (request, reply) => {
      const { rows } = await pool.query(
        'select id, username, display_name, role, dept, phone from sys_user order by id',
      )
      return reply.ok(
        rows.map((user) => ({
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          dept: user.dept,
          phone: user.phone,
        })),
      )
    },
  )
}
