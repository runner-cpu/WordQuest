import { test, expect, type Page } from '@playwright/test'
import { enterApp, navigate } from './helpers'

async function seedRecognitionOnlyDue(page: Page, newWord = false) {
  await page.evaluate(async (newWord) => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wordquest'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = connection.transaction(['profile', 'stats', 'reviewLogs', 'words', 'dailyLogs'], 'readwrite')
    const now = Date.now()
    const request = tx.objectStore('profile').get('me')
    request.onsuccess = () => {
      const profile = request.result
      profile.dailyNewTarget = 10
      tx.objectStore('profile').put(profile)
      tx.objectStore('words').put({ id: 'ability', word: 'ability', definition: '能力', bookId: 'cet4-core', bookUnits: { 'cet4-core': 1 }, unitId: 1, freqRank: 0, difficultyWeight: 1 })
      tx.objectStore('stats').put({ wordId: 'ability', fsrs: { due: now - 1, stability: 30, difficulty: 5, elapsed_days: 25, scheduled_days: 30, reps: 2, lapses: 0, state: 2, last_review: now - 30 * 86400000 }, state: 'review', productionCorrectCount: 0, mistakeCount: 0, correctCount: 2, firstSeenAt: now - 40 * 86400000, lastReviewedAt: now - 30 * 86400000 })
      for (let index = 0; index < 2; index++) tx.objectStore('reviewLogs').put({ id: `recognition-${index}`, wordId: 'ability', mode: 'choice-word', correct: true, rating: 3, elapsedMs: 3000, reviewedAt: now - (40 - index * 10) * 86400000, deviceId: profile.deviceId })
      if (newWord) {
        tx.objectStore('stats').delete('ability')
        for (let index = 0; index < 2; index++) tx.objectStore('reviewLogs').delete(`recognition-${index}`)
      }
      const date = new Date()
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      tx.objectStore('dailyLogs').put({ date: day, newLearned: newWord ? 9 : 10, reviewsDone: 0, listeningSeconds: 0, listeningSentences: 0, xp: 0, coinsEarned: 0, correctCount: 0, totalAnswered: 0, effectiveDay: false, studySeconds: 0 })
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) })
    connection.close()
  }, newWord)
  await page.reload()
}

test('low new-word default and recognition-only due word require production', async ({ page }) => {
  await enterApp(page)
  await expect(page.getByRole('progressbar', { name: '每日新词目标', exact: true })).toHaveAttribute('aria-valuemax', '10')
  await seedRecognitionOnlyDue(page)
  await page.getByRole('button', { name: '继续学习', exact: true }).click()
  const input = page.getByPlaceholder('输入拼写后回车', { exact: true })
  await expect(input).toBeVisible()
  await input.fill('ability')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.getByText('战斗结算', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '再来一轮', exact: true }).click()
  await expect(page.getByLabel('拼写答案', { exact: true }).or(page.getByRole('button', { name: /^[ABCD] / })).first()).toBeVisible()
  await page.reload()
  await navigate(page, '统计')
  await expect(page.getByText(/产出/).first()).toBeVisible()
})

test('familiar word exclusion is reversible and retains its practice history', async ({ page }) => {
  await enterApp(page)
  await seedRecognitionOnlyDue(page)
  await navigate(page, '单词')
  await page.getByRole('button', { name: /四级核心.*快速标记熟词/ }).click()
  await page.getByLabel('熟词检索', { exact: true }).fill('ability')
  await page.getByRole('button', { name: /标为熟词.*ability|ability.*标为熟词/ }).click()
  await expect(page.getByRole('button', { name: /恢复练习.*ability|ability.*恢复练习/ })).toBeVisible()
  await navigate(page, '今日')
  await expect(page.getByRole('button', { name: '选择一项备考训练', exact: true })).toBeVisible()
  await navigate(page, '单词')
  await page.getByRole('button', { name: /四级核心.*快速标记熟词/ }).click()
  await page.getByLabel('熟词检索', { exact: true }).fill('ability')
  await page.getByRole('button', { name: /恢复练习.*ability|ability.*恢复练习/ }).click()
  await navigate(page, '今日')
  await expect(page.getByRole('button', { name: '继续学习', exact: true })).toBeVisible()
})


test.describe('new word production with a controlled local wordbook', () => {
test.use({ serviceWorkers: 'block' })

test('new word includes a separate production turn and completes a round with one unique word', async ({ page }) => {
  // Background book repair may replace a seeded word between reading it and starting the session.
  // This flow tests production scheduling; book downloads and offline caching have separate coverage.
  await page.route('**/data/books/**', route => route.abort())
  await enterApp(page)
  await seedRecognitionOnlyDue(page, true)
  const target = await page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('wordquest'); request.onsuccess = () => resolve(request.result) })
    const words = await new Promise<{ word: string; definition: string; freqRank: number; bookId: string; bookUnits?: Record<string, number> }[]>(resolve => { const request = connection.transaction('words').objectStore('words').getAll(); request.onsuccess = () => resolve(request.result) })
    connection.close()
    const word = words.filter(word => word.bookUnits?.['cet4-core'] !== undefined || word.bookId === 'cet4-core').sort((a, b) => a.freqRank - b.freqRank)[0]
    return { word: word.word, meaning: word.definition.split('\n').map(line => line.trim()).filter(Boolean)[0] }
  })
  await page.getByRole('button', { name: '开始今日学习', exact: true }).click()
  const option = page.getByRole('button', { name: /^[ABCD] / }).filter({ has: page.getByText(target.word, { exact: true }).or(page.getByText(target.meaning, { exact: true })) })
  await option.click()
  await page.getByRole('button', { name: '继续', exact: true }).click()
  const input = page.getByLabel('拼写答案', { exact: true })
  await expect(input).toBeVisible()
  await input.fill(target.word)
  await input.press('Enter')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.getByText('战斗结算', { exact: true })).toBeVisible()
  await expect(page.getByText('本场词单（1）', { exact: true })).toBeVisible()
})
})
