import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURE_EXPRESSIONS } from '../src/data/adventureExpressions.ts'
import { db, todayKey } from '../src/db/database.ts'
import { finishExpressionAttempt, matchExpressionAnswer, normalizeExpressionAnswer } from '../src/core/expression.ts'
import { defaultProfile } from '../src/core/profile.ts'
import type { DailyLog, ExpressionProgress, Profile } from '../src/types/model.ts'

const first = ADVENTURE_EXPRESSIONS[0]

/** Serialize real core calls and model rollback while yielding on all reward reads. */
function expressionFixture(t: TestContext, initial: ExpressionProgress[] = []) {
  let progress = new Map(initial.map((row) => [row.id, structuredClone(row)]))
  let profile = defaultProfile()
  let daily = new Map<string, DailyLog>()
  let active = false
  let pending: Promise<void> = Promise.resolve()
  let transactions = 0
  let failNextProfileWrite = false
  const assertTransaction = () => assert.equal(active, true, 'all progress, reward and streak operations must share a transaction')

  t.mock.method(db.expressions, 'get', async (id: string) => {
    assertTransaction()
    await Promise.resolve()
    return structuredClone(progress.get(id))
  })
  t.mock.method(db.expressions, 'put', async (row: ExpressionProgress) => {
    assertTransaction()
    progress.set(row.id, structuredClone(row))
    return row.id
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
  t.mock.method(db.stats, 'put', () => { throw new Error('expressions must not change FSRS cards') })
  t.mock.method(db.reviewLogs, 'add', () => { throw new Error('expressions must not create vocabulary reviews') })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    const scope = args[1] as { name: string }[]
    assert.deepEqual(scope.map((table) => table.name).sort(), ['dailyLogs', 'expressions', 'profile'])
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
    progress: (id = first.id) => structuredClone(progress.get(id)),
    profile: () => structuredClone(profile),
    daily: (date = todayKey()) => structuredClone(daily.get(date)),
    transactions: () => transactions,
    failNextWrite: () => { failNextProfileWrite = true },
  }
}

function dateAfter(now: number, days: number): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()
}

function progressAt(now: number, patch: Partial<ExpressionProgress> = {}): ExpressionProgress {
  return {
    id: first.id, sceneId: first.sceneId, attempts: 1,
    firstPracticedAt: now - 86400000, lastPracticedAt: now - 86400000,
    dueAt: now - 1, stage: 2,
    lastScheduledDate: todayKey(new Date(now - 86400000)),
    independentDays: [], rewardedDates: [], lastOutcome: 'independent', ...patch,
  }
}

test('expression: normalization tolerates typography and exact matching rejects substrings or extra content', () => {
  assert.equal(normalizeExpressionAnswer('  ＲＥＳＥＲＶＥ。！？  '), 'reserve')
  assert.equal(normalizeExpressionAnswer('  I’D   like\nTO ’BOOK! '), "i'd like to 'book")
  assert.equal(matchExpressionAnswer('  Ｒｅｓｅｒｖｅ！ ', first.acceptedAnswers), true)
  assert.equal(matchExpressionAnswer('BOOK.', first.acceptedAnswers), true)
  assert.equal(matchExpressionAnswer('reserve a room', first.acceptedAnswers), false)
  assert.equal(matchExpressionAnswer('I reserve', first.acceptedAnswers), false)
  assert.equal(matchExpressionAnswer('reser', first.acceptedAnswers), false)
  assert.equal(matchExpressionAnswer('... ', first.acceptedAnswers), false)
})

test('expression: first independent success schedules tomorrow, rewards once and leaves vocabulary counters alone', async (t) => {
  const fixture = expressionFixture(t)
  const result = await finishExpressionAttempt(first.id, 'Reserve!', false, 12500)
  const today = todayKey(new Date(result.progress.lastPracticedAt))
  assert.equal(result.correct, true)
  assert.equal(result.independent, true)
  assert.equal(result.scheduled, true)
  assert.equal(result.xp, 3)
  assert.equal(result.coins, 1)
  assert.equal(result.progress.stage, 1)
  assert.equal(result.progress.dueAt, dateAfter(result.progress.lastPracticedAt, 1))
  assert.equal(result.progress.lastScheduledDate, today)
  assert.deepEqual(result.progress.independentDays, [today])
  assert.deepEqual(result.progress.rewardedDates, [today])
  assert.equal(result.progress.lastOutcome, 'independent')
  assert.equal(fixture.profile().xp, 3)
  assert.equal(fixture.profile().coins, 1)
  assert.equal(fixture.profile().lastStudyDate, todayKey())
  const daily = fixture.daily(today)!
  assert.equal(daily.studySeconds, 13)
  assert.equal(daily.xp, 3)
  assert.equal(daily.coinsEarned, 1)
  for (const counter of ['newLearned', 'reviewsDone', 'totalAnswered', 'correctCount', 'listeningSeconds', 'listeningSentences'] as const) {
    assert.equal(daily[counter], 0, `${counter} is unrelated to expression practice`)
  }
})

