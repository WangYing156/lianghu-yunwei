import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium as pw } from 'playwright-core'

/**
 * 孪生工况推演验收：数字应急页四个工况逐一进入、切步暂停、截图、退出并恢复场景状态。
 * 只针对开发服务的 DEV 场景检查钩子；失败时非零退出，报告/截图写入 Git 忽略目录。
 */
const baseUrl = (process.env.SCENE_URL || 'http://localhost:5188').replace(/\/$/, '')
const artifacts = process.env.SCENE_ARTIFACTS || '.build-check'
await fs.mkdir(artifacts, { recursive: true })
const report = {
  checks: [],
  pageErrors: [],
  consoleErrors: [],
  networkAborts: [],
  failedRequests: [],
  screenshotWarnings: [],
  failure: null,
}
const browser = await pw.launch({
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : { channel: 'chrome' }),
  args: process.env.CHROMIUM_ARGS
    ? JSON.parse(process.env.CHROMIUM_ARGS)
    : ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1600, height: 960 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.setDefaultTimeout(180000)
page.on('pageerror', (e) => {
  report.pageErrors.push({ name: e.name, message: e.message, stack: e.stack })
  console.log('PAGE ERROR', e.message)
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const text = m.text()
  // Cesium 切换相机时会取消尚未返回的瓦片请求；软件渲染下表现为资源连接关闭，不算页面错误。
  if (/Failed to load resource/.test(text) && /ERR_(CONNECTION_CLOSED|ABORTED)/.test(text))
    report.networkAborts.push(text)
  else report.consoleErrors.push(text)
})
page.on('requestfailed', (r) => {
  if (report.failedRequests.length < 50)
    report.failedRequests.push({ url: r.url(), failure: r.failure()?.errorText || '' })
})
await page.addInitScript(() => {
  window.__browserUnhandled = []
  window.addEventListener('unhandledrejection', (e) => {
    window.__browserUnhandled.push({ kind: 'promise', reason: String(e.reason) })
  })
  window.addEventListener('error', (e) => {
    window.__browserUnhandled.push({ kind: 'error', message: e.message })
  })
})
// 仅软件渲染验收时降低测试画布分辨率；不会改动应用源码或生产设置。
if (process.env.SCENE_SMOKE_SOFTWARE === '1')
  await page.route('**/src/composables/useCesiumTunnelMap.ts*', async (route) => {
    const response = await route.fetch()
    let body = await response.text()
    body = body
      .replace(/v\.resolutionScale = .*?;/, 'v.resolutionScale = 0.3;')
      .replace('v.targetFrameRate = 45', 'v.targetFrameRate = 10')
      .replace(
        'ao.enabled = Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(v.scene)',
        'ao.enabled = false',
      )
    await route.fulfill({ response, body })
  })

const writeReport = () =>
  fs.writeFile(
    path.join(artifacts, 'twin-interactions.json'),
    JSON.stringify(report, null, 2),
  )
const check = async (name, fn) => {
  await fn()
  report.checks.push(name)
  console.log(`PASS ${report.checks.length}. ${name}`)
  await writeReport()
}
const shot = async (name) => {
  try {
    await page.screenshot({
      path: path.join(artifacts, `twin-${name}.png`),
      timeout: 180000,
      animations: 'disabled',
      caret: 'initial',
    })
  } catch (err) {
    // 软件渲染下个别截图可能等待合成器超时；这不是页面 / Cesium 错误，但必须留痕。
    const message = err instanceof Error ? err.message : String(err)
    report.screenshotWarnings.push({ name, message })
    console.log(`WARN screenshot ${name}: ${message}`)
    await writeReport()
  }
}
const simState = () =>
  page.evaluate(() => {
    const t = window.__tunnelCesium
    return {
      sim: { ...t.twin.state },
      roaming: t.modelRoaming.state.active,
      airflow: t.partialFx.state.airflow,
      seeThrough: t.partialFx.state.seeThrough,
      roamView: t.partialFx.state.roamView,
      overridden: t.partialFx.state.overridden,
      clearance: { ...t.twin.state.clearance },
      error: t.twin.state.error,
    }
  })

try {
  await page.goto(`${baseUrl}/#/emergency`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => window.__tunnelCesium && !window.__tunnelCesium.viewer.isDestroyed(),
    { timeout: 180000 },
  )
  await page.waitForFunction(() => window.__tunnelCesium.partialFx.state.fanCount > 0, {
    timeout: 180000,
  })
  const fx = await page.evaluate(() => {
    const t = window.__tunnelCesium
    return {
      fans: t.partialFx.state.fanCount,
      markers: t.markers.modelEntities.length,
      clustering: t.markers.normalSource.clustering.enabled,
      airflow: t.partialFx.state.airflow,
      seeThrough: t.partialFx.state.seeThrough,
      roamView: t.partialFx.state.roamView,
      overridden: t.partialFx.state.overridden,
      points: t.getPoints().map((p) => String(p.id)),
    }
  })
  await check('风机动效挂载 16 台；点位为页面原始点位', () => {
    assert.equal(fx.fans, 16)
    assert.equal(fx.markers, 0, 'BIM 构件图标默认隐藏')
    assert.equal(fx.clustering, false, '点位聚合默认关闭')
    assert.equal(typeof fx.airflow, 'boolean')
    assert.equal(fx.overridden, false)
    assert.ok(fx.points.every((id) => !id.startsWith('demo-alert-') && !id.startsWith('cctv-')))
  })

  const scenarios = [
    ['火灾疏散', 'fire'],
    ['积水排涝', 'flood'],
    ['交通事故', 'accident'],
    ['日常巡检', 'patrol'],
  ]
  for (const [i, [label, id]] of scenarios.entries()) {
    await page.locator('.vr-card').filter({ hasText: label }).click()
    if (i === 0) {
      await page.getByRole('button', { name: /进入孪生仿真/ }).click()
    }
    // 运行中切换工况会在场景状态机里从步骤 0 重新构建，不需要沿用旧步骤。
    await page.waitForFunction(
      (sid) => {
        const s = window.__tunnelCesium?.twin?.state
        return s?.active && !s.loading && s.scenario === sid && s.step === 0
      },
      id,
      { timeout: 120000 },
    )
    await page.locator('.twin-hud').waitFor({ state: 'visible' })
    await page.waitForTimeout(id === 'patrol' ? 3500 : 6000)
    const running = await simState()
    await check(`${label}：主视图进入、风机保持运行、推演值边界可见`, () => {
      assert.equal(running.sim.scenario, id)
      assert.equal(running.sim.active, true)
      assert.equal(running.roaming, false, '孪生仿真不应同时启动内部巡游')
      assert.equal(running.airflow, true, '仿真期间真实风机气流应保持可见')
      assert.equal(running.overridden, true, '仿真期间应接管风机工况')
      assert.equal(running.clearance.ok, true, '运行中车辆净距与标线避让应持续通过')
      assert.equal(running.error, '')
    })
    await shot(`${id}-0`)

    await page.locator('.twin-hud__brief li').nth(2).click()
    await page.waitForTimeout(1200)
    const stepped = await simState()
    await check(`${label}：点击步骤 3 暂停以便检视`, () => {
      assert.equal(stepped.sim.step, 2)
      assert.equal(stepped.sim.playing, false, '点击步骤应暂停以便检视')
      assert.equal(stepped.sim.finished, false)
    })
    await shot(`${id}-2`)
    await page.locator('.twin-hud__clearance').filter({ hasText: '车辆净距校核' }).waitFor({ state: 'visible' })
    const geometry = await page.evaluate(() => window.__tunnelCesium.twin.geometryAudit())
    await check(`${label}：车辆不穿模、不踩引导线，净距求解通过`, () => {
      assert.equal(geometry.ok, true, JSON.stringify(geometry.violations))
      assert.deepEqual(geometry.violations, [])
      assert.ok(geometry.vehicles >= (id === 'patrol' ? 0 : 2), '事件工况应保留可观察车辆')
      assert.ok(geometry.minVehicleGap >= -1e-6, '车辆之间不得穿模')
      assert.ok(geometry.minGuideGap >= -1e-6, '车辆不得压标线或诱导线')
      assert.ok(geometry.minObstacleGap >= -1e-6, '车辆不得与积水/泵站/锥桶穿模')
    })
  }

  await page.locator('.twin-hud__exit').click()
  await page.waitForFunction(
    () =>
      !window.__tunnelCesium.twin.state.active &&
      !window.__tunnelCesium.modelRoaming.state.active,
  )
  const restored = await simState()
  await check('退出推演恢复进入前的气流、透视、漫游视图并释放风机覆写', () => {
    assert.equal(restored.airflow, fx.airflow)
    assert.equal(restored.seeThrough, fx.seeThrough)
    assert.equal(restored.roamView, fx.roamView)
    assert.equal(restored.overridden, false)
    assert.equal(restored.error, '')
  })
  const unhandled = await page.evaluate(() => window.__browserUnhandled || [])
  await check('无 JavaScript / Cesium 页面错误（允许瓦片请求取消）', () => {
    assert.deepEqual(report.pageErrors, [])
    assert.deepEqual(report.consoleErrors, [])
    assert.deepEqual(unhandled, [])
    assert.ok(
      report.failedRequests.every((r) => /ERR_(CONNECTION_CLOSED|ABORTED)/.test(r.failure)),
      `存在非预期网络失败：${JSON.stringify(report.failedRequests.slice(0, 3))}`,
    )
  })
} catch (error) {
  report.failure = error.stack || String(error)
  console.error('FAIL', report.failure)
  console.error('ERRORS', report.pageErrors, report.consoleErrors)
  await writeReport()
  await shot('failure').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
