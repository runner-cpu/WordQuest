import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db, todayKey } from '../src/db/database.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { emptySnapshot, schedule } from '../src/core/fsrs.ts'
import {
  appendSessionRetry, buildSessionQueue, overrideRating, planSession,
  selectSessionQuestionKind, submitAnswer, todayProgress,
} from '../src/core/session.ts'
import type { ReviewLog, UserWordStat, Word } from '../src/types/model.ts'

const word = (id: string, rank = 1): Word => ({ id, word: id, definition: `释义 ${id}`, bookId: 'cet4-core', unitId: 1, freqRank: rank, difficultyWeight: 1 })

test('session gives each new word recognition followed by guaranteed production and deduplicates memberships', () => {
  const due = word('due')
  const fresh = word('fresh')
  const queue = buildSessionQueue([due, due], [fresh, fresh, due])
  assert.deepEqual(queue.map((item) => [item.word.id, item.stage]), [['due', 'review'], ['fresh', 'introduce'], ['fresh', 'produce']])
  assert.equal(queue[1].isReview, false)
  assert.equal(queue[2].isReview, true)
  for (let random = 0; random < 30; random++) {
    assert.ok(['spell', 'listen-spell'].includes(selectSessionQuestionKind(queue[0], 0, random)))
    assert.ok(['choice-word', 'choice-meaning'].includes(selectSessionQuestionKind(queue[1], 0, random)))
    assert.ok(['spell', 'listen-spell'].includes(selectSessionQuestionKind(queue[2], 4, random)))
  }
  const types = Array.from({ length: 6 }, (_, sample) => selectSessionQuestionKind(queue[0], 1, sample))
  assert.ok(types.filter((kind) => kind === 'spell' || kind === 'listen-spell').length > types.length / 2)
})

test('wrong-answer retries preserve mandatory new production and remain bounded per word and round', () => {
  const initial = buildSessionQueue([word('one'), word('two')], [word('fresh')])
  assert.equal(appendSessionRetry(initial, initial[2], false, 3), initial, 'recognition failures already have a production follow-up')
  assert.equal(appendSessionRetry(initial, initial[0], true, 3), initial)
  const first = appendSessionRetry(initial, initial[0], false, 3)
  assert.equal(first.length, initial.length + 1)
  assert.equal(first.at(-1)!.stage, 'retry')
  assert.equal(appendSessionRetry(first, first.at(-1)!, false, 3), first, 'a retry never creates another retry')
  const second = appendSessionRetry(first, initial[1], false, 3)
  assert.equal(second.length, initial.length + 2)
  assert.equal(appendSessionRetry(second, initial[3], false, 3), second, 'ceil(initial words / 2) caps retries')
})

test('familiar exclusions affect due queues, new candidates and today due count without removing records', async (t) => {
  const rows = [word('due'), word('excluded-due'), word('fresh', 3), word('excluded-new', 2)]
  const stats = rows.slice(0, 2).map((row) => ({ wordId: row.id, fsrs: { due: 0, reps: 1 }, state: 'review' }))
  const profile = { ...defaultProfile(), familiarWords: { 'excluded-due': { excluded: true, updatedAt: 1 }, 'excluded-new': { excluded: true, updatedAt: 1 } } }
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.stats, 'toArray', async () => structuredClone(stats))
  t.mock.method(db.stats, 'where', (key: string) => ({
    belowOrEqual: () => ({ filter: (predicate: (row: typeof stats[number]) => boolean) => ({ count: async () => stats.filter(predicate).length }) }),
    equals: () => ({ count: async () => key === 'state' ? 0 : stats.length }),
  }))
  t.mock.method(db.stats, 'filter', (predicate: (row: typeof stats[number]) => boolean) => ({ count: async () => stats.filter(predicate).length }))
  t.mock.method(db.dailyLogs, 'get', async () => undefined)
  t.mock.method(db.words, 'bulkGet', async (ids: string[]) => ids.map((id) => rows.find((row) => row.id === id)))
  t.mock.method(db.words, 'filter', (predicate: (row: Word) => boolean) => ({ toArray: async () => rows.filter(predicate) }))
  const result = await planSession(['cet4-core'], 10)
  assert.deepEqual(result.reviews.map((row) => row.id), ['due'])
  assert.deepEqual(result.news.map((row) => row.id), ['fresh'])
  assert.equal((await todayProgress()).dueCount, 1)
  assert.equal(stats.length, 2, 'FSRS rows remain intact')
})

