/**
 * Fastify 应用组装：CORS、统一响应、鉴权、审计、OpenAPI 文档与全部业务路由。
 * 不在本文件连接数据库，便于测试用 app.inject 直接调用。
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import config from './config.js'
import replyPlugin from './plugins/reply.js'
import authPlugin from './plugins/auth.js'
import auditPlugin from './plugins/audit.js'
import systemRoutes from './routes/system.js'
import dashboardRoutes from './routes/dashboard.js'
import sceneRoutes from './routes/scene.js'
import alertRoutes from './routes/alerts.js'
import deviceRoutes from './routes/devices.js'
import workOrderRoutes from './routes/workOrders.js'
import diseaseRoutes from './routes/diseases.js'
import monitoringRoutes from './routes/monitoring.js'
import trafficRoutes from './routes/traffic.js'
import serviceRoutes from './routes/service.js'
import emergencyRoutes from './routes/emergency.js'
import assetRoutes from './routes/asset.js'
import authRoutes from './routes/auth.js'

const API_TAGS = [
  { name: '系统', description: '健康检查、元数据、审计日志' },
  { name: '认证', description: '登录、当前用户、口令修改' },
  { name: '总览', description: '驾驶舱聚合指标与模块角标' },
  { name: '场景点位', description: '三维/二维点位目录、图层与模块默认图层' },
  { name: '告警中心', description: '告警查询、统计、确认、关闭、上报' },
  { name: '设备台账', description: '设备列表、详情、遥测、状态回填' },
  { name: '运维工单', description: '工单创建、派发、处置、验收与流转日志' },
  { name: '病害养护', description: '病害上报、统计、闭环与结构健康' },
  { name: '智慧监测', description: '监测读数、时序曲线、巡检与周期维护' },
  { name: '智能交通', description: '视频点位、流量、AI 事件、诱导屏发布' },
  { name: '数字服务', description: '公众反馈、对外预警、安全知识' },
  { name: '数字应急', description: '应急物资、工况推演记录与应急态势' },
  { name: '资产资料', description: '资产台账、四页签资料、点位反查' },
]

export async function buildApp({ logger = true } = {}) {
  const app = Fastify({
    logger:
      logger === true
        ? {
            level: config.logLevel,
            transport:
              config.env === 'development'
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
                : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          }
        : logger,
    ajv: {
      customOptions: {
        coerceTypes: true,
        removeAdditional: 'all',
        useDefaults: true,
        allErrors: false,
        // OpenAPI 的 example 注解不是 JSON Schema 关键字，关闭严格模式以便文档与校验共用同一份 schema
        strict: false,
        keywords: ['example'],
      },
    },
    trustProxy: true,
  })

  await app.register(cors, {
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  })

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: '两湖隧道（南湖段）智能运维管理平台 API',
        version: config.version,
        contact: { name: '两湖隧道智能运维项目组' },
        description: [
          '本服务为前端可视化平台（Vue 3 + Cesium）提供业务数据接口。',
          '',
          '**统一响应**：成功 `{ code: 0, message: "ok", data, traceId }`，失败 `{ code: <业务码>, message, details?, traceId }`。',
          '',
          '**分页参数**：`page`（从 1 开始）、`pageSize`（≤200）。',
          '',
          '**鉴权**：写接口需要 `Authorization: Bearer <token>`（先调用 /auth/login 取令牌）；演示环境读接口可匿名访问，' +
            '把 `REQUIRE_AUTH_FOR_READ=true` 可强制全量鉴权。',
          '角色：viewer < operator < engineer < manager < admin。',
          '',
          '**数据边界**：BIM 几何与构件属性来自真实竣工模型；告警、工单、交通事件、公众反馈与工况推演读数为演示/脚本数据。',
          '本服务不下发真实设备指令，也未接入实时视频流。',
        ].join('\n'),
      },
      tags: API_TAGS,
      servers: [{ url: `http://localhost:${config.port}`, description: '本地开发' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    exposeRoute: true,
  })

  await app.register(swaggerUi, {
    routePrefix: `${config.apiPrefix}/docs`,
    uiConfig: { docExpansion: 'list', deepLinking: true, displayRequestDuration: true, persistAuthorization: true },
    staticCSP: false,
    transformStaticCSP: (header) => header,
    theme: { title: '两湖隧道智能运维 API 文档' },
  })

  await app.register(replyPlugin)
  await app.register(authPlugin)
  await app.register(auditPlugin)

  // 请求追踪号回写到响应头，便于前后端对日志
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  const prefix = config.apiPrefix
  await app.register(
    async (scope) => {
      await scope.register(systemRoutes)
      await scope.register(authRoutes)
      await scope.register(dashboardRoutes)
      await scope.register(sceneRoutes)
      await scope.register(alertRoutes)
      await scope.register(deviceRoutes)
      await scope.register(workOrderRoutes)
      await scope.register(diseaseRoutes)
      await scope.register(monitoringRoutes)
      await scope.register(trafficRoutes)
      await scope.register(serviceRoutes)
      await scope.register(emergencyRoutes)
      await scope.register(assetRoutes)
    },
    { prefix },
  )

  // 根路径给出接口索引，方便现场直接点开
  app.get('/', async (request, reply) => {
    reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>两湖隧道智能运维 API</title>
<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#061428;color:#dbe9ff;padding:48px;line-height:1.7}
a{color:#4ee6ff}code{background:#0f2a52;padding:2px 6px;border-radius:4px}h1{font-size:24px}
.card{max-width:820px;margin:0 auto;border:1px solid #1d3f6f;border-radius:12px;padding:28px;background:#081c3a}</style></head>
<body><div class="card"><h1>两湖隧道（南湖段）智能运维管理平台 API</h1>
<p>版本 ${config.version} · 环境 ${config.env}</p>
<p><a href="${prefix}/docs">📖 在线接口文档（Swagger UI）</a> · <a href="${prefix}/docs/json">OpenAPI JSON</a></p>
<p>健康检查：<a href="${prefix}/health">${prefix}/health</a> · 元数据：<a href="${prefix}/meta">${prefix}/meta</a></p>
<p>接口前缀：<code>${prefix}</code></p></div></body></html>`)
  })

  return app
}

export default buildApp
