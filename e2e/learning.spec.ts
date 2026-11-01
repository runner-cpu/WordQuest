import { test, expect, type Page } from '@playwright/test'

async function onboard(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '开始冒险', exact: true }).click()
  await page.getByRole('heading', { name: '四六级备考台', exact: true }).waitFor()
}
async function nav(page: Page, name: string) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).filter({ visible: true }).click()
}
async function reading(page: Page) {
  await page.getByRole('button', { name: /(?:开始|继续)2026年6月四级.*阅读与写译/ }).click()
  await page.getByRole('dialog').waitFor()
}
async function saved(page: Page) {
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('已保存到本机')
}
async function exitPaper(page: Page) {
  await page.getByRole('button', { name: '保存并退出真题练习', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('true paper activity appears without vocabulary; review filters and keyboard target work', async ({ page }) => {
  await onboard(page)
  await reading(page)
  await page.getByLabel('第 26 空', { exact: true }).selectOption('N')
  await page.getByRole('button', { name: '提交核对', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 1 题', exact: true }).click()
  await expect(page.getByRole('heading', { name: '阅读与写译复盘', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '未答 29', exact: true }).click()
  await expect(page.locator('.cet-ready-overview button')).toHaveCount(29)
  await page.getByRole('button', { name: '继续未答题 · 27', exact: true }).click()
  await expect(page.getByLabel('第 27 空', { exact: true })).toBeFocused()
  await exitPaper(page)
  await nav(page, '统计')
  await expect(page.getByText('已练 1 套真题', { exact: false })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('词卡报告等待第一次练习', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '练阅读与写译', exact: true }).click()
  await expect(page.getByRole('heading', { name: '四六级备考台', exact: true })).toBeInViewport()
})

test('separate tabs merge unrelated changes and explicitly resolve same-field conflicts', async ({ page, context }) => {
  await onboard(page)
  await reading(page)
  const second = await context.newPage()
  await second.goto('/')
  await reading(second)
  await page.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await page.getByLabel('我的写作草稿', { exact: true }).fill('First writing draft.')
  await saved(page)
  await second.getByRole('button', { name: '翻译 30 分钟', exact: true }).click()
  await second.getByLabel('我的翻译草稿', { exact: true }).fill('Translation from another tab.')
  await saved(second)
  await second.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await expect(second.getByLabel('我的写作草稿', { exact: true })).toHaveValue('First writing draft.')
  await page.getByLabel('我的写作草稿', { exact: true }).fill('A newer remote version.')
  await saved(page)
  await second.getByLabel('我的写作草稿', { exact: true }).fill('My chosen local version.')
  await expect(second.getByRole('alert')).toContainText('冲突')
  await expect(second.getByLabel('我的写作草稿', { exact: true })).toHaveValue('My chosen local version.')
  await second.getByRole('button', { name: '保留本页修改并保存', exact: true }).click()
  await saved(second)
  await exitPaper(second)
  await reading(second)
  await second.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await expect(second.getByLabel('我的写作草稿', { exact: true })).toHaveValue('My chosen local version.')
  await second.getByRole('button', { name: '翻译 30 分钟', exact: true }).click()
  await expect(second.getByLabel('我的翻译草稿', { exact: true })).toHaveValue('Translation from another tab.')
  await page.getByLabel('我的写作草稿', { exact: true }).fill('This local version should be discarded.')
  await expect(page.getByRole('alert')).toContainText('冲突')
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.getByRole('dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
  await page.getByRole('button', { name: '放弃本页修改，载入另一页', exact: true }).click()
  await saved(page)
  await expect(page.getByLabel('我的写作草稿', { exact: true })).toHaveValue('My chosen local version.')
})

test('original recording plays without system voices and replays offline after caching', async ({ page, context }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    window.Audio = class extends NativeAudio {
      constructor(...args: ConstructorParameters<typeof Audio>) {
        super(...args)
        ;(window as unknown as { recording: HTMLAudioElement }).recording = this
      }
    }
    window.speechSynthesis.getVoices = () => []
  })
  await onboard(page)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  const play = async () => {
    await nav(page, '听力')
    await page.locator('.listening-extra > summary').click()
    await page.getByRole('button', { name: '练习校园与科技', exact: true }).click()
    await page.getByRole('button', { name: '播放原文', exact: true }).click()
    await page.waitForFunction(() => {
      const a = (window as unknown as { recording: HTMLAudioElement }).recording
      return a && !a.paused && a.currentTime > 0.1
    })
  }
  await play()
  await page.waitForFunction(async () => {
    const a = (window as unknown as { recording: HTMLAudioElement }).recording
    const response = await (await caches.open('wq-audio-v1')).match(a.src)
    return response?.status === 200 && (await response.arrayBuffer()).byteLength > 100_000
  })
  await page.getByRole('button', { name: '退出听力短练', exact: true }).click()
  await context.setOffline(true)
  await page.reload()
  await play()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('switching to background flushes a draft before the debounce timer fires', async ({ page }) => {
  await onboard(page)
  await reading(page)
  await page.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByLabel('我的写作草稿', { exact: true }).fill('Saved before the mobile app goes into background.')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await saved(page)
  await page.clock.resume()
  await page.reload()
  await reading(page)
  await page.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await expect(page.getByLabel('我的写作草稿', { exact: true })).toHaveValue('Saved before the mobile app goes into background.')
})

test('blocked appearance storage does not prevent opening settings', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await onboard(page)
  await page.getByRole('button', { name: '设置', exact: true }).last().click()
  await expect(page.getByRole('button', { name: '导出数据备份（JSON）', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('report and review fit phone, tablet, desktop and landscape in light and dark themes', async ({ page }, testInfo) => {
  await onboard(page)
  await reading(page)
  await page.getByLabel('第 26 空', { exact: true }).selectOption('N')
  await saved(page)
  await exitPaper(page)
  await nav(page, '统计')
  await expect(page.getByRole('table')).toBeVisible()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['night', 'paper']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      const fits = await page.getByRole('table').evaluate(table => {
        const rect = table.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth
      })
      expect(fits).toBe(true)
      if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`report-${width}-${theme}.png`) })
    }
  }
  await page.getByRole('button', { name: '练阅读与写译', exact: true }).click()
  await reading(page)
  for (const size of [{ width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await page.getByRole('button', { name: '复盘与缓存', exact: true }).click()
    await expect(page.getByRole('button', { name: '继续未答题 · 27', exact: true })).toBeVisible()
    expect(await page.getByRole('dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`review-${size.width}.png`) })
    await page.getByRole('button', { name: '继续答题', exact: true }).click()
  }
})
