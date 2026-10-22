import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium as pw } from 'playwright-core'
import path from 'node:path'

const report = { checks: [], pageErrors: [], consoleErrors: [], failure: null }
const baseUrl = (process.env.SCENE_URL || 'http://localhost:5188').replace(
  /\/$/,
  '',
)
const artifacts = process.env.SCENE_ARTIFACTS || '.build-check'
await fs.mkdir(artifacts, { recursive: true })
const browser = await pw.launch({
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : { channel: 'chrome' }),
  args: process.env.CHROMIUM_ARGS
    ? JSON.parse(process.env.CHROMIUM_ARGS)
    : ['--disable-dev-shm-usage'],
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.setDefaultTimeout(60000)
page.on('pageerror', (e) => {
  report.pageErrors.push({ name: e.name, message: e.message, stack: e.stack })
  console.log(
    'PAGE ERROR',
    JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
  )
})
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text())
})
await page.addInitScript(() => {
  window.__browserUnhandled = []
  window.addEventListener('unhandledrejection', (e) => {
    window.__browserUnhandled.push({
      kind: 'promise',
      reason: String(e.reason),
      name: e.reason?.name,
      message: e.reason?.message,
      stack: e.reason?.stack,
    })
  })
  window.addEventListener('error', (e) => {
    window.__browserUnhandled.push({
      kind: 'error',
      message: e.message,
      name: e.error?.name,
      error: String(e.error),
      stack: e.error?.stack,
    })
  })
})
// 仅软件渲染验收时降低测试画布分辨率；不会改动应用源码或生产设置。
if (process.env.SCENE_SMOKE_SOFTWARE === '1')
  await page.route(
    '**/src/composables/useCesiumTunnelMap.ts*',
    async (route) => {
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
    },
  )
const check = async (name, fn) => {
  await fn()
  report.checks.push(name)
  console.log(`PASS ${report.checks.length}. ${name}`)
  await fs.writeFile(
    path.join(artifacts, 'browser-interactions.json'),
    JSON.stringify(report, null, 2),
  )
}
const ready = async () => {
  await page.waitForFunction(
    () => window.__tunnelCesium && !window.__tunnelCesium.viewer.isDestroyed(),
    { timeout: 120000 },
  )
  await page.waitForFunction(
    () => window.__tunnelCesium.markers.equipment.value.length === 138,
    { timeout: 60000 },
  )
}
const settle = () =>
  page.waitForFunction(
    () => !window.__tunnelCesium.viewer.camera._currentFlight,
    { timeout: 60000 },
  )
const setMode = async (mode) => {
  await page.locator('.scene-settings-trigger').click()
  const header = page
    .locator('.scene-settings-pop .el-collapse-item__header')
    .filter({ hasText: '底图与二 / 三维视图' })
  if ((await header.getAttribute('aria-expanded')) !== 'true')
    await header.click()
  await page
    .locator('.scene-settings-pop')
    .getByText(mode === '2d' ? '二维路线' : '三维模型', { exact: true })
    .click()
  await page.waitForFunction(
    (mode) =>
      window.__tunnelCesium.viewer.scene.mode === (mode === '2d' ? 2 : 3),
    mode,
  )
  await settle()
  await page.locator('.scene-settings-trigger').click()
}
const toggleGroup = async (name) => {
  await page
    .locator('.scene-toolbar .tb-act')
    .filter({ hasText: '图层' })
    .click()
  const item = page
    .locator('.layer-collapse .el-collapse-item')
    .filter({ hasText: name })
  const header = item.locator('.el-collapse-item__header')
  if ((await header.getAttribute('aria-expanded')) !== 'true')
    await header.click()
  await item.locator('.el-switch').click()
  await page
    .locator('.scene-toolbar .tb-act')
    .filter({ hasText: '图层' })
    .click()
}
const materialAlpha = () =>
  page.evaluate(() => {
    const t = window.__tunnelCesium,
      ts = t.getTilesets().find((ts) => ts.__tunnelRole === 'partial')
    return ts.style.color.evaluateColor(
      { getPropertyInherited: (key) => (key === 'name' ? 'malu' : 'road') },
      new t.Cesium.Color(),
    ).alpha
  })
