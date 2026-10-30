import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PixelBar, PixelButton } from '../src/ui/Pixel'
import { daysUntil, upcomingExamSessions } from '../src/core/exam'
import { levelFromXp, levelProgress, xpForLevel } from '../src/core/game'

test('PixelButton: 保留开关状态、禁用状态和原生按钮属性', () => {
  const html = renderToStaticMarkup(createElement(PixelButton, {
    'aria-pressed': true, 'aria-label': '音效', 'aria-busy': true,
    disabled: true, id: 'sound-toggle', variant: 'ghost', children: '开启',
  }))
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /aria-label="音效"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /id="sound-toggle"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /pixel-btn-ghost/)
})

test('PixelBar: 数值超额、空目标和非法值不产生无效ARIA或NaN宽度', () => {
  const html = renderToStaticMarkup(createElement(PixelBar, { value: 12, max: 10 }))
  assert.match(html, /aria-valuenow="10"/)
  assert.match(html, /width:100%/)
  const empty = renderToStaticMarkup(createElement(PixelBar, { value: NaN, max: 0 }))
  assert.match(empty, /aria-valuenow="0"/)
  assert.match(empty, /aria-valuemax="1"/)
  assert.doesNotMatch(empty, /NaN|Infinity/)
})

test('考试倒计时: 按本地日历日统计，同一天始终为0', () => {
  assert.equal(daysUntil('2026-10-30', new Date(2026, 9, 30, 23, 59)), 0)
  assert.equal(daysUntil('2026-10-31', new Date(2026, 9, 30, 23, 59)), 1)
  assert.equal(daysUntil('2026-10-29', new Date(2026, 9, 30, 0, 1)), -1)
  assert.equal(daysUntil(undefined), null)
  assert.equal(daysUntil('invalid'), null)
  const [session] = upcomingExamSessions(1, new Date(2026, 11, 12, 23, 59))
  assert.equal(session.date, '2026-12-12')
  assert.equal(session.daysLeft, 0)
})

test('等级进度: 首次获得经验即可增长，整数阈值与升级保持一致', () => {
  assert.equal(levelProgress(10).into, 10)
  assert.equal(levelProgress(0).pct, 0)
  for (let level = 2; level <= 50; level++) {
    const threshold = xpForLevel(level)
    assert.equal(levelFromXp(threshold), level)
    assert.equal(levelFromXp(threshold - 1), level - 1)
    assert.equal(levelProgress(threshold).into, 0)
  }
  assert.equal(levelProgress(NaN).into, 0)
})
