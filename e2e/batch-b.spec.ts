import { test, expect, type Page } from '@playwright/test'
import { enterApp, openReading, exitPaper } from './helpers'

async function balance(page: Page) {
  return page.evaluate(() => new Promise<{ xp: number; coins: number }>((resolve, reject) => {
    const request = indexedDB.open('wordquest')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const row = database.transaction('profile').objectStore('profile').get('me')
      row.onsuccess = () => { resolve({ xp: row.result.xp, coins: row.result.coins }); database.close() }
      row.onerror = () => { reject(row.error); database.close() }
    }
  }))
}

test('B: first answer, correction and evidence rewards are separate and reload cannot repeat them', async ({ page }) => {
  await enterApp(page)
  await openReading(page)
  await page.getByRole('button', { name: '阅读 46–55', exact: true }).click()
  await page.locator('#ready-q-46 input[value="A"]').check()
  await page.locator('#ready-q-47 input[value="A"]').check()
  await page.getByRole('button', { name: '提交核对', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 2 题', exact: true }).click()
  const rewards = page.getByRole('region', { name: '本次学习奖励', exact: true })
  await expect(rewards).toContainText('首次正确 1 题')
  await expect(rewards).toContainText('订正正确 0 题')
  await expect(rewards).toContainText('证据记录 0 题')
  await page.getByRole('button', { name: '第 46 题，待订正', exact: true }).click()
  await page.getByRole('button', { name: '将证据句加入复盘笔记', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '证据' })).toContainText('已加入')
  await page.locator('#ready-q-46 input[value="D"]').check()
  await page.getByRole('button', { name: '核对订正', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 2 题', exact: true }).click()
  await expect(rewards).toContainText('首次正确 0 题')
  await expect(rewards).toContainText('订正正确 1 题')
  await expect(rewards).toContainText('证据记录 1 题')
  await exitPaper(page)
  const earned = await balance(page)
  await page.reload()
  await openReading(page)
  await page.getByRole('button', { name: '核对订正', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 2 题', exact: true }).click()
  await expect(rewards).toContainText('首次正确 0 题')
  await expect(rewards).toContainText('订正正确 0 题')
  await expect(rewards).toContainText('证据记录 0 题')
  await exitPaper(page)
  expect(await balance(page)).toEqual(earned)
})

test('B: two browser tabs submitting the same correct answer share one reward receipt', async ({ page, context }) => {
  await enterApp(page)
  await openReading(page)
  const other = await context.newPage()
  await other.goto('/')
  await openReading(other)
  for (const target of [page, other]) {
    await target.getByRole('button', { name: '阅读 46–55', exact: true }).click()
    await target.locator('#ready-q-47 input[value="A"]').check()
    await target.getByRole('button', { name: '提交核对', exact: true }).click()
  }
  await Promise.all([page, other].map(target => target.getByRole('button', { name: '确认核对 1 题', exact: true }).click()))
  const contents = await Promise.all([page, other].map(async target => {
    const region = target.getByRole('region', { name: '本次学习奖励', exact: true })
    await expect(region).toBeVisible()
    return region.innerText()
  }))
  expect(contents.filter(text => text.includes('首次正确 1 题'))).toHaveLength(1)
  expect(contents.filter(text => text.includes('首次正确 0 题'))).toHaveLength(1)
  await exitPaper(page)
  await exitPaper(other)
  expect(await balance(page)).toEqual({ xp: 2, coins: 1 })
})

test('B: conflicting per-question evidence keeps both texts until the learner chooses', async ({ page, context }) => {
  await enterApp(page)
  await openReading(page)
  await page.getByRole('button', { name: '阅读 46–55', exact: true }).click()
  await page.locator('#ready-q-46 input[value="A"]').check()
  await page.getByRole('button', { name: '提交核对', exact: true }).click()
  await page.getByRole('button', { name: '确认核对 1 题', exact: true }).click()
  const other = await context.newPage()
  await other.goto('/')
  await openReading(other)
  await other.getByRole('button', { name: '复盘与缓存', exact: true }).click()
  for (const target of [page, other]) {
    await target.getByRole('button', { name: '第 46 题，待订正', exact: true }).click()
    await target.getByText('记录自己的订正依据', { exact: true }).click()
  }
  await page.getByLabel('第 46 题订正笔记', { exact: true }).fill('The budget is limited: first tab evidence.')
  await page.getByRole('button', { name: '保存本题订正依据', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '证据' })).toContainText('已加入')
  await other.getByLabel('第 46 题订正笔记', { exact: true }).fill('The family wants the best food: my chosen evidence.')
  await other.getByRole('button', { name: '保存本题订正依据', exact: true }).click()
  await expect(other.getByRole('region', { name: '订正依据冲突', exact: true })).toContainText('my chosen evidence')
  await other.getByRole('button', { name: '保留本页订正依据', exact: true }).click()
  await expect(other.getByRole('region', { name: '订正依据冲突', exact: true })).toHaveCount(0)
  await exitPaper(other)
  await openReading(other)
  await other.getByRole('button', { name: '复盘与缓存', exact: true }).click()
  await other.getByRole('button', { name: '第 46 题，待订正', exact: true }).click()
  await other.getByText('记录自己的订正依据', { exact: true }).click()
  await expect(other.getByLabel('第 46 题订正笔记', { exact: true })).toHaveValue('The family wants the best food: my chosen evidence.')
})
