import { test, expect } from '@playwright/test'
import { enterApp, navigate } from './helpers'

test('learning report preserves migration bands and exposes daily and hourly data on desktop and mobile', async ({ page }) => {
  await enterApp(page)
  await page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wordquest')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = connection.transaction(['profile', 'stats', 'dailyLogs', 'reviewLogs'], 'readwrite')
    const now = Date.now()
    const profile = tx.objectStore('profile').get('me')
    profile.onsuccess = () => tx.objectStore('profile').put({ ...profile.result, wordDifficultyWeights: { 'report-cached': 1.3 } })
    for (const wordId of ['report-cached', 'report-unknown']) tx.objectStore('stats').put({
      wordId, fsrs: { due: now, stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 5, reps: 1, lapses: 0, state: 2, last_review: now },
      state: 'review', productionCorrectCount: 0, mistakeCount: 0, correctCount: 1, firstSeenAt: now, lastReviewedAt: now,
    })
    for (let offset = 0; offset < 3; offset++) {
      const date = new Date(now); date.setDate(date.getDate() - offset)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      tx.objectStore('dailyLogs').put({ date: day, newLearned: offset === 0 ? 2 : 0, reviewsDone: 10, listeningSeconds: 0, listeningSentences: 0, xp: 0, coinsEarned: 0, correctCount: 8, totalAnswered: 10, effectiveDay: true, studySeconds: 120 })
      date.setHours(8 + offset, 0, 0, 0)
      for (let i = 0; i < 10; i++) tx.objectStore('reviewLogs').put({ id: `report-${offset}-${i}`, wordId: 'report-cached', mode: 'choice-word', correct: i < 8, rating: 3, elapsedMs: 1000, reviewedAt: date.getTime(), deviceId: 'report-fixture' })
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) })
    connection.close()
  })
  await page.reload()
  await navigate(page, '统计')
  await expect(page.getByText('有 1 个已学词暂缺词频资料，下载对应词书后会自动补全。')).toBeVisible()
  await page.getByText('查看近半年逐日学习记录', { exact: true }).focus()
  await page.keyboard.press('Enter')
  const records = page.getByRole('region', { name: '逐日学习记录', exact: true })
  await expect(records.getByRole('row')).toHaveCount(4)
  await page.getByText('查看各时段题量与正确率', { exact: true }).click()
  await expect(page.getByText('8:00 至 9:00：10 题 · 正确率 80%', { exact: true })).toBeVisible()
  for (const viewport of [{ width: 1440, height: 950 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await expect(records).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await records.scrollIntoViewIfNeeded()
    await expect(page.getByRole('region', { name: '近半年词卡练习热力图', exact: true }).locator('[title]').last()).toBeInViewport()
    await page.screenshot({ path: `output/verification/audit-2026-11-25/report-${viewport.width}.png` })
  }
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出本机学习报告', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^wordquest-learning-report-\d{4}-\d{2}-\d{2}\.png$/)
  expect(await download.failure()).toBeNull()
})
