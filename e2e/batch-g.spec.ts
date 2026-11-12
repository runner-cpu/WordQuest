import { test, expect, type Page } from '@playwright/test'
import { enterApp, navigate, openReading, exitPaper } from './helpers'

async function balance(page: Page) {
  return page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('wordquest'); request.onsuccess = () => resolve(request.result) })
    const profile = await new Promise<{ xp: number; coins: number }>(resolve => { const request = connection.transaction('profile').objectStore('profile').get('me'); request.onsuccess = () => resolve(request.result) })
    connection.close()
    return { xp: profile.xp, coins: profile.coins }
  })
}

async function migrationPanel(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).last().click()
  await page.getByText('快速迁移（迁移码）', { exact: true }).click()
}

test('migration between independent browsers preserves drafts and receipts without a second reward', async ({ page, browser }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError') } } }))
  await enterApp(page)
  await openReading(page)
  await page.getByRole('button', { name: '阅读 46–55', exact: true }).click()
  await page.locator('#ready-q-47 input[value="A"]').check()
  await page.getByRole('button', { name: '提交核对', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 1 题', exact: true }).click()
  await page.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
  await page.getByLabel('我的写作草稿', { exact: true }).fill('My first draft stays on this device until I transfer it.')
  await page.getByRole('button', { name: '修订稿', exact: true }).click()
  await page.getByLabel('我的写作修订稿', { exact: true }).fill('My revised draft can travel with my saved practice records.')
  await exitPaper(page)
  const sourceBalance = await balance(page)
  expect(sourceBalance).toEqual({ xp: 2, coins: 1 })
  await migrationPanel(page)
  await page.getByRole('button', { name: '生成迁移码', exact: true }).click()
  const codeField = page.getByLabel('本机迁移码', { exact: true })
  await expect(codeField).toHaveValue(/^WQ1\./)
  const code = await codeField.inputValue()
  await page.getByRole('button', { name: '复制迁移码', exact: true }).click()
  await expect(page.getByText(/浏览器未允许写入剪贴板/)).toBeVisible()
  await expect(codeField).toHaveValue(code)
  await page.getByRole('button', { name: '全选迁移码', exact: true }).click()
  expect(await codeField.evaluate(element => ({ start: (element as HTMLTextAreaElement).selectionStart, end: (element as HTMLTextAreaElement).selectionEnd }))).toEqual({ start: 0, end: code.length })

  const destination = await browser.newContext({ baseURL: 'http://127.0.0.1:4180', viewport: { width: 390, height: 844 } })
  try {
    const target = await destination.newPage()
    await enterApp(target)
    await migrationPanel(target)
    await target.getByLabel('粘贴迁移码', { exact: true }).fill(code)
    await target.getByRole('button', { name: '导入迁移码并合并', exact: true }).click()
    await expect(target.getByText(/迁移码已合并：/)).toBeVisible()
    expect(await balance(target)).toEqual(sourceBalance)
    await target.getByRole('button', { name: '导入迁移码并合并', exact: true }).click()
    await expect(target.getByText(/迁移码已合并：新增 0 条复习记录、0 份真题档案/)).toBeVisible()
    expect(await balance(target)).toEqual(sourceBalance)
    await target.reload()
    await navigate(target, '统计')
    const notice = target.getByRole('region', { name: '本机数据说明', exact: true })
    await expect(notice).toContainText('当前数据来自本浏览器，跨设备请使用迁移。')
    await expect(target.getByText('本机数据', { exact: true }).first()).toBeVisible()
    await target.getByRole('button', { name: '知道了', exact: true }).click()
    await navigate(target, '今日')
    await navigate(target, '统计')
    await expect(notice).toHaveCount(0)
    await target.reload()
    await navigate(target, '统计')
    await expect(notice).toHaveCount(0)
    await navigate(target, '今日')
    await openReading(target)
    await target.getByRole('button', { name: '写作 30 分钟', exact: true }).click()
    await expect(target.getByLabel('我的写作草稿', { exact: true })).toHaveValue('My first draft stays on this device until I transfer it.')
    await target.getByRole('button', { name: '修订稿', exact: true }).click()
    await expect(target.getByLabel('我的写作修订稿', { exact: true })).toHaveValue('My revised draft can travel with my saved practice records.')
    await target.getByRole('button', { name: '核对订正', exact: true }).click()
    await target.getByRole('button', { name: '确认核对 1 题', exact: true }).click()
    const rewards = target.getByRole('region', { name: '本次学习奖励', exact: true })
    await expect(rewards).toContainText('首次正确 0 题')
    await expect(rewards).toContainText('订正正确 0 题')
    await expect(rewards).toContainText('证据记录 0 题')
    await exitPaper(target)
    expect(await balance(target)).toEqual(sourceBalance)
  } finally { await destination.close() }
})

test('storage rejection and unavailable compression retain statistics and JSON migration', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Object.defineProperty(window, 'CompressionStream', { value: undefined, configurable: true })
  })
  await enterApp(page)
  await navigate(page, '统计')
  await page.getByRole('button', { name: '知道了', exact: true }).click()
  await navigate(page, '今日')
  await navigate(page, '统计')
  await expect(page.getByRole('region', { name: '本机数据说明', exact: true })).toHaveCount(0)
  await migrationPanel(page)
  await expect(page.getByText('此浏览器不支持迁移码所需的压缩功能，请使用上方的 JSON 导出与导入。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成迁移码', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '转到 JSON 备份', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出数据备份（JSON）', exact: true })).toBeFocused()
})
