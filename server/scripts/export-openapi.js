#!/usr/bin/env node
/**
 * 导出 OpenAPI 文档到 docs/openapi.json，便于离线交付与前端类型生成。
 * 用法：npm run openapi:export
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildApp } from '../src/app.js'
import { serverRoot } from '../src/config.js'

const app = await buildApp({ logger: false })
await app.ready()
const spec = app.swagger()
const target = join(serverRoot, 'docs', 'openapi.json')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8')
const paths = Object.keys(spec.paths ?? {})
console.log(`已导出 ${paths.length} 个路径到 ${target}`)
await app.close()
process.exit(0)
