import { expect, type Page } from '@playwright/test'

export async function enterApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '开始冒险', exact: true }).click()
  await page.getByRole('heading', { name: '四六级备考台', exact: true }).waitFor()
}
export async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).filter({ visible: true }).click()
}
export async function openReading(page: Page) {
  await page.getByRole('button', { name: /(?:开始|继续)2026年6月四级.*阅读与写译/ }).click()
  await page.getByRole('dialog').waitFor()
}
export async function exitPaper(page: Page) {
  await page.getByRole('button', { name: '保存并退出真题练习', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
