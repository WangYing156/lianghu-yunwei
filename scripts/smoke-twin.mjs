import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium as pw } from 'playwright-core'

/** 孪生 VR 仿真 + 风机气流动效验收：数字应急页四个工况逐一进入、切步、截图、退出。 */
const baseUrl = (process.env.SCENE_URL || 'http://localhost:5188').replace(/\/$/, '')
const artifacts = process.env.SCENE_ARTIFACTS || '.build-check'
await fs.mkdir(artifacts, { recursive: true })
const browser = await pw.launch({
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : { channel: 'chrome' }),
  args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  headless: true,
})
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 960 } })
).newPage()
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
const shot = (name) =>
  page.screenshot({ path: path.join(artifacts, `twin-${name}.png`) })
const pass = (name) => console.log(`PASS ${name}`)

try {
  await page.goto(`${baseUrl}/#/emergency`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => window.__tunnelCesium && !window.__tunnelCesium.viewer.isDestroyed(),
    { timeout: 180000 },
  )
  await page.waitForFunction(() => window.__tunnelCesium.airflow.state.fanCount > 0, {
    timeout: 180000,
  })
  const fx = await page.evaluate(() => {
    const t = window.__tunnelCesium
    return {
      fans: t.airflow.state.fanCount,
      markers: t.markers.modelEntities.length,
      clustering: t.markers.normalSource.clustering.enabled,
      points: t.getPoints().map((p) => p.id),
    }
  })
  assert.equal(fx.fans, 16)
  assert.equal(fx.markers, 0, 'BIM 构件图标默认隐藏')
  assert.equal(fx.clustering, false, '点位聚合默认关闭')
  assert.ok(fx.points.every((id) => !id.startsWith('demo-alert-') && !id.startsWith('cctv-')))
  pass(`风机动效挂载 ${fx.fans} 台；点位 ${fx.points.length} 个均为页面原始点位`)

  for (const [label, id] of [
    ['火灾疏散', 'fire'],
    ['积水排涝', 'flood'],
    ['交通事故', 'accident'],
    ['日常巡检', 'patrol'],
  ]) {
    await page.locator('.vr-card').filter({ hasText: label }).click()
    await page.getByRole('button', { name: /进入孪生仿真|重新进入当前工况/ }).click()
    await page.waitForFunction(
      (id) => {
        const s = window.__tunnelCesium?.simulation?.state
        return s?.active && !s.loading && s.scenario === id
      },
      id,
      { timeout: 120000 },
    )
    await page.locator('.twin-hud').waitFor({ state: 'visible' })
    await page.waitForTimeout(id === 'patrol' ? 4000 : 7000)
    await shot(`${id}-0`)
    await page.locator('.twin-hud__brief li').nth(2).click()
    await page.waitForTimeout(3500)
    await shot(`${id}-2`)
    const state = await page.evaluate(() => ({
      step: window.__tunnelCesium.simulation.state.step,
      roaming: window.__tunnelCesium.modelRoaming.state.active,
    }))
    assert.equal(state.step, 2)
    assert.equal(state.roaming, true)
    pass(`${label}：进入、驶近、切换步骤`)
  }
  await page.locator('.twin-hud__exit').click()
  await page.waitForFunction(
    () =>
      !window.__tunnelCesium.simulation.state.active &&
      !window.__tunnelCesium.modelRoaming.state.active,
  )
  pass('退出仿真恢复场景')
  assert.deepEqual(errors, [])
  pass('无运行时错误')
} catch (error) {
  console.error('FAIL', error.stack)
  console.error('ERRORS', errors)
  await shot('failure').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
