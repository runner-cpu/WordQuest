import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURE_SCENES, type AdventureScene } from '../src/data/adventures.ts'
import { db, todayKey } from '../src/db/database.ts'
import { finishAdventure, type AdventureAnswer } from '../src/core/adventure.ts'
import { defaultProfile } from '../src/core/profile.ts'
import type { AdventureProgress, DailyLog, Profile } from '../src/types/model.ts'

function answersFor(scene: AdventureScene, correctIndices = [0, 1, 2]): AdventureAnswer[] {
  return scene.questions.map((question, index) => ({
    questionId: question.id,
    optionIndex: correctIndices.includes(index) ? question.answer : (question.answer + 1) % question.options.length,
  }))
}

/** Model the transaction boundary with a FIFO lock and rollback, yielding between every read. */
function adventureFixture(t: TestContext, initial: AdventureProgress[] = []) {
  let progress = new Map(initial.map((row) => [row.sceneId, structuredClone(row)]))
  let profile = defaultProfile()
  let daily = new Map<string, DailyLog>()
  let active = false
  let pending: Promise<void> = Promise.resolve()
  let transactions = 0
  let failNextProfileWrite = false
  const assertTransaction = () => assert.equal(active, true, 'all state and reward reads/writes must share a transaction')

  t.mock.method(db.adventures, 'get', async (id: string) => {
    assertTransaction()
    await Promise.resolve()
    return structuredClone(progress.get(id))
  })
  t.mock.method(db.adventures, 'put', async (row: AdventureProgress) => {
    assertTransaction()
    progress.set(row.sceneId, structuredClone(row))
    return row.sceneId
  })
  t.mock.method(db.profile, 'get', async () => {
    assertTransaction()
    await Promise.resolve()
    return structuredClone(profile)
  })
  t.mock.method(db.profile, 'put', async (row: Profile) => {
    assertTransaction()
    if (failNextProfileWrite) {
      failNextProfileWrite = false
      throw new Error('simulated storage failure')
    }
    profile = structuredClone(row)
    return row.id
  })
  t.mock.method(db.dailyLogs, 'get', async (date: string) => {
    assertTransaction()
    await Promise.resolve()
    return structuredClone(daily.get(date))
  })
  t.mock.method(db.dailyLogs, 'put', async (row: DailyLog) => {
    assertTransaction()
    daily.set(row.date, structuredClone(row))
    return row.date
  })
  t.mock.method(db.stats, 'put', () => { throw new Error('adventures must not change FSRS cards') })
  t.mock.method(db.reviewLogs, 'add', () => { throw new Error('adventures must not create vocabulary reviews') })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    const scope = args[1] as { name: string }[]
    assert.deepEqual(scope.map((table) => table.name).sort(), ['adventures', 'dailyLogs', 'profile'])
    const callback = args[args.length - 1] as () => Promise<unknown>
    const previous = pending
    let release!: () => void
    pending = new Promise<void>((resolve) => { release = resolve })
    await previous
    transactions++
    active = true
    const before = structuredClone({ progress, profile, daily })
    try {
      return await callback()
    } catch (error) {
      progress = before.progress
      profile = before.profile
      daily = before.daily
      throw error
    } finally {
      active = false
      release()
    }
  })
  return {
    progress: (id: string) => structuredClone(progress.get(id)),
    profile: () => structuredClone(profile),
    daily: () => structuredClone(daily.get(todayKey())),
    transactions: () => transactions,
    failNextWrite: () => { failNextProfileWrite = true },
  }
}

test('adventure: failed runs can improve, each newly correct question rewards once, and best scores survive retries', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  const failed = await finishAdventure(scene.id, answersFor(scene, [0]), 30000)
  assert.equal(failed.score, 1)
  assert.equal(failed.total, 3)
  assert.equal(failed.stars, 1)
  assert.equal(failed.xp, 3)
  assert.equal(failed.coins, 1)
  assert.equal(failed.progress.completedAt, undefined)

  const repeated = await finishAdventure(scene.id, answersFor(scene, [0]), 20000)
  assert.equal(repeated.newCorrect, 0)
  assert.equal(repeated.xp, 0)
  assert.equal(repeated.coins, 0)
  const passed = await finishAdventure(scene.id, answersFor(scene, [0, 1]).reverse(), 40000)
  assert.equal(passed.newCorrect, 1)
  assert.equal(passed.stars, 2)
  assert.ok(passed.progress.completedAt !== undefined)

  const lastQuestion = await finishAdventure(scene.id, answersFor(scene, [2]), 10000)
  assert.equal(lastQuestion.newCorrect, 1)
  assert.equal(lastQuestion.progress.bestScore, 2)
  assert.equal(lastQuestion.progress.completedAt, passed.progress.completedAt)
  const perfect = await finishAdventure(scene.id, answersFor(scene), 20000)
  assert.equal(perfect.newCorrect, 0)
  assert.equal(perfect.stars, 3)
  assert.equal(perfect.progress.bestScore, 3)
  assert.equal(perfect.progress.attempts, 5)
  assert.equal(perfect.progress.firstPlayedAt, failed.progress.firstPlayedAt)
  assert.equal(perfect.progress.correctQuestionIds.length, 3)
  assert.equal(fixture.profile().xp, 9)
  assert.equal(fixture.profile().coins, 3)
  assert.equal(fixture.profile().lastStudyDate, todayKey())
  const daily = fixture.daily()!
  assert.equal(daily.studySeconds, 120)
  assert.equal(daily.xp, 9)
  assert.equal(daily.coinsEarned, 3)
  assert.equal(daily.newLearned, 0)
  assert.equal(daily.reviewsDone, 0)
  assert.equal(daily.totalAnswered, 0)
  assert.equal(daily.correctCount, 0)
  assert.equal(daily.listeningSeconds, 0)
})