test('expression: due independent successes use 1/3/7/14/30 calendar days and cap at stage five', async (t) => {
  let now = new Date(2026, 9, 30, 23, 58, 30).getTime()
  t.mock.method(Date, 'now', () => now)
  const fixture = expressionFixture(t)
  const practiceDates: string[] = []
  for (const [index, days] of [1, 3, 7, 14, 30, 30].entries()) {
    practiceDates.push(todayKey(new Date(now)))
    const result = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 1000)
    assert.equal(result.scheduled, true)
    assert.equal(result.progress.stage, Math.min(index + 1, 5))
    assert.equal(result.progress.dueAt, dateAfter(now, days))
    assert.equal(new Date(result.progress.dueAt).getHours(), 0)
    assert.equal(result.xp, 3)
    now = result.progress.dueAt + 15 * 3600000
  }
  assert.equal(fixture.progress()?.attempts, 6)
  assert.deepEqual(fixture.progress()?.independentDays, practiceDates)
  assert.deepEqual(fixture.progress()?.rewardedDates, practiceDates)
  assert.equal(fixture.profile().xp, 18)
  assert.equal(fixture.profile().coins, 6)
})

test('expression: early and same-day replays retain scheduling and do not add reward or retention days', async (t) => {
  let now = new Date(2026, 9, 30, 11).getTime()
  t.mock.method(Date, 'now', () => now)
  const previous = progressAt(now, { dueAt: dateAfter(now, 3), stage: 2,
    lastScheduledDate: '2026-10-29', independentDays: ['2026-10-29'], rewardedDates: ['2026-10-29'] })
  const fixture = expressionFixture(t, [previous])
  const early = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 15000)
  assert.equal(early.correct, true)
  assert.equal(early.independent, true)
  assert.equal(early.scheduled, false)
  assert.equal(early.xp, 0)
  assert.equal(early.progress.stage, 2)
  assert.equal(early.progress.dueAt, previous.dueAt)
  assert.equal(early.progress.lastScheduledDate, previous.lastScheduledDate)
  assert.deepEqual(early.progress.independentDays, previous.independentDays)
  assert.deepEqual(early.progress.rewardedDates, previous.rewardedDates)
  const wrongEarly = await finishExpressionAttempt(first.id, 'unrelated', false, 1000)
  assert.equal(wrongEarly.progress.stage, 2)
  assert.equal(wrongEarly.progress.dueAt, previous.dueAt)

  now = previous.dueAt + 3600000
  const due = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 1000)
  assert.equal(due.scheduled, true)
  const repeat = await finishExpressionAttempt(first.id, '', true, 2000)
  assert.equal(repeat.scheduled, false)
  assert.equal(repeat.xp, 0)
  assert.equal(repeat.progress.stage, due.progress.stage)
  assert.equal(repeat.progress.dueAt, due.progress.dueAt)
  assert.equal(repeat.progress.lastScheduledDate, due.progress.lastScheduledDate)
  assert.deepEqual(repeat.progress.independentDays, due.progress.independentDays)
  assert.deepEqual(repeat.progress.rewardedDates, due.progress.rewardedDates)
  assert.equal(repeat.progress.attempts, 5)
  assert.equal(repeat.progress.firstPracticedAt, previous.firstPracticedAt)
  assert.equal(fixture.profile().xp, 3)
})

test('expression: eligible hinted correct and wrong answers reset to stage zero without rewards', async (t) => {
  const now = new Date(2026, 9, 30, 16).getTime()
  t.mock.method(Date, 'now', () => now)
  const second = ADVENTURE_EXPRESSIONS[1]
  const fixture = expressionFixture(t, [progressAt(now, { stage: 4 }),
    progressAt(now, { id: second.id, sceneId: second.sceneId, stage: 5 })])
  const assisted = await finishExpressionAttempt(first.id, first.referenceAnswer, true, 5000)
  const wrong = await finishExpressionAttempt(second.id, 'unrelated', false, 4000)
  for (const result of [assisted, wrong]) {
    assert.equal(result.scheduled, true)
    assert.equal(result.independent, false)
    assert.equal(result.progress.stage, 0)
    assert.equal(result.progress.dueAt, dateAfter(now, 1))
    assert.equal(result.progress.lastScheduledDate, todayKey(new Date(now)))
    assert.deepEqual(result.progress.independentDays, [])
    assert.deepEqual(result.progress.rewardedDates, [])
    assert.equal(result.xp, 0)
    assert.equal(result.coins, 0)
  }
  assert.equal(assisted.correct, true)
  assert.equal(assisted.progress.lastOutcome, 'assisted')
  assert.equal(wrong.correct, false)
  assert.equal(wrong.progress.lastOutcome, 'retry')
  assert.equal(fixture.profile().xp, 0)
})

