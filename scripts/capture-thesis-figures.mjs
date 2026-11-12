import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const out = path.resolve('docs/论文/images')
await fs.mkdir(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-dev-shm-usage', '--use-angle=d3d11'],
})
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})
page.setDefaultTimeout(90000)

async function shot(name) {
  await page.screenshot({ path: path.join(out, name), type: 'png' })
  console.log('saved', name)
}

async function settle(ms = 8000) {
  await page.waitForTimeout(ms)
}

await page.goto('http://127.0.0.1:5188/#/overview', { waitUntil: 'networkidle' })
await page.locator('.scene-toolbar').waitFor()
await settle(12000)
await shot('fig-overview.png')

const sectionBtn = page.getByRole('button', { name: '剖切' }).first()
await sectionBtn.click()
await page.locator('.el-popper:visible .el-switch').first().click({ force: true })
await settle(2500)
await shot('fig-section.png')
await page.keyboard.press('Escape')
await settle(400)

const roam = page.getByRole('button', { name: '内部巡游' })
await roam.click()
await settle(6000)
await shot('fig-roaming.png')
const exit = page.getByRole('button', { name: '退出巡游' })
if (await exit.count()) await exit.click()
await settle(1500)

await page.goto('http://127.0.0.1:5188/#/emergency', { waitUntil: 'networkidle' })
await settle(5000)
await shot('fig-emergency.png')

await page.goto('http://127.0.0.1:5188/#/asset', { waitUntil: 'networkidle' })
await settle(5000)
await shot('fig-asset.png')

await page.goto('http://127.0.0.1:5188/#/monitoring', { waitUntil: 'networkidle' })
await settle(4000)
await shot('fig-monitoring.png')

await browser.close()