test('adventure: malformed or incomplete submissions never enter the write transaction', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  const valid = answersFor(scene)
  await assert.rejects(finishAdventure('unknown-scene', valid, 1000))
  await assert.rejects(finishAdventure(scene.id, valid.slice(0, 2), 1000))
  await assert.rejects(finishAdventure(scene.id, [valid[0], valid[0], valid[2]], 1000))
  await assert.rejects(finishAdventure(scene.id, [{ ...valid[0], questionId: 'foreign-question' }, ...valid.slice(1)], 1000))
  for (const optionIndex of [-1, 0.5, 999, Number.NaN]) {
    await assert.rejects(finishAdventure(scene.id, [{ ...valid[0], optionIndex }, ...valid.slice(1)], 1000))
  }
  await assert.rejects(finishAdventure(scene.id, valid, Number.NaN))
  await assert.rejects(finishAdventure(scene.id, valid, Number.POSITIVE_INFINITY))
  assert.equal(fixture.transactions(), 0)
  assert.equal(fixture.progress(scene.id), undefined)
  assert.equal(fixture.profile().xp, 0)
})

test('adventure: zero-star retries do not deduct rewards and recorded time is clamped to 0–600 seconds', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  const zero = await finishAdventure(scene.id, answersFor(scene, []), -1000)
  assert.equal(zero.score, 0)
  assert.equal(zero.stars, 0)
  assert.equal(zero.xp, 0)
  assert.equal(fixture.daily()?.studySeconds, 0)
  await finishAdventure(scene.id, answersFor(scene, []), 10000000)
  assert.equal(fixture.daily()?.studySeconds, 600)
  assert.equal(fixture.progress(scene.id)?.attempts, 2)
  assert.equal(fixture.profile().coins, 0)
})

test('adventure: overlapping duplicate finishes share reward receipts and award only nine XP', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  const results = await Promise.all([
    finishAdventure(scene.id, answersFor(scene), 20000),
    finishAdventure(scene.id, answersFor(scene), 20000),
  ])
  assert.deepEqual(results.map((result) => result.newCorrect), [3, 0])
  assert.equal(results.reduce((sum, result) => sum + result.xp, 0), 9)
  assert.equal(fixture.profile().xp, 9)
  assert.equal(fixture.profile().coins, 3)
  assert.equal(fixture.progress(scene.id)?.attempts, 2)
  assert.equal(fixture.daily()?.studySeconds, 40)
})

test('adventure: interleaved partial and perfect runs award only missing answers', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  const results = await Promise.all([
    finishAdventure(scene.id, answersFor(scene, [0]), 10000),
    finishAdventure(scene.id, answersFor(scene), 10000),
  ])
  assert.deepEqual(results.map((result) => result.newCorrect), [1, 2])
  assert.equal(fixture.profile().xp, 9)
  assert.equal(fixture.profile().coins, 3)
  assert.equal(fixture.progress(scene.id)?.bestScore, 3)
})

test('adventure: concurrent different scenes preserve both rewards in the shared account', async (t) => {
  const fixture = adventureFixture(t)
  await Promise.all(ADVENTURE_SCENES.slice(0, 2).map((scene) => finishAdventure(scene.id, answersFor(scene), 15000)))
  assert.equal(fixture.profile().xp, 18)
  assert.equal(fixture.profile().coins, 6)
  assert.equal(fixture.daily()?.xp, 18)
  assert.equal(fixture.daily()?.studySeconds, 30)
})

test('adventure: a failed reward write rolls progress back and a retry can earn the complete reward', async (t) => {
  const fixture = adventureFixture(t)
  const scene = ADVENTURE_SCENES[0]
  fixture.failNextWrite()
  await assert.rejects(finishAdventure(scene.id, answersFor(scene), 20000), /storage failure/)
  assert.equal(fixture.progress(scene.id), undefined)
  assert.equal(fixture.daily(), undefined)
  assert.equal(fixture.profile().xp, 0)
  const retried = await finishAdventure(scene.id, answersFor(scene), 20000)
  assert.equal(retried.newCorrect, 3)
  assert.equal(retried.progress.attempts, 1)
  assert.equal(fixture.profile().xp, 9)
})

test('adventure: restored correct-question receipts prevent re-awarding imported progress', async (t) => {
  const scene = ADVENTURE_SCENES[0]
  const fixture = adventureFixture(t, [{ sceneId: scene.id, bestScore: 1, attempts: 1,
    correctQuestionIds: [scene.questions[0].id], firstPlayedAt: 100, lastPlayedAt: 200 }])
  const result = await finishAdventure(scene.id, answersFor(scene), 20000)
  assert.equal(result.newCorrect, 2)
  assert.equal(result.xp, 6)
  assert.equal(result.coins, 2)
  assert.equal(result.progress.firstPlayedAt, 100)
  assert.equal(fixture.profile().xp, 6)
})
