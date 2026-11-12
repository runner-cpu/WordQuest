import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ACHIEVEMENTS, achievementProgress, summarizeCetRewardProgress } from '../src/core/achievements.ts'
import { ExpressionRewardNotice } from '../src/features/ExpressionPractice.tsx'
import { buildAchievementCtx } from '../src/core/progress.ts'
import { finishExpressionAttempt } from '../src/core/expression.ts'
import { defaultProfile } from '../src/core/profile.ts'
import { ADVENTURE_EXPRESSIONS } from '../src/data/adventureExpressions.ts'
import { db } from '../src/db/database.ts'
import type { DailyLog, ExpressionProgress, Profile } from '../src/types/model.ts'

const row = (number: number, paid: Record<string, number>) => ({
  sourceId: 'local-paper', paperRevision: 'revision-1', number,
  first: 'wrong' as const, firstSubmittedAt: 100,
  last: 'correct' as const, lastSubmittedAt: 200, paid,
})

test('CET learning goals count paid correction and evidence receipts, not raw attempts or consumed legacy receipts', () => {
  const receipts = {
    'local-paper:revision-1:1': row(1, { correction: 1000, evidence: 1100 }),
    'local-paper:revision-1:2': row(2, { firstCorrect: 1200 }),
    'local-paper:revision-1:3': row(3, { correction: 0, evidence: 0 }),
    'local-paper:revision-1:4': row(4, {}),
    'local-paper:revision-1:5': { ...row(5, { correction: 1300 }), last: 'wrong' as const },
  }
  assert.deepEqual(summarizeCetRewardProgress(undefined), { cetCorrections: 0, cetEvidenceNotes: 0 })
  assert.deepEqual(summarizeCetRewardProgress(receipts), { cetCorrections: 2, cetEvidenceNotes: 1 },
    'earned learning actions remain recorded after later practice; answer accuracy alone earns no goal')
})

function achievementFixture(t: TestContext, profile: Profile) {
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.dailyLogs, 'toArray', async () => [])
  t.mock.method(db.adventures, 'toArray', async () => [])
  t.mock.method(db.expressions, 'toArray', async () => [])
  t.mock.method(db.stats, 'where', () => ({ equals: () => ({ count: async () => 0, primaryKeys: async () => [] }) }))
  t.mock.method(db.stats, 'filter', () => ({ count: async () => 0 }))
  t.mock.method(db.words, 'filter', () => ({ primaryKeys: async () => [] }))
  t.mock.method(db.reviewLogs, 'count', async () => 0)
}

test('achievement context exposes local CET learning actions as separate positive goals', async (t) => {
  const profile = {
    ...defaultProfile(),
    cetRewardProgress: { 'local-paper:revision-1:1': row(1, { correction: 1000 }) },
  }
  achievementFixture(t, profile)
  const first = await buildAchievementCtx()
  const correction = ACHIEVEMENTS.find((item) => item.id === 'cet-correction-1')!
  const evidence = ACHIEVEMENTS.find((item) => item.id === 'cet-evidence-1')!
  assert.equal(first.cetCorrections, 1)
  assert.equal(first.cetEvidenceNotes, 0)
  assert.equal(correction.check(first), true)
  assert.equal(evidence.check(first), false, 'a correction without evidence must not unlock the evidence goal')
  assert.deepEqual(achievementProgress(evidence, first), { current: 0, target: 1, ratio: 0, remaining: 1 })
  assert.equal(first.totalAnswered, 0, 'CET goals do not become vocabulary accuracy')
  assert.equal(first.learningDimensions, 0, 'CET goals do not inflate existing learning dimensions')
  for (const goal of [correction, evidence]) {
    assert.match(goal.desc, /本机/)
    assert.match(goal.desc, /不代表能力认证/)
  }

  profile.cetRewardProgress['local-paper:revision-1:1'].paid.evidence = 1100
  const withEvidence = await buildAchievementCtx()
  assert.equal(withEvidence.cetEvidenceNotes, 1)
  assert.equal(evidence.check(withEvidence), true)
})

function expressionFixture(t: TestContext) {
  let profile = defaultProfile()
  const progress = new Map<string, ExpressionProgress>()
  const daily = new Map<string, DailyLog>()
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (next: Profile) => { profile = structuredClone(next); return next.id })
  t.mock.method(db.expressions, 'get', async (id: string) => structuredClone(progress.get(id)))
  t.mock.method(db.expressions, 'put', async (next: ExpressionProgress) => { progress.set(next.id, structuredClone(next)); return next.id })
  t.mock.method(db.dailyLogs, 'get', async (date: string) => structuredClone(daily.get(date)))
  t.mock.method(db.dailyLogs, 'put', async (next: DailyLog) => { daily.set(next.date, structuredClone(next)); return next.date })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)())
  return { profile: () => profile }
}

test('expression reward notice explains scheduled independent practice before an attempt', () => {
  const html = renderToStaticMarkup(createElement(ExpressionRewardNotice))
  assert.match(html, /首次或到期/)
  assert.match(html, /不看提示独立答对/)
  assert.match(html, /3 XP/)
  assert.match(html, /1 金币/)
  assert.match(html, /提示|参考/)
  assert.match(html, /重复练习/)
})

test('expression reward feedback matches actual independent, hinted, wrong and same-day replay results', async (t) => {
  const fixture = expressionFixture(t)
  const [first, second, third] = ADVENTURE_EXPRESSIONS
  const independent = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 1000)
  const replay = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 1000)
  const assisted = await finishExpressionAttempt(second.id, second.referenceAnswer, true, 1000)
  const retry = await finishExpressionAttempt(third.id, 'not the answer', false, 1000)
  assert.deepEqual([independent.xp, independent.coins], [3, 1])
  const rewarded = renderToStaticMarkup(createElement(ExpressionRewardNotice, { result: independent }))
  assert.match(rewarded, /3 XP/)
  assert.match(rewarded, /1 金币/)
  for (const result of [assisted, retry, replay]) {
    assert.deepEqual([result.xp, result.coins], [0, 0])
    const html = renderToStaticMarkup(createElement(ExpressionRewardNotice, { result }))
    assert.match(html, /0 XP/)
    assert.match(html, /0 金币/)
    assert.match(html, /学习进度已保存/)
  }
  assert.match(renderToStaticMarkup(createElement(ExpressionRewardNotice, { result: replay })), /自由练习/)
  assert.match(renderToStaticMarkup(createElement(ExpressionRewardNotice, { result: assisted })), /提示或参考/)
  assert.equal(fixture.profile().xp, 3)
  assert.equal(fixture.profile().coins, 1, 'support and replays preserve learning without duplicate rewards')
})
