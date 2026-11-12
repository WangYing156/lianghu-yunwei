#!/usr/bin/env node
/**
 * 数据库自检：Windows 一键启动脚本在启动服务前调用。
 * 检查 TCP 连通 → 认证 → 目标库 → 表结构 → 演示数据，并给出可执行的修复建议。
 * 退出码：0 全通过；1 有阻断项（服务无法启动）；2 仅警告。
 */
import net from 'node:net'
import { Client } from 'pg'
import config from '../src/config.js'

const REQUIRED_TABLES = [
  'sys_user',
  'audit_log',
  'tunnel_section',
  'device_category',
  'device',
  'telemetry',
  'alert',
  'disease',
  'work_order',
  'work_order_log',
  'inspection_task',
  'maintenance_plan',
  'structural_health',
  'camera',
  'traffic_event',
  'traffic_segment',
  'traffic_flow',
  'info_board',
  'publish_task',
  'feedback',
  'public_notice',
  'safety_article',
  'emergency_material',
  'simulation_run',
  'scene_module',
  'scene_point',
]

const results = []
function record(level, name, detail) {
  results.push({ level, name, detail })
  const icon = level === 'ok' ? '✔' : level === 'warn' ? '!' : '✘'
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`)
}

function tcpCheck(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (ok, error) => {
      socket.destroy()
      resolve({ ok, error })
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false, '连接超时（检查防火墙 / pg_hba.conf 是否允许该网段）'))
    socket.once('error', (error) => done(false, error.message))
  })
}

async function main() {
  console.log('=== 两湖隧道智能运维后端 · 数据库自检 ===')
  console.log(`目标：${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}\n`)

  const tcp = await tcpCheck(config.db.host, config.db.port)
  if (!tcp.ok) {
    record('error', 'TCP 连通性', tcp.error)
    console.log('\n修复建议：确认 PostgreSQL 已启动、172.28.12.194 可达，并在 postgresql.conf 中设置 listen_addresses = \'*\'。')
    finish()
    return
  }
  record('ok', 'TCP 连通性', `${config.db.host}:${config.db.port} 可连接`)

  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
    connectionTimeoutMillis: 8000,
  })
  try {
    await client.connect()
    const version = await client.query('show server_version')
    record('ok', '账号认证', `PostgreSQL ${version.rows[0].server_version}`)
  } catch (error) {
    record('error', '账号认证', error.message)
    console.log('\n修复建议：核对 server/.env 中 PGUSER / PGPASSWORD；若报 "no pg_hba.conf entry"，请为客户端网段添加 host 规则。')
    await client.end().catch(() => {})
    finish()
    return
  }

  const dbExists = await client.query('select 1 from pg_database where datname = $1', [config.db.database])
  await client.end()
  if (!dbExists.rows.length) {
    record('error', '目标数据库', `${config.db.database} 不存在`)
    console.log(`\n修复建议：在服务器执行 —— createdb -h ${config.db.host} -U ${config.db.user} ${config.db.database}`)
    console.log('或执行本仓库脚本：npm run db:reset（会建库并初始化结构）')
    finish()
    return
  }
  record('ok', '目标数据库', `${config.db.database} 存在`)

  const appClient = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    connectionTimeoutMillis: 8000,
  })
  try {
    await appClient.connect()
    const { rows } = await appClient.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    )
    const existing = new Set(rows.map((row) => row.table_name))
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))
    if (missing.length) {
      record('warn', '表结构', `缺少 ${missing.length} 张表：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`)
      console.log('  服务启动时会自动执行迁移（AUTO_MIGRATE=true），也可手动执行：npm run db:migrate')
    } else {
      record('ok', '表结构', `${REQUIRED_TABLES.length} 张业务表齐全`)
    }

    if (existing.has('device') && existing.has('alert')) {
      const counts = await appClient.query(`
        select (select count(*) from sys_user)::int as users,
               (select count(*) from device)::int as devices,
               (select count(*) from alert)::int as alerts,
               (select count(*) from work_order)::int as orders,
               (select count(*) from scene_point)::int as points,
               (select count(*) from telemetry)::int as telemetry
      `)
      const row = counts.rows[0]
      if (row.devices === 0) {
        record('warn', '演示数据', '设备表为空，服务启动时会自动写入种子数据')
      } else {
        record(
          'ok',
          '演示数据',
          `用户 ${row.users} · 设备 ${row.devices} · 告警 ${row.alerts} · 工单 ${row.orders} · 点位 ${row.points} · 遥测 ${row.telemetry}`,
        )
      }
    } else {
      record('warn', '演示数据', '结构尚未初始化，服务启动时会自动迁移并写入种子数据')
    }
    await appClient.end()
  } catch (error) {
    record('error', '业务库查询', error.message)
    await appClient.end().catch(() => {})
  }

  finish()
}

function finish() {
  const failed = results.filter((r) => r.level === 'error')
  const warned = results.filter((r) => r.level === 'warn')
  console.log('')
  if (failed.length) {
    console.log(`自检结果：失败（${failed.length} 项阻断）。请按上面的建议处理后重试。`)
    process.exit(1)
  }
  if (warned.length) {
    console.log(`自检结果：通过（${warned.length} 项警告，服务启动会自动补齐）。`)
    process.exit(0)
  }
  console.log('自检结果：全部通过。')
  process.exit(0)
}

main().catch((error) => {
  console.error('自检脚本异常:', error)
  process.exit(1)
})
