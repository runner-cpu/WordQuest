import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.ts'
import { defaultProfile } from '../src/core/profile.ts'
import { buildAchievementCtx } from '../src/core/progress.ts'
import { emptySnapshot } from '../src/core/fsrs.ts'
import type { UserWordStat, Word } from '../src/types/model.ts'

test('四级全本掌握率包括核心重叠词，部分下载不提前满足全本门槛', async (t) => {
  const shared: Word = {
    id: 'shared', word: 'shared', definition: '共用', bookId: 'cet4-core', unitId: 1,
    bookUnits: { 'cet4-core': 1, 'cet4-full': 1 }, freqRank: 1, difficultyWeight: 1,
  }
  const legacy = { ...shared, id: 'legacy', word: 'legacy', bookId: 'cet4-full' as const, bookUnits: undefined }
  const pending = { ...legacy, id: 'pending', word: 'pending' }
  const words = [shared, legacy, pending]
  const stats: UserWordStat[] = [shared, legacy].map((word) => ({
    wordId: word.id, fsrs: { ...emptySnapshot(), reps: 4 }, state: 'mastered',
    mistakeCount: 0, correctCount: 4, firstSeenAt: 0, lastReviewedAt: 0,
  }))
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => key === 'wq:ach-facts' ? JSON.stringify({
      hasTripleFailWord: true, earlyBird: true, nightOwl: true, nearMissAtLogs: 0, nearMissCount: 0,
    }) : null,
    setItem: () => {},
  } })
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  t.mock.method(db.profile, 'get', async () => defaultProfile())
  t.mock.method(db.dailyLogs, 'toArray', async () => [])
  t.mock.method(db.adventures, 'toArray', async () => [])
  t.mock.method(db.expressions, 'toArray', async () => [])
  t.mock.method(db.reviewLogs, 'count', async () => 0)
  t.mock.method(db.words, 'filter', (predicate: (word: Word) => boolean) => ({
    primaryKeys: async () => words.filter(predicate).map((word) => word.id),
  }))
  t.mock.method(db.words, 'where', (field: keyof Word) => ({
    equals: (value: unknown) => ({ primaryKeys: async () => words.filter((word) => word[field] === value).map((word) => word.id) }),
  }))
  t.mock.method(db.stats, 'filter', (predicate: (stat: UserWordStat) => boolean) => ({
    count: async () => stats.filter(predicate).length,
  }))
  t.mock.method(db.stats, 'where', (field: keyof UserWordStat) => ({
    equals: (value: unknown) => ({
      count: async () => stats.filter((stat) => stat[field] === value).length,
      primaryKeys: async () => stats.filter((stat) => stat[field] === value).map((stat) => stat.wordId),
    }),
    aboveOrEqual: (minimum: number) => ({ count: async () => stats.filter((stat) => Number(stat[field]) >= minimum).length }),
  }))

  const ctx = await buildAchievementCtx()
  assert.equal(ctx.bookMasteryRatio, 2 / 3837)
  assert.equal(ctx.mastered, 2)
  assert.ok(ctx.bookMasteryRatio < 0.9)
})
