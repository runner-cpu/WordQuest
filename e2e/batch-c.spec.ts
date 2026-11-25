import { test, expect } from '@playwright/test'
import { enterApp, navigate, exitPaper } from './helpers'

test('original practice supports sentence loops, AB, speed and keyboard without revealing references', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    window.Audio = class extends NativeAudio {
      constructor(...args: ConstructorParameters<typeof Audio>) {
        super(...args)
        ;(window as unknown as { recording: HTMLAudioElement }).recording = this
      }
    }
  })
  await enterApp(page)
  await navigate(page, '听力')
  await page.locator('.listening-extra > summary').click()
  await page.getByRole('button', { name: '练习校园与科技', exact: true }).click()
  await page.getByRole('button', { name: '播放原文', exact: true }).click()
  await page.waitForFunction(() => {
    const a = (window as unknown as { recording: HTMLAudioElement }).recording
    return a && !a.paused && a.currentTime > 0.1
  })
  await page.locator('h2').first().click()
  await page.keyboard.press('ArrowLeft')
  expect(await page.evaluate(() => (window as unknown as { recording: HTMLAudioElement }).recording.paused)).toBe(false)
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true })))
  expect(await page.evaluate(() => (window as unknown as { recording: HTMLAudioElement }).recording.paused)).toBe(false)
  await page.getByRole('button', { name: '1.5×', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { recording: HTMLAudioElement }).recording.playbackRate)).toBe(1.5)
  await page.getByRole('button', { name: '单句循环关', exact: true }).click()
  await expect(page.getByRole('button', { name: '单句循环开', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => {
    const a = (window as unknown as { recording: HTMLAudioElement }).recording
    a.currentTime = a.duration - 0.05
    a.dispatchEvent(new Event('timeupdate'))
    a.dispatchEvent(new Event('ended'))
  })
  await page.waitForFunction(() => (window as unknown as { recording: HTMLAudioElement }).recording.currentTime < 3)
  await page.locator('.intensive-reference > summary').click()
  await expect(page.getByText('不是考试字幕。可先独立听辨，再展开原文核对。', { exact: true })).toBeVisible()
  await expect(page.getByText('时间轴为机器估算/待校对。逐句边界可能落在句中，可用 A/B 手动调整。')).toBeVisible()
  await page.getByRole('button', { name: '下一句', exact: true }).click()
  await expect(page.locator('.intensive-reference ol li').nth(1).getByRole('button')).toHaveAttribute('aria-current', 'true')
  await page.locator('h2').first().click()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.intensive-reference ol li').first().getByRole('button')).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Space')
  await page.waitForFunction(() => !(window as unknown as { recording: HTMLAudioElement }).recording.paused)
  await page.keyboard.press('Space')
  await page.getByLabel('录音播放位置', { exact: true }).fill('1')
  await page.getByRole('button', { name: /^设 A/ }).click()
  await page.getByLabel('录音播放位置', { exact: true }).fill('2')
  await page.getByRole('button', { name: /^设 B/ }).click()
  await expect(page.getByRole('button', { name: 'A/B 循环开', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '退出听力短练', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { recording: HTMLAudioElement }).recording.paused)).toBe(true)
})

test('located CET group loops and stops when changing materials; unlocated group is explicit', async ({ page }) => {
  await enterApp(page)
  await navigate(page, '听力')
  await page.getByRole('button', { name: /开始2025年6月四级.*听力/ }).click()
  const player = page.getByLabel('本套真题听力播放器', { exact: true })
  const loop = page.getByRole('button', { name: '题组循环', exact: true })
  await expect(loop).toBeEnabled()
  await loop.click()
  await expect(page.getByRole('button', { name: '关闭题组循环' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true)
  await player.evaluate((a: HTMLAudioElement) => { a.currentTime = 161.4; a.dispatchEvent(new Event('timeupdate')) })
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.currentTime < 5)).toBe(true)
  await player.evaluate((a: HTMLAudioElement) => { a.pause(); a.currentTime = 190; a.dispatchEvent(new Event('timeupdate')) })
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.currentTime)).toBe(190)
  await page.getByRole('button', { name: '标记 A', exact: true }).click()
  await player.evaluate((a: HTMLAudioElement) => { a.currentTime = 180 })
  await page.getByRole('button', { name: '标记 B', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('B 点需在 A 点之后')
  await player.evaluate((a: HTMLAudioElement) => { a.currentTime = 195 })
  await page.getByRole('button', { name: '标记 B', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByLabel('听力材料', { exact: false }).selectOption('1')
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
  await expect(page.getByRole('button', { name: '题组循环', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await exitPaper(page)
  await page.getByRole('button', { name: /开始2026年6月四级.*听力/ }).click()
  await page.getByLabel('听力材料', { exact: false }).selectOption('1')
  await expect(page.getByText('本题组尚未定位，可手动拖动', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '题组循环', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '标记 A', exact: true })).toBeEnabled()
})

test('CET recording load timeout offers recovery and switching groups clears stale failures', async ({ page }) => {
  await enterApp(page)
  await navigate(page, '听力')
  await page.getByRole('button', { name: /开始2025年6月四级.*听力/ }).click()
  const player = page.getByLabel('本套真题听力播放器', { exact: true })
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => a.readyState >= 3)).toBe(true)
  await page.clock.install()
  await player.evaluate((a: HTMLAudioElement) => { a.play = () => new Promise<void>(() => {}) })
  await page.getByRole('button', { name: '播放本段', exact: true }).click()
  await page.clock.fastForward(13000)
  await expect(page.getByRole('alert')).toContainText('录音载入超时')
  await expect(page.getByRole('button', { name: '重试录音', exact: true })).toBeVisible()
  await page.getByLabel('听力材料', { exact: false }).selectOption('1')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
