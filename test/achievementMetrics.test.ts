import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { buildAchievementCtx } from '../src/core/progress.ts'
import { ADVENTURE_SCENES } from '../src/data/adventures.ts'
import type { ExpressionProgress, ReviewLog } from '../src/types/model.ts'

test('成就上下文增量读取日志，旧日志导入会重建；隔日空档不计连续达标', async (t) => {
  const log = (id: string, day: number, correct: boolean): ReviewLog => ({
    id, wordId: 'same', reviewedAt: new Date(2026, 9, day, 12).getTime(), correct,
    mode: 'spell', rating: correct ? 3 : 1, elapsedMs: 1000, deviceId: 'test',
  })
  let logs = [log('first', 1, true), log('forgot', 2, false)]
  let fullReads = 0
  let incrementalReads = 0
  t.mock.method(db.profile, 'get', async () => defaultProfile())
  t.mock.method(db.dailyLogs, 'toArray', async () => [1, 3].map((day) => ({ ...emptyDaily(`2026-10-0${day}`), totalAnswered: 10, correctCount: 10, reviewsDone: 5 })))
  t.mock.method(db.adventures, 'toArray', async () => [
    { sceneId: ADVENTURE_SCENES[0].id, bestScore: 3, firstPlayedAt: 0, lastPlayedAt: 0 },
    { sceneId: ADVENTURE_SCENES[1].id, bestScore: 2, firstPlayedAt: 0, lastPlayedAt: 0 },
    { sceneId: 'unrecognized', bestScore: 3, firstPlayedAt: 0, lastPlayedAt: 0 },
  ])
  t.mock.method(db.expressions, 'toArray', async () => [])
  t.mock.method(db.stats, 'where', () => ({ equals: () => ({ count: async () => 0, primaryKeys: async () => [] }) }))
  t.mock.method(db.stats, 'filter', () => ({ count: async () => 0 }))
  t.mock.method(db.words, 'filter', () => ({ primaryKeys: async () => [] }))
  t.mock.method(db.reviewLogs, 'count', async () => logs.length)
  t.mock.method(db.reviewLogs, 'orderBy', () => ({ toArray: async () => { fullReads++; return structuredClone(logs) } }))
  t.mock.method(db.reviewLogs, 'where', () => ({ aboveOrEqual: (time: number) => ({ toArray: async () => { incrementalReads++; return structuredClone(logs.filter((row) => row.reviewedAt >= time)) } }) }))

  const first = await buildAchievementCtx()
  assert.equal(first.accuracyStreakDays, 1)
  assert.equal(first.studyDays, 2)
  assert.equal(first.adventureCompleted, 2)
  assert.equal(first.adventurePerfect, 1)
  assert.equal(fullReads, 1)
  await buildAchievementCtx()
  assert.equal(fullReads, 1)
  assert.equal(incrementalReads, 0)
  logs.push(log('recovered', 3, true))
  assert.equal((await buildAchievementCtx()).relearnedWords, 1)
  assert.equal(fullReads, 1)
  assert.equal(incrementalReads, 1)
  logs = [log('older-imported', 1, true), ...logs]
  await buildAchievementCtx()
  assert.equal(fullReads, 2)
  assert.equal(incrementalReads, 2)
})

test('表达成就只读取有效题目，独立日期去重；提示与同日重玩不变成隔日记忆', async (t) => {
  const at = (day: number) => new Date(2026, 9, day, 12).getTime()
  const row = (sceneId: string, number: number, independentDays: string[]): ExpressionProgress => ({
    id: `${sceneId}-say-${number}`, sceneId, attempts: 10,
    firstPracticedAt: at(1), lastPracticedAt: at(5), dueAt: at(6), stage: 1,
    lastScheduledDate: '2026-10-05', independentDays, rewardedDates: [],
    lastOutcome: independentDays.length ? 'independent' : 'assisted',
  })
  const [library, project, seminar] = ADVENTURE_SCENES
  let expressions = [
    row(library.id, 1, ['2026-10-01', '2026-10-01']),
    row(library.id, 2, []),
    row(project.id, 1, ['2026-10-01', '2026-10-03', 'invalid']),
    row(project.id, 2, ['2026-10-03', '2026-02-31']),
    { ...row('unknown-scene', 1, ['2026-10-07', '2026-10-08']), firstPracticedAt: at(7), lastPracticedAt: at(8) },
    { ...row(seminar.id, 1, ['2026-10-07', '2026-10-08']), sceneId: library.id, firstPracticedAt: at(7), lastPracticedAt: at(8) },
    { ...row(seminar.id, 2, []), attempts: 0, firstPracticedAt: at(7), lastPracticedAt: at(8) },
  ]
  t.mock.method(db.profile, 'get', async () => defaultProfile())
  t.mock.method(db.dailyLogs, 'toArray', async () => [])
  t.mock.method(db.adventures, 'toArray', async () => [])
  t.mock.method(db.expressions, 'toArray', async () => structuredClone(expressions))
  t.mock.method(db.stats, 'where', () => ({ equals: () => ({ count: async () => 0, primaryKeys: async () => [] }) }))
  t.mock.method(db.stats, 'filter', () => ({ count: async () => 0 }))
  t.mock.method(db.words, 'filter', () => ({ primaryKeys: async () => [] }))
  t.mock.method(db.reviewLogs, 'count', async () => 0)

  const ctx = await buildAchievementCtx()
  assert.equal(ctx.expressionIndependent, 3)
  assert.equal(ctx.expressionRetained, 1, 'one day repeated many times is not retained across dates')
  assert.equal(ctx.studyDays, 3, 'valid expression practice dates are counted; unknown and mismatched content is ignored')
  assert.equal(ctx.learningDimensions, 1, 'expression exercises belong to the existing application dimension')
  assert.equal(ctx.adventureCompleted, 0)
  assert.equal(ctx.totalAnswered, 0, 'expression exercises do not become vocabulary accuracy facts')

  expressions = [row(library.id, 2, [])]
  const assisted = await buildAchievementCtx()
  assert.equal(assisted.expressionIndependent, 0, 'hinted attempts alone do not earn independent-expression progress')
  assert.equal(assisted.expressionRetained, 0)
  assert.equal(assisted.learningDimensions, 1)
  assert.equal(assisted.studyDays, 2)
})
