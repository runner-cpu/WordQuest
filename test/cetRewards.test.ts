import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { db, SCHEMA_VERSION, todayKey } from '../src/db/database.ts'
import { defaultProfile } from '../src/core/profile.ts'
import { CET_READY_PAPERS } from '../src/core/cetReadyPapers.ts'
import { createCetPaperStudy, recordCetCorrectionEvidence, saveCetPaperStudy, submitCetPaperStudy, submitRewardedCetPaperStudy } from '../src/core/cetPapers.ts'
import { CET_REWARD_VALUES, cetRewardQuestionKey, isCetRewardProgress, mergeCetRewardProgress } from '../src/core/cetRewards.ts'
import type { CetPaperStudy } from '../src/types/cetPaper.ts'
import type { CetReadyPaper } from '../src/types/cetReadyPaper.ts'
import type { DailyLog, Profile } from '../src/types/model.ts'

const entry = CET_READY_PAPERS[0]
const bytes = await readFile(new URL(`../public/${entry.path}`, import.meta.url))
const paper = JSON.parse(bytes.toString()) as CetReadyPaper
const key = (number: number) => cetRewardQuestionKey(entry.sourceId, entry.revision, number)
const answers = (values: Record<number, string>) => Array.from({ length: 55 }, (_, index) => values[index + 1] ?? '')
const wrong = (number: number) => paper.answerKey[number - 1] === 'A' ? 'B' : 'A'

/** FIFO writes and rollback model the actual shared IndexedDB transaction boundary. */
function fixture(t: TestContext, initial: CetPaperStudy[] = []) {
  let papers = new Map(initial.map(row => [row.id, structuredClone(row)]))
  let profile = defaultProfile()
  let daily = new Map<string, DailyLog>()
  let active = false
  let pending: Promise<void> = Promise.resolve()
  let failure = ''
  let transactions = 0
  let beforeFetch: (() => void) | undefined
  const guard = () => assert.equal(active, true, 'reward writes must share a transaction')
  const fail = (table: string) => { if (failure === table) { failure = ''; throw new Error('simulated storage failure') } }
  t.mock.method(globalThis, 'fetch', async () => { beforeFetch?.(); beforeFetch = undefined; return new Response(bytes) })
  t.mock.method(db.cetPapers, 'get', async (id: string) => { await Promise.resolve(); return structuredClone(papers.get(id)) })
  t.mock.method(db.cetPapers, 'toArray', async () => { guard(); return [...papers.values()].map(row => structuredClone(row)) })
  const write = async (row: CetPaperStudy) => { papers.set(row.id, structuredClone(row)); fail('cetPapers'); return row.id }
  t.mock.method(db.cetPapers, 'add', write)
  t.mock.method(db.cetPapers, 'put', async (row: CetPaperStudy) => { guard(); return write(row) })
  t.mock.method(db.profile, 'get', async () => { guard(); await Promise.resolve(); return structuredClone(profile) })
  t.mock.method(db.profile, 'put', async (row: Profile) => { guard(); profile = structuredClone(row); fail('profile'); return row.id })
  t.mock.method(db.dailyLogs, 'get', async (date: string) => { guard(); return structuredClone(daily.get(date)) })
  t.mock.method(db.dailyLogs, 'put', async (row: DailyLog) => { guard(); daily.set(row.date, structuredClone(row)); fail('dailyLogs'); return row.date })
  t.mock.method(db.stats, 'put', () => { throw new Error('CET must not change vocabulary mastery') })
  t.mock.method(db.reviewLogs, 'add', () => { throw new Error('CET must not create vocabulary reviews') })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    assert.equal(args[0], 'rw')
    const names = (args[1] as { name: string }[]).map(table => table.name).sort()
    assert.ok(JSON.stringify(names) === JSON.stringify(['cetPapers']) || JSON.stringify(names) === JSON.stringify(['cetPapers', 'dailyLogs', 'profile']))
    const previous = pending
    let release!: () => void
    pending = new Promise<void>(resolve => { release = resolve })
    await previous
    active = true; transactions++
    const before = structuredClone({ papers, profile, daily })
    try { return await (args.at(-1) as () => Promise<unknown>)() }
    catch (error) { papers = before.papers; profile = before.profile; daily = before.daily; throw error }
    finally { active = false; release() }
  })
  return {
    paper: (id: string) => structuredClone(papers.get(id)!),
    setPaper: (row: CetPaperStudy) => { papers.set(row.id, structuredClone(row)) },
    profile: () => structuredClone(profile),
    daily: () => structuredClone(daily.get(todayKey())),
    fail: (table: string) => { failure = table },
    beforeFetch: (callback: () => void) => { beforeFetch = callback },
    transactions: () => transactions,
  }
}

