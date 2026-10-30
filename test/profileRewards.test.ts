import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.ts'
import { awardRewards, defaultProfile, emptyDaily } from '../src/core/profile.ts'

test('并行发放奖励累加余额和每日汇总，不丢失其中一份', async (t) => {
  let profile = { ...defaultProfile(), xp: 100, coins: 50 }
  let daily = { ...emptyDaily(), xp: 100, coinsEarned: 50 }
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (row) => { profile = structuredClone(row); return row.id })
  t.mock.method(db.dailyLogs, 'get', async () => structuredClone(daily))
  t.mock.method(db.dailyLogs, 'put', async (row) => { daily = structuredClone(row); return row.date })

  // IndexedDB 对重叠表的写事务按顺序执行；数据访问本身仍可交错。
  let writes = Promise.resolve()
  t.mock.method(db, 'transaction', (...args: unknown[]) => {
    const run = args[args.length - 1] as () => Promise<unknown>
    const result = writes.then(run)
    writes = result.then(() => undefined, () => undefined)
    return result
  })

  const results = await Promise.all([
    awardRewards({ xp: 10, coins: 1, listeningSeconds: 15, listeningSentences: 1 }),
    awardRewards({ xp: 7, coins: 2, studySeconds: 8 }),
  ])
  assert.equal(profile.xp, 117)
  assert.equal(profile.coins, 53)
  assert.equal(daily.xp, 117)
  assert.equal(daily.coinsEarned, 53)
  assert.equal(daily.listeningSeconds, 15)
  assert.equal(daily.listeningSentences, 1)
  assert.equal(daily.studySeconds, 8)
  assert.deepEqual(results.map((result) => result.totalXp), [110, 117])
})
