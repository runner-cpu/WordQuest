import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.ts'
import { planSession } from '../src/core/session.ts'
import type { Word } from '../src/types/model.ts'

const word = (id: string, rank: number, bookUnits: Word['bookUnits']): Word => ({
  id, word: id, definition: id, freqRank: rank, difficultyWeight: 1,
  bookId: 'cet4-full', unitId: 9, bookUnits,
})

test('今日队列按所有归属取到期词，新词跨词书去重并扣除当天已学额度', async () => {
  const shared = word('shared', 1, { 'cet4-core': 1, 'cet4-full': 9 })
  const due = word('due', 2, { 'cet4-core': 1, 'cet4-full': 9 })
  const extra = word('extra', 3, { 'cet4-full': 10 })
  const rows = [shared, due, extra]
  const original = {
    stats: db.stats.toArray,
    daily: db.dailyLogs.get,
    bulkGet: db.words.bulkGet,
    filter: db.words.filter,
  }
  let alreadyLearned = 1
  db.stats.toArray = async () => [{ wordId: 'due', fsrs: { reps: 1, due: 0 } }] as never
  db.dailyLogs.get = (async () => ({ newLearned: alreadyLearned })) as never
  db.words.bulkGet = (async (ids: string[]) => ids.map((id) => rows.find((row) => row.id === id))) as never
  db.words.filter = ((predicate: (row: Word) => boolean) => ({
    toArray: async () => rows.filter(predicate),
  })) as never
  try {
    const plan = await planSession(['cet4-core', 'cet4-full'], 3)
    assert.deepEqual(plan.reviews.map((row) => row.id), ['due'])
    assert.deepEqual(plan.news.map((row) => row.id), ['shared', 'extra'])
    assert.equal(plan.news[0].bookId, 'cet4-core')
    assert.equal(plan.news[0].unitId, 1)
    alreadyLearned = 2
    assert.deepEqual((await planSession(['cet4-core', 'cet4-full'], 3)).news.map((row) => row.id), ['shared'])
    alreadyLearned = 3
    const finished = await planSession(['cet4-core'], 3)
    assert.deepEqual(finished.news, [])
    assert.deepEqual(finished.reviews.map((row) => row.id), ['due'])
  } finally {
    db.stats.toArray = original.stats
    db.dailyLogs.get = original.daily
    db.words.bulkGet = original.bulkGet
    db.words.filter = original.filter
  }
})