async function start() { return createCetPaperStudy(entry.sourceId, 'built in', paper.answerKey, entry.revision) }
async function draft(id: string, values: Record<number, string>) { return saveCetPaperStudy(id, { answers: answers(values) }) }

test('CET rewards are per question and remain once only across scopes, new studies and concurrent submits', async t => {
  const f = fixture(t)
  const study = await start()
  await draft(study.id, { 1: paper.answerKey[0], 26: paper.answerKey[25] })
  const first = await submitRewardedCetPaperStudy(study.id, 'listening')
  assert.deepEqual(first.rewards.firstCorrect, { count: 1, ...CET_REWARD_VALUES.firstCorrect })
  const all = await submitRewardedCetPaperStudy(study.id)
  assert.equal(all.rewards.firstCorrect.count, 1)
  const other = await start()
  await draft(other.id, { 1: paper.answerKey[0], 2: paper.answerKey[1] })
  const concurrent = await Promise.all([submitRewardedCetPaperStudy(other.id), submitRewardedCetPaperStudy(other.id)])
  assert.equal(concurrent.reduce((n, result) => n + result.rewards.firstCorrect.count, 0), 1)
  assert.equal(f.profile().xp, 3 * CET_REWARD_VALUES.firstCorrect.xp)
  assert.equal(f.daily()?.xp, f.profile().xp)
  assert.equal(f.profile().coins, 3)
  assert.equal(Object.keys(f.profile().cetRewardProgress!).length, 3)
  assert.equal(f.profile().cetRewardProgress![key(1)].first, 'correct')
})

