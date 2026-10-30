import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { dateKeyOffset, db, todayKey } from '../src/db/database.ts'
import { emptySnapshot, schedule, State, toCard, toSnapshot } from '../src/core/fsrs.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { claimChest } from '../src/core/progress.ts'
import { COIN_RULES } from '../src/core/game.ts'
import type { DailyLog, DailyQuest, Profile } from '../src/types/model.ts'

test('FSRS: serialized Good answers graduate from the ten-minute learning step', () => {
  const now = new Date('2026-10-30T09:00:00').getTime()
  const first = schedule(emptySnapshot(now), 3, now)
  assert.equal(first.state, State.Learning)
  assert.equal(first.learning_steps, 1)

  // Every persisted answer passes through JSON-compatible snapshots.
  const restored = JSON.parse(JSON.stringify(first))
  const second = schedule(restored, 3, first.due)
  assert.equal(second.state, State.Review)
  assert.ok(second.scheduled_days >= 1)
  assert.ok(second.due - first.due >= 86400000)
})

test('FSRS: Again resets the learning step, then two Good answers graduate', () => {
  const now = new Date('2026-10-30T09:00:00').getTime()
  const good = schedule(emptySnapshot(now), 3, now)
  const again = schedule(good, 1, good.due)
  assert.equal(again.learning_steps, 0)
  assert.equal(again.state, State.Learning)
  const retry = schedule(again, 3, again.due)
  assert.equal(retry.learning_steps, 1)
  assert.equal(retry.state, State.Learning)
  const graduated = schedule(retry, 3, retry.due)
  assert.equal(graduated.state, State.Review)
})

test('FSRS: card/snapshot round trip retains learning progress', () => {
  const now = new Date('2026-10-30T09:00:00').getTime()
  const snap = schedule(emptySnapshot(now), 3, now)
  const card = toCard(snap)
  assert.equal(card.learning_steps, 1)
  assert.deepEqual(toSnapshot(card), snap)
})

test('FSRS: old snapshots recover the pending step without skipping an Again retry', () => {
  const now = new Date('2026-10-30T09:00:00').getTime()
  const oldGood = schedule(emptySnapshot(now), 3, now)
  delete oldGood.learning_steps
  assert.equal(schedule(oldGood, 3, oldGood.due).state, State.Review)

  const oldAgain = schedule(emptySnapshot(now), 1, now)
  delete oldAgain.learning_steps
  const retry = schedule(oldAgain, 3, oldAgain.due)
  assert.equal(retry.state, State.Learning)
  assert.equal(retry.learning_steps, 1)
})

/** Isolate the persistence boundary while exercising the public claimChest flow. */
function chestFixture(t: TestContext, options: {
  opened?: number
  profile?: Partial<Profile>
  complete?: boolean
} = {}) {
  const quests = new Map<string, DailyQuest>()
  for (let i = 0; i < (options.opened ?? 0); i++) {
    const date = dateKeyOffset(-i - 1)
    quests.set(date, {
      date,
      questIds: [],
      progress: [],
      chestOpened: true,
      // This is the broken legacy value, deliberately not a cumulative count.
      chestCount: 1,
    })
  }
  let profile: Profile = { ...defaultProfile(), ...options.profile }
  const daily: DailyLog = {
    ...emptyDaily(),
    ...(options.complete === false ? {} : {
      newLearned: 100,
      reviewsDone: 100,
      listeningSeconds: 1000,
    }),
  }
  let currentDaily = daily
  t.mock.method(db.quests, 'get', async (date: string) => structuredClone(quests.get(date)))
  t.mock.method(db.quests, 'put', async (row: DailyQuest) => {
    quests.set(row.date, structuredClone(row))
    return row.date
  })
  t.mock.method(db.quests, 'filter', (predicate: (row: DailyQuest) => boolean) => ({
    count: async () => [...quests.values()].filter(predicate).length,
  }))
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (row: Profile) => {
    profile = structuredClone(row)
    return row.id
  })
  t.mock.method(db.dailyLogs, 'get', async () => structuredClone(currentDaily))
  t.mock.method(db.dailyLogs, 'put', async (row: DailyLog) => {
    currentDaily = structuredClone(row)
    return row.date
  })
  t.mock.method(db.stats, 'toArray', async () => [])
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>
    return callback()
  })
  return {
    quests,
    profile: () => profile,
    daily: () => currentDaily,
  }
}

test('chest: the fifth opened day grants a fragment despite legacy per-day counts', async (t) => {
  const fixture = chestFixture(t, { opened: 4 })
  const reward = await claimChest()
  assert.deepEqual(reward, { coins: COIN_RULES.questAll, fragment: true })
  assert.equal(fixture.quests.get(todayKey())?.chestCount, 5)
  assert.equal(fixture.profile().themeFragments, 1)
  assert.equal(fixture.profile().chestRewardTier, 1)
  assert.equal(fixture.profile().coins, COIN_RULES.questAll)
  assert.equal(fixture.daily().coinsEarned, COIN_RULES.questAll)
})

test('chest: already rewarded tiers wait until the next group of five', async (t) => {
  const fixture = chestFixture(t, {
    opened: 5,
    profile: { chestRewardTier: 1, themeFragments: 1 },
  })
  const reward = await claimChest()
  assert.equal(reward?.fragment, false)
  assert.equal(fixture.profile().themeFragments, 1)
  assert.equal(fixture.profile().chestRewardTier, 1)
})

test('chest: the tenth opening grants the second milestone fragment', async (t) => {
  const fixture = chestFixture(t, {
    opened: 9,
    profile: { chestRewardTier: 1, themeFragments: 0 },
  })
  assert.equal((await claimChest())?.fragment, true)
  assert.equal(fixture.profile().themeFragments, 1)
  assert.equal(fixture.profile().chestRewardTier, 2)
})

test('chest: legacy unpaid milestones catch up one fragment per opening', async (t) => {
  const fixture = chestFixture(t, { opened: 10 })
  assert.equal((await claimChest())?.fragment, true)
  assert.equal(fixture.profile().themeFragments, 1)
  assert.equal(fixture.profile().chestRewardTier, 1)
  assert.equal(await claimChest(), null)
  assert.equal(fixture.profile().themeFragments, 1)
  assert.equal(fixture.profile().coins, COIN_RULES.questAll)
})

test('chest: incomplete tasks award no coins or fragments', async (t) => {
  const fixture = chestFixture(t, { opened: 4, complete: false })
  assert.equal(await claimChest(), null)
  assert.equal(fixture.profile().coins, 0)
  assert.equal(fixture.profile().themeFragments, undefined)
  assert.equal(fixture.quests.get(todayKey())?.chestOpened, false)
})
