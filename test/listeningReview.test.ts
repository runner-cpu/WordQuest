import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExamRoundReview } from '../src/features/ExamPlayer.tsx'
import type { ExamPack } from '../src/core/examImport.ts'
import { SHOP_ITEMS, canBuy, unlocksFor } from '../src/core/shop.ts'
import { defaultProfile } from '../src/core/profile.ts'

const pack: ExamPack = {
  id: 'review-fixture', title: '本轮回顾', level: 'CET-4', sectionName: '材料 1',
  items: [
    { group: 'one', stem: 'The meeting starts at nine.', question: 'When does the meeting start?',
      options: ['At nine.', 'At ten.', 'At eleven.', 'At noon.'], answer: 0, explain: '材料中 nine 给出开始时间。' },
    { group: 'one', stem: '', question: 'What starts at nine?',
      options: ['A class.', 'A meeting.', 'A concert.', 'A race.'], answer: 1, explain: '材料中的 meeting 对应会议。' },
  ],
}

test('听力回顾：逐题保留本轮所选、参考、解析，同组空材料可回看共享原文', () => {
  const html = renderToStaticMarkup(createElement(ExamRoundReview, { pack, answers: [1, 1] }))
  assert.match(html, /1 道错题/)
  assert.match(html, /第 1 题 · 错题回顾/)
  assert.match(html, /你的选择：B\) At ten\./)
  assert.match(html, /参考答案：A\) At nine\./)
  assert.match(html, /材料中 nine 给出开始时间/)
  assert.match(html, /第 2 题 · 答对/)
  assert.equal((html.match(/The meeting starts at nine\./g) ?? []).length, 2)
  assert.equal((html.match(/<details/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<details[^>]*\bopen/)
  assert.match(html, /离开或重练后清除，不保存答题历史/)
})

test('听力回顾：新一轮的空答案不会沿用上一轮选择或将其当作答对', () => {
  const html = renderToStaticMarkup(createElement(ExamRoundReview, { pack, answers: [null, null] }))
  assert.equal((html.match(/你的选择：未作答/g) ?? []).length, 2)
  assert.doesNotMatch(html, /第 [12] 题 · 答对/)
  assert.match(html, /参考答案：A\) At nine\./)
  assert.match(html, /参考答案：B\) A meeting\./)
})

test('听力练习始终开放，外观仍保留历史积累阶段门槛', () => {
  const firstDay = unlocksFor(0)
  assert.equal(firstDay.listenFill, true)
  assert.equal(firstDay.listenQuiz, true)
  assert.equal(firstDay.posterFrame, false)
  const crown = SHOP_ITEMS.find((item) => item.id === 'mascot-crown')!
  assert.equal(canBuy(crown, { ...defaultProfile(), coins: 1000, powerPeak: 0 }).ok, false)
  assert.equal(canBuy(crown, { ...defaultProfile(), coins: 1000, powerPeak: 2000 }).ok, true)
})