test('submit and rating replay derive production evidence from actual exact spelling logs while preserving FSRS schedule', async (t) => {
  const now = Date.now()
  const target = word('target')
  let profile = { ...defaultProfile(), lastStudyDate: todayKey() }
  let daily = emptyDaily()
  let stat: UserWordStat = { wordId: target.id, fsrs: { ...emptySnapshot(now - 86400000), reps: 5, state: 2, scheduled_days: 60, stability: 100, difficulty: 5, due: now - 1, last_review: now - 86400000 }, state: 'review', correctCount: 5, mistakeCount: 0, firstSeenAt: now - 86400000, lastReviewedAt: now - 86400000 }
  const original = structuredClone(stat.fsrs)
  const logs: ReviewLog[] = [{ id: 'choice', wordId: target.id, mode: 'choice-word', correct: true, rating: 4, reviewedAt: now - 86400000, elapsedMs: 1000, deviceId: 'fixture' }]
  t.mock.method(db, 'transaction', async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)())
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (next) => { profile = structuredClone(next); return next.id })
  t.mock.method(db.dailyLogs, 'get', async () => structuredClone(daily))
  t.mock.method(db.dailyLogs, 'put', async (next) => { daily = structuredClone(next); return next.date })
  t.mock.method(db.stats, 'get', async () => structuredClone(stat))
  t.mock.method(db.stats, 'put', async (next) => { stat = structuredClone(next); return next.wordId })
  t.mock.method(db.stats, 'where', () => ({ equals: () => ({ toArray: async () => stat.state === 'mastered' ? [structuredClone(stat)] : [] }) }))
  t.mock.method(db.words, 'bulkGet', async () => [target])
  t.mock.method(db.reviewLogs, 'add', async (next) => { logs.push(structuredClone(next)); return next.id })
  t.mock.method(db.reviewLogs, 'get', async (id: string) => structuredClone(logs.find((log) => log.id === id)))
  t.mock.method(db.reviewLogs, 'update', async (id: string, patch: Partial<ReviewLog>) => { Object.assign(logs.find((log) => log.id === id)!, patch); return 1 })
  t.mock.method(db.reviewLogs, 'where', () => ({ equals: () => ({ toArray: async () => structuredClone(logs), sortBy: async () => structuredClone(logs).sort((a, b) => a.reviewedAt - b.reviewedAt) }) }))
  const choice = await submitAnswer({ question: { word: target, kind: 'choice-word', answer: target.definition, isReview: true }, rating: 4, elapsedMs: 1000, correct: true, manual: true })
  assert.equal(choice.stat.productionCorrectCount, 0)
  assert.equal(choice.stat.state, 'review')
  assert.deepEqual(choice.stat.fsrs, schedule(original, 4, choice.stat.lastReviewedAt))
  const typo = await submitAnswer({ question: { word: target, kind: 'spell', answer: target.word, isReview: true }, rating: 2, elapsedMs: 1000, correct: true, nearMiss: true })
  assert.equal(typo.stat.productionCorrectCount, 0)
  assert.equal(logs.at(-1)!.nearMiss, true)
  const exact = await submitAnswer({ question: { word: target, kind: 'listen-spell', answer: target.word, isReview: true }, rating: 3, elapsedMs: 10000, correct: true })
  assert.equal(exact.stat.productionCorrectCount, 1)
  const logCount = logs.length
  const xp = profile.xp
  await overrideRating(target.id, exact.logId, 4)
  assert.equal(stat.productionCorrectCount, 1)
  assert.equal(logs.length, logCount)
  assert.equal(profile.xp, xp, 'manual replay does not award again')
})
