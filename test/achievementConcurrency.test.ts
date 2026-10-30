import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.ts'
import { awardRewards, defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { checkAchievements } from '../src/core/progress.ts'
import { COIN_RULES } from '../src/core/game.ts'
import { ADVENTURE_SCENES } from '../src/data/adventures.ts'
import type { AchievementUnlock } from '../src/types/model.ts'

test('并行成就检查只解锁和发奖一次，包含冒险与表达成就并保留同时提交的听力奖励', async (t) => {
  let profile = { ...defaultProfile(), xp: 100, coins: 50, streak: 1 }
  let daily = { ...emptyDaily(), xp: 100, coinsEarned: 50 }
  const achievements = new Map<string, AchievementUnlock>([
    ['fail-triple', { id: 'fail-triple', unlockedAt: 1 }],
    ['hide-early', { id: 'hide-early', unlockedAt: 1 }],
    ['combo-night', { id: 'combo-night', unlockedAt: 1 }],
    ['listen-1', { id: 'listen-1', unlockedAt: 1 }],
  ])
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

  let activeTables: Set<unknown> | undefined
  let achievementWrites = 0
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (row) => {
    assert.ok(activeTables?.has(db.profile), 'balance updates must be inside the write transaction')
    profile = structuredClone(row)
    return row.id
  })
  t.mock.method(db.dailyLogs, 'toArray', async () => [structuredClone(daily)])
  t.mock.method(db.dailyLogs, 'get', async () => structuredClone(daily))
  t.mock.method(db.dailyLogs, 'put', async (row) => {
    assert.ok(activeTables?.has(db.dailyLogs), 'daily rewards must be in the same write transaction')
    daily = structuredClone(row)
    return row.date
  })
  t.mock.method(db.achievements, 'toArray', async () => structuredClone([...achievements.values()]))
  t.mock.method(db.achievements, 'bulkGet', async (ids: string[]) => {
    assert.ok(activeTables?.has(db.achievements), 'deduplication must run after acquiring the achievement write lock')
    return ids.map((id) => structuredClone(achievements.get(id)))
  })
  t.mock.method(db.achievements, 'bulkPut', async (rows: AchievementUnlock[]) => {
    assert.ok(activeTables?.has(db.achievements) && activeTables.has(db.profile) && activeTables.has(db.dailyLogs),
      'unlock records and both reward tables must share one transaction')
    achievementWrites += rows.length
    for (const row of rows) achievements.set(row.id, structuredClone(row))
    return rows.at(-1)?.id
  })
  t.mock.method(db.reviewLogs, 'count', async () => 0)
  t.mock.method(db.adventures, 'toArray', async () => [{
    sceneId: ADVENTURE_SCENES[0].id, bestScore: 3, attempts: 1,
    correctQuestionIds: ADVENTURE_SCENES[0].questions.map((question) => question.id),
    firstPlayedAt: Date.now(), lastPlayedAt: Date.now(),
  }])
  t.mock.method(db.expressions, 'toArray', async () => [{
    id: `${ADVENTURE_SCENES[0].id}-say-1`, sceneId: ADVENTURE_SCENES[0].id,
    attempts: 1, firstPracticedAt: Date.now(), lastPracticedAt: Date.now(),
    independentDays: [daily.date], rewardedDates: [daily.date],
  }])
  t.mock.method(db.words, 'filter', () => ({ primaryKeys: async () => [] }))
  t.mock.method(db.stats, 'filter', () => ({ count: async () => 0 }))
  t.mock.method(db.stats, 'where', () => ({
    equals: () => ({ count: async () => 0, primaryKeys: async () => [] }),
    aboveOrEqual: () => ({ count: async () => 0 }),
  }))

  // IndexedDB 串行处理重叠表的写事务；模拟两份已算好上下文的检查与听力奖励竞争。
  let writes = Promise.resolve()
  t.mock.method(db, 'transaction', (...args: unknown[]) => {
    const tables = args[1] as unknown[]
    const run = args[args.length - 1] as () => Promise<unknown>
    const result = writes.then(async () => {
      activeTables = new Set(tables)
      try { return await run() } finally { activeTables = undefined }
    })
    writes = result.then(() => undefined, () => undefined)
    return result
  })

  const [first, second] = await Promise.all([
    checkAchievements(), checkAchievements(),
    awardRewards({ xp: 3, coins: 7, listeningSeconds: 15, listeningSentences: 1 }),
  ])
  assert.deepEqual([...first, ...second].map((achievement) => achievement.id), ['streak-1', 'adventure-1', 'adventure-perfect-1', 'expression-1'])
  assert.equal(achievementWrites, 4)
  assert.equal(achievements.size, 8)
  assert.equal(profile.coins, 50 + 7 + COIN_RULES.achievement * 4)
  assert.equal(daily.coinsEarned, 50 + 7 + COIN_RULES.achievement * 4)
  assert.equal(profile.xp, 103)
  assert.equal(daily.xp, 103)
  assert.equal(daily.listeningSeconds, 15)
  assert.equal(daily.listeningSentences, 1)
  assert.deepEqual(await checkAchievements(), [], 'later checks do not award the unlock again')
  assert.equal(achievementWrites, 4)
})