test('expression: viewing reference with an empty answer records a retry and clamps real elapsed time', async (t) => {
  const fixture = expressionFixture(t)
  const result = await finishExpressionAttempt(first.id, '  ', true, -5000)
  assert.equal(result.correct, false)
  assert.equal(result.independent, false)
  assert.equal(result.scheduled, true)
  assert.equal(result.progress.lastOutcome, 'retry')
  assert.equal(result.progress.stage, 0)
  assert.equal(result.progress.dueAt, dateAfter(result.progress.lastPracticedAt, 1))
  assert.equal(fixture.daily()?.studySeconds, 0)
  const correctReplay = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 9999999)
  assert.equal(correctReplay.scheduled, false)
  assert.equal(correctReplay.xp, 0)
  assert.equal(correctReplay.progress.stage, 0)
  assert.equal(fixture.daily()?.studySeconds, 300)
  assert.equal(fixture.profile().xp, 0)
})

test('expression: invalid submissions never enter a write transaction', async (t) => {
  const fixture = expressionFixture(t)
  await assert.rejects(finishExpressionAttempt('unknown', 'reserve', false, 1000))
  await assert.rejects(finishExpressionAttempt(first.id, '', false, 1000))
  await assert.rejects(finishExpressionAttempt(first.id, '... ', false, 1000))
  await assert.rejects(finishExpressionAttempt(first.id, 'x'.repeat(161), false, 1000))
  await assert.rejects(finishExpressionAttempt(first.id, undefined as unknown as string, false, 1000))
  await assert.rejects(finishExpressionAttempt(first.id, 'reserve', 'yes' as unknown as boolean, 1000))
  for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    await assert.rejects(finishExpressionAttempt(first.id, 'reserve', false, elapsed))
  }
  assert.equal(fixture.transactions(), 0)
  assert.equal(fixture.progress(), undefined)
  assert.equal(fixture.profile().xp, 0)
})

test('expression: concurrent duplicate answers share receipts and concurrent different expressions preserve shared rewards', async (t) => {
  const fixture = expressionFixture(t)
  const duplicate = await Promise.all([
    finishExpressionAttempt(first.id, first.referenceAnswer, false, 10000),
    finishExpressionAttempt(first.id, first.referenceAnswer, false, 10000),
  ])
  assert.deepEqual(duplicate.map((result) => result.scheduled), [true, false])
  assert.deepEqual(duplicate.map((result) => result.xp), [3, 0])
  assert.equal(fixture.progress()?.attempts, 2)
  await Promise.all(ADVENTURE_EXPRESSIONS.slice(1, 3).map((row) =>
    finishExpressionAttempt(row.id, row.referenceAnswer, false, 15000)))
  assert.equal(fixture.profile().xp, 9)
  assert.equal(fixture.profile().coins, 3)
  assert.equal(fixture.daily()?.xp, 9)
  assert.equal(fixture.daily()?.studySeconds, 50)
})

test('expression: failed reward persistence rolls all state back and a retry earns the complete reward', async (t) => {
  const fixture = expressionFixture(t)
  fixture.failNextWrite()
  await assert.rejects(finishExpressionAttempt(first.id, first.referenceAnswer, false, 15000), /storage failure/)
  assert.equal(fixture.progress(), undefined)
  assert.equal(fixture.daily(), undefined)
  assert.equal(fixture.profile().xp, 0)
  const result = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 15000)
  assert.equal(result.progress.attempts, 1)
  assert.equal(result.xp, 3)
  assert.equal(fixture.profile().xp, 3)
  assert.equal(fixture.daily()?.studySeconds, 15)
})

test('expression: imported reward receipts block re-awarding even when their schedule is due', async (t) => {
  const now = new Date(2026, 9, 30, 12).getTime()
  t.mock.method(Date, 'now', () => now)
  const today = todayKey(new Date(now))
  const previous = progressAt(now, { rewardedDates: [today], independentDays: [today] })
  const fixture = expressionFixture(t, [previous])
  const result = await finishExpressionAttempt(first.id, first.referenceAnswer, false, 1000)
  assert.equal(result.scheduled, true)
  assert.equal(result.independent, true)
  assert.equal(result.xp, 0)
  assert.equal(result.coins, 0)
  assert.equal(result.progress.stage, 3)
  assert.deepEqual(result.progress.independentDays, [today])
  assert.deepEqual(result.progress.rewardedDates, [today])
  assert.equal(fixture.profile().xp, 0)
})