try {
  await page.goto(`${baseUrl}/#/overview`, { waitUntil: 'domcontentloaded' })
  await ready()
  await page.waitForFunction(
    () => window.__tunnelCesium.getTilesets().every((ts) => ts.tilesLoaded),
    { timeout: 180000 },
  )
  await check('原有功能保留，标号/施工竣工图例已从界面删除', async () => {
    assert.equal(await page.getByText('界面+标号', { exact: true }).count(), 0)
    assert.equal(await page.getByText('仅界面', { exact: true }).count(), 0)
    assert.equal(
      await page.locator('.tb-legend,.mark-point,.rh-tip').count(),
      0,
    )
    assert.equal(await page.locator('.scene-settings-pop:visible').count(), 0)
  })
  await check('独立构件图标读取真实 138 个构件，使用模型世界坐标', async () => {
    const state = await page.evaluate(() => {
      const t = window.__tunnelCesium,
        first = t.markers.equipment.value[0],
        entity = t.markers.modelEntities.find(
          (e) => e.__equipmentId === first.id,
        )
      return {
        count: t.markers.modelEntities.length,
        distance: t.Cesium.Cartesian3.distance(
          entity.position.getValue(t.viewer.clock.currentTime),
          new t.Cesium.Cartesian3(...first.center),
        ),
        shown: t.markers.modelEntities.filter((e) => e.show).length,
      }
    })
    assert.equal(state.count, 138)
    assert.ok(state.distance < 1e-8)
    assert.equal(state.shown, 138)
  })
  await check(
    '远景有屏幕空间聚合，所有告警脱离普通聚合并有动态光圈',
    async () => {
      const result = await page.evaluate(() => {
        const t = window.__tunnelCesium
        return {
          clusters: t.markers.clusterHistory.length,
          alerts: t.markers.prioritySource.entities.values
            .filter((e) => e.__deviceId?.startsWith('demo-alert-'))
            .map((e) => ({
              dynamic: !e.point.pixelSize.isConstant,
              id: e.__deviceId,
            })),
          clusteredAlerts: t.markers.clusterHistory.some((c) =>
            c.members.some((id) => id.startsWith('demo-alert-')),
          ),
        }
      })
      assert.ok(result.clusters > 0)
      assert.equal(result.alerts.length, 5)
      assert.ok(result.alerts.every((a) => a.dynamic))
      assert.equal(result.clusteredAlerts, false)
    },
  )
  await check('默认道路保留原始材质，白色中性乘色且不透明', async () =>
    assert.equal(await materialAlpha(), 1),
  )
  await check('通过剖切工具建立两模型同一世界平面', async () => {
    await page.locator('.section-trigger').click()
    await page.locator('.section-pop .el-switch').click()
    await page.waitForFunction(() =>
      window.__tunnelCesium
        .getTilesets()
        .every((ts) => ts.clippingPlanes?.enabled),
    )
    const result = await page.evaluate(() => {
      const t = window.__tunnelCesium,
        C = t.Cesium
      const planes = t.getTilesets().map((ts) => {
        const p = ts.clippingPlanes.get(0)
        return C.Plane.transform(
          new C.Plane(p.normal, p.distance),
          ts.root.computedTransform,
        )
      })
      return {
        dot: C.Cartesian3.dot(planes[0].normal, planes[1].normal),
        distance: Math.abs(planes[0].distance - planes[1].distance),
        enabled: t.modelSection.state.enabled,
      }
    })
    assert.ok(result.dot > 0.999999)
    assert.ok(result.distance < 1e-5)
    assert.equal(result.enabled, true)
  })
  await check('剖切位置、三轴、方向和目标可通过 UI 调整', async () => {
    await page
      .locator('.section-pop')
      .getByText('X 轴', { exact: true })
      .click()
    await page
      .locator('.section-pop')
      .getByText('Y 轴', { exact: true })
      .click()
    await page
      .locator('.section-pop')
      .getByText('水平 Z', { exact: true })
      .click()
    const slider = page.locator('.section-pop .el-slider__button-wrapper')
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page
      .locator('.section-pop')
      .getByText('反向保留', { exact: true })
      .click()
    await page
      .locator('.section-pop')
      .getByText('竣工段', { exact: true })
      .click()
    assert.equal(
      await page.evaluate(
        () =>
          window.__tunnelCesium
            .getTilesets()
            .find((ts) => ts.__tunnelRole === 'bim').clippingPlanes.enabled,
      ),
      false,
    )
    await page
      .locator('.section-pop')
      .getByText('全部 BIM', { exact: true })
      .click()
    const state = await page.evaluate(() => ({
      ...window.__tunnelCesium.modelSection.state,
    }))
    assert.equal(state.axis, 'z')
    assert.equal(state.reverse, true)
    assert.ok(state.position > 0.55)
    await page.locator('.section-trigger').click()
  })
  await check('切换二维暂停剖切并隐藏 BIM 图标，保留路线', async () => {
    await setMode('2d')
    const state = await page.evaluate(() => {
      const t = window.__tunnelCesium
      return {
        enabled: t.getTilesets().some((ts) => ts.clippingPlanes?.enabled),
        model: t.markers.modelEntities.some((e) => e.show),
        routes: t.viewer.entities.values.filter((e) => e.polyline).length,
      }
    })
    assert.equal(state.enabled, false)
    assert.equal(state.model, false)
    assert.ok(state.routes > 0)
  })
  await check(
    '二维设施重复定位保持绝对范围，不越缩越远、不飞全球',
    async () => {
      const widths = []
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.__tunnelCesium.focusDeviceById('rp1'))
        await settle()
        const frame = await page.evaluate(() => {
          const t = window.__tunnelCesium,
            f = t.viewer.camera.frustum,
            e = t.markers.businessEntities.find((e) => e.__deviceId === 'rp1')
          const p = t.Cesium.SceneTransforms.worldToWindowCoordinates(
            t.viewer.scene,
            e.position.getValue(t.viewer.clock.currentTime),
          )
          return {
            width: f.right - f.left,
            near: f.near,
            far: f.far,
            x: p.x,
            y: p.y,
            cx: t.viewer.canvas.clientWidth / 2,
            cy: t.viewer.canvas.clientHeight / 2,
          }
        })
        assert.ok(frame.width > 400 && frame.width < 1600)
        assert.ok(frame.far > frame.near)
        assert.ok(Math.abs(frame.x - frame.cx) < 4)
        assert.ok(Math.abs(frame.y - frame.cy) < 4)
        widths.push(frame.width)
      }
      assert.ok(Math.max(...widths) - Math.min(...widths) < 1e-4)
    },
  )
  await check('二维设施图标真实点击命中，详情未被容器上边缘裁掉', async () => {
    const canvas = await page.locator('.scene-map-root canvas').boundingBox()
    await page.mouse.click(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    )
    assert.equal(
      await page.locator('.map-floating-popup .pd-name').innerText(),
      '雨水泵房',
    )
    const popup = await page.locator('.map-floating-popup').boundingBox()
    assert.ok(popup.y >= canvas.y)
    await page.locator('.map-floating-popup > .map-floating-popup__x').click()
  })
  await check(
    '告警定位会启用被关闭的目标图层，并定位独立模拟告警',
    async () => {
      await toggleGroup('环控系统')
      assert.equal(
        await page.evaluate(() =>
          window.__tunnelCesium.getPoints().some((p) => p.group === 'env'),
        ),
        false,
      )
      await page
        .getByRole('button', { name: '定位重点告警', exact: true })
        .click()
      await settle()
      await page.waitForFunction(() =>
        window.__tunnelCesium
          .getPoints()
          .some((p) => p.id === 'demo-alert-flood-3050'),
      )
      assert.equal(
        await page.locator('.map-floating-popup .pd-name').innerText(),
        '积水液位快速上升',
      )
      assert.match(
        await page.locator('.map-floating-popup').innerText(),
        /模拟/,
      )
      await page.locator('.map-floating-popup > .map-floating-popup__x').click()
    },
  )
  await check('预警横幅有真实定位事件，不再只轮播文案', async () => {
    await page.locator('.ticker-content').click()
    await settle()
    assert.ok(await page.locator('.map-floating-popup').isVisible())
    await page.locator('.map-floating-popup > .map-floating-popup__x').click()
  })
  await check('重点监控点击放大画面并精确定位摄像机', async () => {
    await page
      .getByRole('button', {
        name: '打开北口 K2+100监控画面并定位',
        exact: true,
      })
      .click()
    await page.locator('.video-preview-dialog').waitFor({ state: 'visible' })
    await settle()
    await page.waitForFunction(
      () => document.querySelector('.video-stage img')?.naturalWidth > 0,
    )
    assert.equal(
      await page.locator('.map-floating-popup .pd-name').innerText(),
      '北口 K2+100',
    )
    assert.match(
      await page.locator('.video-preview-dialog').innerText(),
      /未接入实时流/,
    )
    const box = await page.locator('.video-preview-dialog').boundingBox()
    assert.ok(box.width >= 900)
    await page
      .getByRole('button', { name: '放大视频窗口', exact: true })
      .click()
    assert.ok(
      (await page.locator('.video-preview-dialog').boundingBox()).width > 1300,
    )
    await page.locator('.video-preview-dialog .el-dialog__headerbtn').click()
  })
  await check('摄像机点位详情的监控按钮可用，不再为空回调', async () => {
    const stable = await page
      .locator('.map-floating-popup [data-action=video]')
      .evaluateHandle((e) => e)
    await page.waitForTimeout(1200)
    assert.equal(await stable.evaluate((e) => e.isConnected), true)
    await page.locator('.map-floating-popup [data-action=video]').click()
    await page.locator('.video-preview-dialog').waitFor({ state: 'visible' })
    await page.locator('.video-preview-dialog .el-dialog__headerbtn').click()
    await page.locator('.map-floating-popup > .map-floating-popup__x').click()
  })
  await check('二维返回三维恢复原剖切状态', async () => {
    await setMode('3d')
    await page.waitForFunction(() =>
      window.__tunnelCesium
        .getTilesets()
        .every((ts) => ts.clippingPlanes?.enabled),
    )
    assert.equal(
      await page.evaluate(
        () => window.__tunnelCesium.modelSection.state.reverse,
      ),
      true,
    )
    await page.evaluate(() => window.__tunnelCesium.modelSection.reset())
  })
  await check('点击聚合数字展开真实构件列表，而非丢弃被抽稀设备', async () => {
    await page.locator('[aria-label="复位视角"]').click()
    await settle()
    await page.waitForTimeout(1000)
    const target = await page.evaluate(() => {
      const t = window.__tunnelCesium,
        C = t.Cesium
      for (const cluster of [...t.markers.clusterHistory].reverse()) {
        const p = C.SceneTransforms.worldToWindowCoordinates(
          t.viewer.scene,
          new C.Cartesian3(...cluster.position),
        )
        if (
          !p ||
          p.x < 330 ||
          p.x > 1100 ||
          p.y < 70 ||
          p.y > t.viewer.canvas.clientHeight - 90
        )
          continue
        const picked = t.viewer.scene.pick(p)
        if (picked?.id?.__clusterMembers?.some((e) => e.__equipmentId))
          return { x: p.x, y: p.y }
      }
    })
    assert.ok(target, '存在可点击的可见 BIM 聚合数字')
    const canvas = await page.locator('.scene-map-root canvas').boundingBox()
    await page.mouse.click(canvas.x + target.x, canvas.y + target.y)
    await page.locator('.marker-cluster-panel').waitFor({ state: 'visible' })
    assert.ok(
      (await page.locator('.cluster-member[data-point-id^="bim:"]').count()) >=
        2,
    )
  })
  await check(
    '从聚合列表选择单构件，定位真实设备、模型高亮、近景隐藏图标',
    async () => {
      const member = page
        .locator('.cluster-member[data-point-id^="bim:"]')
        .first()
      const id = (await member.getAttribute('data-point-id')).slice(4)
      await member.click()
      await settle()
      const state = await page.evaluate((id) => {
        const t = window.__tunnelCesium,
          item = t.markers.equipment.value.find((e) => e.id === id),
          C = t.Cesium
        const target = new C.Cartesian3(...item.center),
          distance = C.Cartesian3.distance(t.viewer.camera.positionWC, target)
        const ts = t.getTilesets().find((ts) => ts.__tunnelRole === 'partial')
        const color = ts.style.color.evaluateColor(
          { getPropertyInherited: (key) => (key === 'id' ? id : item.name) },
          new C.Color(),
        )
        return {
          selected: t.selectedEquipmentId,
          distance,
          hidden: t.markers.stats.nearHidden,
          shown: t.markers.modelEntities.filter((e) => e.show).length,
          highlighted: color.green < 1 && color.red === 1,
          name: item.name,
        }
      }, id)
      assert.equal(state.selected, id)
      assert.ok(state.distance >= 5 && state.distance < 20)
      assert.equal(state.hidden, true)
      assert.equal(state.shown, 0)
      assert.equal(state.highlighted, true)
      assert.equal(
        await page.locator('.map-attr-title').innerText(),
        state.name,
      )
      assert.equal(
        await page
          .locator('.map-side-rail--right')
          .evaluate((e) => getComputedStyle(e).visibility),
        'hidden',
      )
      assert.equal(await materialAlpha(), 1)
      await page.locator('.model-attr-panel .map-floating-popup__x').click()
      assert.equal(
        await page.evaluate(() => window.__tunnelCesium.selectedEquipmentId),
        '',
      )
    },
  )
  await check('单 BIM 摄像机构件可调出放大的模拟监控画面', async () => {
    await page.evaluate(() => {
      const t = window.__tunnelCesium,
        e = t.markers.equipment.value.find((e) => e.category === '视频监控')
      t.focusModelEquipment(e.id)
    })
    await settle()
    await page.locator('.map-attr-actions button').click()
    await page.locator('.video-preview-dialog').waitFor({ state: 'visible' })
    assert.match(await page.locator('.video-dialog-head').innerText(), /摄像/)
    await page.locator('.video-preview-dialog .el-dialog__headerbtn').click()
    await page.locator('.model-attr-panel .map-floating-popup__x').click()
    await page.locator('[aria-label="复位视角"]').click()
    await settle()
  })
  await check('内部巡游从路线末端向内部入场，暂停外部剖切', async () => {
    await page.evaluate(() =>
      window.__tunnelCesium.modelSection.update({ enabled: true }),
    )
    await page.locator('.tb-act--primary').click()
    await page.waitForFunction(
      () =>
        window.__tunnelCesium.modelRoaming.state.active &&
        !window.__tunnelCesium.modelRoaming.state.loading,
    )
    const s = await page.evaluate(() => ({
      ...window.__tunnelCesium.modelRoaming.state,
    }))
    assert.equal(s.direction, -1)
    assert.ok(s.progress > 0.97)
    assert.equal(s.roadXray, false)
    assert.equal(
      await page.evaluate(() =>
        window.__tunnelCesium
          .getTilesets()
          .some((ts) => ts.clippingPlanes?.enabled),
      ),
      false,
    )
    await page.evaluate(() => window.__tunnelCesium.modelRoaming.pause())
    assert.equal(await materialAlpha(), 1)
  })
  await check('巡游结构透视不会玻璃化道路，路面透视可独立开关', async () => {
    await page
      .locator('.roaming-panel')
      .getByText('结构透视', { exact: true })
      .click()
    assert.equal(await materialAlpha(), 1)
    await page
      .locator('.roaming-panel')
      .getByText('路面透视', { exact: true })
      .click()
    assert.equal(await materialAlpha(), 0.16)
    await page
      .locator('.roaming-panel')
      .getByText('路面透视', { exact: true })
      .click()
    assert.equal(await materialAlpha(), 1)
    await page
      .getByRole('button', { name: '回到巡游入口端', exact: true })
      .click()
    assert.equal(
      await page.evaluate(
        () => window.__tunnelCesium.modelRoaming.state.progress,
      ),
      1,
    )
  })
  await check('巡游 Esc 退出恢复剖切、模型与业务侧栏', async () => {
    await page.keyboard.press('Escape')
    await settle()
    assert.equal(
      await page.evaluate(
        () => window.__tunnelCesium.modelRoaming.state.active,
      ),
      false,
    )
    assert.equal(
      await page.evaluate(() =>
        window.__tunnelCesium
          .getTilesets()
          .every((ts) => ts.clippingPlanes?.enabled),
      ),
      true,
    )
    assert.equal(
      await page
        .locator('.map-side-rail--right')
        .evaluate((e) => getComputedStyle(e).visibility),
      'visible',
    )
    await page.evaluate(() => window.__tunnelCesium.modelSection.reset())
  })
  const modules = [
    ['智能交通', 'traffic', ['structure', 'traffic']],
    ['智慧养护', 'maintenance', ['structure', 'monitor']],
    ['智慧监测', 'monitoring', ['structure', 'env', 'monitor']],
    ['数字应急', 'emergency', ['structure', 'env', 'mep']],
    ['数字服务', 'service', ['structure']],
    [
      '资产资料中心',
      'asset',
      ['structure', 'env', 'traffic', 'monitor', 'mep'],
    ],
  ]
  for (const [name, path, expected] of modules) {
    await check(
      `${name}：默认分组准确且环境点位非空，页面切换释放旧场景`,
      async () => {
        await page.evaluate(() => (window.__tunnelCesium = undefined))
        await page.locator('.nav-item').filter({ hasText: name }).click()
        await ready()
        const state = await page.evaluate(() => {
          const t = window.__tunnelCesium
          return {
            groups: [...new Set(t.getPoints().map((p) => p.group))].sort(),
            structure: t.getPoints().filter((p) => p.group === 'structure')
              .length,
            active: t.modelRoaming.state.active,
            stats: { ...t.markers.stats },
          }
        })
        assert.deepEqual(state.groups, [...expected].sort())
        assert.ok(state.structure > 0)
        assert.equal(state.active, false)
      },
    )
    if (path === 'traffic') {
      await check('无文案 resize 把手支持键盘和指针拖动', async () => {
        const handle = page.getByRole('separator', { name: '调整场景高度' })
        assert.equal(await handle.innerText(), '')
        const before = Number(await handle.getAttribute('aria-valuenow'))
        await handle.focus()
        await page.keyboard.press('ArrowDown')
        assert.equal(
          Number(await handle.getAttribute('aria-valuenow')),
          before + 24,
        )
        const box = await handle.boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2 + 70,
          { steps: 3 },
        )
        await page.mouse.up()
        assert.ok(
          Number(await handle.getAttribute('aria-valuenow')) >= before + 85,
        )
        assert.notEqual(
          await page.evaluate(() => document.body.style.cursor),
          'ns-resize',
        )
      })
      await check(
        '小场景巡游自动放大，重入仍从入口端开始，退出恢复原高度',
        async () => {
          await page.getByRole('separator', { name: '调整场景高度' }).focus()
          await page.keyboard.press('Home')
          await page.locator('.tb-act--primary').click()
          await page.waitForFunction(
            () =>
              window.__tunnelCesium.modelRoaming.state.active &&
              !window.__tunnelCesium.modelRoaming.state.loading,
          )
          assert.equal(
            await page
              .locator('.tunnel-scene')
              .evaluate((e) => e.classList.contains('is-expanded')),
            true,
          )
          assert.equal(
            await page.evaluate(
              () => window.__tunnelCesium.modelRoaming.state.direction,
            ),
            -1,
          )
          await page.keyboard.press('Escape')
          await settle()
          assert.equal(
            await page
              .locator('.tunnel-scene')
              .evaluate((e) => e.classList.contains('is-expanded')),
            false,
          )
        },
      )
    }
  }
  await check('所有交互没有 JavaScript / Cesium 运行时错误', async () => {
    assert.equal(report.pageErrors.length, 0)
    assert.equal(report.consoleErrors.length, 0)
  })
} catch (error) {
  report.failure = error.stack
  console.error('FAIL', error.stack)
  console.log('UNHANDLED', await page.evaluate(() => window.__browserUnhandled))
  console.log('BODY', (await page.locator('body').innerText()).slice(-2500))
  try {
    await page.screenshot({
      path: path.join(artifacts, 'interactions-failure.png'),
      timeout: 90000,
    })
  } catch {}
} finally {
  await fs.writeFile(
    path.join(artifacts, 'browser-interactions.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
  console.log(
    `RESULT ${report.checks.length} passed; ${report.pageErrors.length} runtime errors; failure=${!!report.failure}`,
  )
  if (report.failure || report.pageErrors.length || report.consoleErrors.length)
    process.exitCode = 1
}