test('first wrong is durable, later partial answers can earn first-correct, and correction earns once globally', async t => {
  const f = fixture(t)
  const study = await start()
  await draft(study.id, { 1: wrong(1) })
  const first = await submitRewardedCetPaperStudy(study.id)
  assert.equal(first.rewards.xp, 0)
  assert.equal(f.profile().cetRewardProgress![key(1)].first, 'wrong')
  const other = await start()
  await draft(other.id, { 1: paper.answerKey[0], 2: paper.answerKey[1] })
  const corrected = await submitRewardedCetPaperStudy(other.id)
  assert.equal(corrected.rewards.firstCorrect.count, 1)
  assert.equal(corrected.rewards.correction.count, 1)
  assert.equal(corrected.rewards.evidence.count, 0)
  await draft(study.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(study.id)
  await draft(study.id, { 1: paper.answerKey[0] })
  const again = await submitRewardedCetPaperStudy(study.id)
  assert.equal(again.rewards.xp, 0)
})

test('global question submission times stay monotonic across fresh studies even within the same clock tick', async t => {
  const f = fixture(t)
  t.mock.method(Date, 'now', () => 1000)
  const first = await start()
  await draft(first.id, { 1: wrong(1) }); const wrongAttempt = await submitRewardedCetPaperStudy(first.id)
  const second = await start()
  await draft(second.id, { 1: wrong(1) }); const laterWrong = await submitRewardedCetPaperStudy(second.id)
  assert.ok(laterWrong.study.updatedAt > wrongAttempt.study.updatedAt)
  await recordCetCorrectionEvidence(second.id, 1, 'Current globally latest correction evidence')
  await draft(second.id, { 1: paper.answerKey[0] })
  const corrected = await submitRewardedCetPaperStudy(second.id)
  assert.equal(corrected.rewards.evidence.count, 1)
  assert.equal(f.profile().cetRewardProgress![key(1)].lastSubmittedAt, corrected.study.updatedAt)
})

test('only newly recorded evidence for the preceding wrong question earns an evidence bonus', async t => {
  fixture(t)
  const study = await start()
  await saveCetPaperStudy(study.id, { answers: answers({ 1: wrong(1), 2: wrong(2) }), notes: 'Old public note is not evidence' })
  await submitRewardedCetPaperStudy(study.id)
  const evidence = await recordCetCorrectionEvidence(study.id, 1, 'Question 1: the speaker says this explicitly.')
  assert.ok(evidence.correctionEvidence?.['1'].recordedAt)
  await draft(study.id, { 1: paper.answerKey[0], 2: paper.answerKey[1] })
  const corrected = await submitRewardedCetPaperStudy(study.id)
  assert.equal(corrected.rewards.correction.count, 2)
  assert.equal(corrected.rewards.evidence.count, 1)
  assert.equal(corrected.rewards.xp, 2 * CET_REWARD_VALUES.correction.xp + CET_REWARD_VALUES.evidence.xp)
  assert.equal((await submitRewardedCetPaperStudy(study.id)).rewards.xp, 0)
})

test('evidence must follow the latest same-question wrong submission and uses optimistic text conflicts', async t => {
  fixture(t)
  const study = await start()
  await assert.rejects(recordCetCorrectionEvidence(study.id, 1, 'too early'))
  await draft(study.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(study.id)
  await recordCetCorrectionEvidence(study.id, 1, 'old evidence')
  await assert.rejects(recordCetCorrectionEvidence(study.id, 1, 'other tab', 'stale text'))
  await submitRewardedCetPaperStudy(study.id)
  await draft(study.id, { 1: paper.answerKey[0] })
  assert.equal((await submitRewardedCetPaperStudy(study.id)).rewards.evidence.count, 0)
})

test('a later genuine correction can earn the still-unpaid evidence kind without repeating correction XP', async t => {
  fixture(t)
  const study = await start()
  await draft(study.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(study.id)
  await draft(study.id, { 1: paper.answerKey[0] }); await submitRewardedCetPaperStudy(study.id)
  await draft(study.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(study.id)
  await recordCetCorrectionEvidence(study.id, 1, 'A new explanation from this correction round.')
  await draft(study.id, { 1: paper.answerKey[0] })
  const result = await submitRewardedCetPaperStudy(study.id)
  assert.equal(result.rewards.correction.count, 0)
  assert.equal(result.rewards.evidence.count, 1)
})

test('another study cannot reuse evidence from an older globally superseded wrong submission', async t => {
  fixture(t)
  const study = await start()
  await draft(study.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(study.id)
  await recordCetCorrectionEvidence(study.id, 1, 'Evidence for the first local wrong attempt')
  const other = await start()
  await draft(other.id, { 1: wrong(1) }); await submitRewardedCetPaperStudy(other.id)
  await draft(study.id, { 1: paper.answerKey[0] })
  const result = await submitRewardedCetPaperStudy(study.id)
  assert.equal(result.rewards.correction.count, 1)
  assert.equal(result.rewards.evidence.count, 0)
})

test('legacy histories seed no-backfill baselines across different studies without disabling new questions', async t => {
  const f = fixture(t)
  const old = await start()
  await draft(old.id, { 1: paper.answerKey[0], 2: wrong(2), 3: wrong(3) }); await submitCetPaperStudy(old.id)
  await draft(old.id, { 1: paper.answerKey[0], 2: paper.answerKey[1], 3: wrong(3) }); await submitCetPaperStudy(old.id)
  const fresh = await start()
  await draft(fresh.id, { 1: paper.answerKey[0], 2: paper.answerKey[1], 3: paper.answerKey[2], 4: paper.answerKey[3] })
  const result = await submitRewardedCetPaperStudy(fresh.id)
  assert.equal(result.rewards.firstCorrect.count, 1)
  assert.equal(result.rewards.correction.count, 1)
  assert.equal(f.profile().cetRewardProgress![key(1)].paid.firstCorrect, 0)
  assert.equal(f.profile().cetRewardProgress![key(2)].paid.correction, 0)
})

test('rewards reject custom keys, revision mismatch, invalid data and transaction-time key replacement', async t => {
  const f = fixture(t)
  const custom = await createCetPaperStudy(entry.sourceId, 'custom', paper.answerKey)
  await draft(custom.id, { 1: paper.answerKey[0] })
  await assert.rejects(submitRewardedCetPaperStudy(custom.id))
  const study = await start()
  await draft(study.id, { 1: paper.answerKey[0] })
  const wrongKey = [...paper.answerKey]; wrongKey[0] = wrong(1)
  await saveCetPaperStudy(study.id, { answerKey: wrongKey })
  await assert.rejects(submitRewardedCetPaperStudy(study.id))
  await saveCetPaperStudy(study.id, { answerKey: paper.answerKey })
  f.beforeFetch(() => f.setPaper({ ...f.paper(study.id), answerKey: wrongKey }))
  await assert.rejects(submitRewardedCetPaperStudy(study.id))
  await saveCetPaperStudy(study.id, { answerKey: paper.answerKey })
  f.beforeFetch(() => f.setPaper({ ...f.paper(study.id), paperRevision: '0000000000000000' }))
  await assert.rejects(submitRewardedCetPaperStudy(study.id))
  assert.equal(f.profile().xp, 0)
  assert.equal(f.profile().cetRewardProgress, undefined)
})

test('each reward storage failure rolls back snapshots, receipts, balances and daily totals', async t => {
  const f = fixture(t)
  const study = await start()
  await draft(study.id, { 1: paper.answerKey[0] })
  const before = f.paper(study.id)
  for (const table of ['cetPapers', 'profile', 'dailyLogs']) {
    f.fail(table)
    await assert.rejects(submitRewardedCetPaperStudy(study.id), /simulated/)
    assert.deepEqual(f.paper(study.id), before)
    assert.equal(f.profile().xp, 0)
    assert.equal(f.profile().cetRewardProgress, undefined)
    assert.equal(f.daily(), undefined)
  }
  assert.equal((await submitRewardedCetPaperStudy(study.id)).rewards.firstCorrect.count, 1)
})

test('reward progress validation and merge keep first-state and paid receipt unions', () => {
  assert.equal(SCHEMA_VERSION, 12)
  const first = { sourceId: entry.sourceId, paperRevision: entry.revision, number: 1, first: 'wrong' as const, firstSubmittedAt: 10,
    last: 'wrong' as const, lastSubmittedAt: 10, paid: {} }
  const later = { ...first, firstSubmittedAt: 20, last: 'correct' as const, lastSubmittedAt: 30, paid: { correction: 30 } }
  const merged = mergeCetRewardProgress({ [key(1)]: first }, { [key(1)]: later })
  assert.equal(merged[key(1)].firstSubmittedAt, 10)
  assert.equal(merged[key(1)].last, 'correct')
  assert.equal(merged[key(1)].paid.correction, 30)
  assert.equal(isCetRewardProgress(merged), true)
  assert.equal(isCetRewardProgress({ [key(1)]: { ...first, paid: { evidence: -1 } } }), false)
  assert.equal(isCetRewardProgress({ mismatch: first }), false)
  for (const reward of Object.values(CET_REWARD_VALUES)) assert.ok(reward.xp >= 0 && reward.coins >= 0)
})
