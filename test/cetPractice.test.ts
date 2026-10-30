import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { CET_PRACTICES } from '../src/data/cetPractice.ts'
import { CET_PRACTICE_META } from '../src/data/cetPracticeIds.ts'
import { db, SCHEMA_VERSION } from '../src/db/database.ts'
import { completeCetOutput, countCetEnglishWords, isCetPracticeRecord, saveCetDraft, submitCetReading } from '../src/core/cetPractice.ts'
import type { CetPracticeRecord } from '../src/types/model.ts'

const readingId = 'cet4-reading-1'
const writingId = 'cet4-writing-1'
const translationId = 'cet6-translation-1'
const writingText = 'A helpful campus service should listen to students and explain its rules clearly before making changes to the daily schedule.'
const translationText = 'The new library offers students a quiet place to read after class.'

/** Yield on reads, serialize writers, and model rollback at the storage boundary. */
function cetFixture(t: TestContext) {
  let rows = new Map<string, CetPracticeRecord>()
  let active = false
  let pending: Promise<void> = Promise.resolve()
  let writes = 0
  let transactions = 0
  let failWrite = false
  t.mock.method(db.cetPractice, 'get', async (id: string) => {
    assert.equal(active, true, 'state reads must be inside the write transaction')
    await Promise.resolve()
    return structuredClone(rows.get(id))
  })
  t.mock.method(db.cetPractice, 'put', async (row: CetPracticeRecord) => {
    assert.equal(active, true, 'state writes must be inside the write transaction')
    rows.set(row.id, structuredClone(row))
    writes++
    if (failWrite) {
      failWrite = false
      throw new Error('simulated storage failure')
    }
    return row.id
  })
  for (const table of [db.profile, db.dailyLogs, db.stats, db.reviewLogs]) {
    for (const method of ['add', 'put', 'update', 'bulkPut'] as const) {
      t.mock.method(table, method, () => { throw new Error('CET practice must not change rewards or vocabulary statistics') })
    }
  }
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    assert.equal(args[0], 'rw')
    assert.deepEqual((args[1] as { name: string }[]).map((table) => table.name), ['cetPractice'])
    const callback = args[args.length - 1] as () => Promise<unknown>
    const previous = pending
    let release!: () => void
    pending = new Promise<void>((resolve) => { release = resolve })
    await previous
    transactions++
    active = true
    const before = structuredClone(rows)
    try {
      return await callback()
    } catch (error) {
      rows = before
      throw error
    } finally {
      active = false
      release()
    }
  })
  return {
    row: (id: string) => structuredClone(rows.get(id)),
    writes: () => writes,
    transactions: () => transactions,
    failNextWrite: () => { failWrite = true },
  }
}

test('CET: lightweight registry matches all twelve content tasks and schema seven', () => {
  assert.equal(SCHEMA_VERSION, 7)
  assert.equal(CET_PRACTICE_META.length, 12)
  assert.equal(new Set(CET_PRACTICE_META.map((task) => task.id)).size, 12)
  assert.deepEqual(CET_PRACTICE_META.map((task) => task.id).sort(), CET_PRACTICES.map((task) => task.id).sort())
  for (const meta of CET_PRACTICE_META) {
    const task = CET_PRACTICES.find((item) => item.id === meta.id)!
    assert.equal(meta.examType, task.examType)
    assert.equal(meta.kind, task.kind)
    if (task.kind === 'reading') assert.deepEqual(meta.optionCounts, task.questions.map((question) => question.options.length))
    else assert.equal(task.checklist.length, 3)
  }
})

test('CET: English word count handles full-width text, contractions and hyphenated words', () => {
  assert.equal(countCetEnglishWords("Ｗｅ can't accept a well-written answer 123 中文"), 6)
  assert.equal(countCetEnglishWords('中文 2026 ! ...'), 0)
  assert.equal(countCetEnglishWords('  first\nsecond\tthird ’fourth’ '), 4)
})

test('CET: concurrent reading submissions preserve first answers and record the latest correction without rewards', async (t) => {
  t.mock.method(Date, 'now', () => 1000)
  const fixture = cetFixture(t)
  const firstAnswers = [0, 1, 2]
  const firstSubmission = submitCetReading(readingId, firstAnswers)
  firstAnswers[0] = 3
  const [first, second] = await Promise.all([firstSubmission, submitCetReading(readingId, [3, 2, 1])])
  assert.equal(first.attempts, 1)
  assert.equal(second.attempts, 2)
  assert.equal(second.updatedAt, 1001)
  assert.equal(second.submittedAt, 1001)
  assert.equal(second.firstSubmittedAt, 1000)
  assert.equal(second.completedAt, 1000)
  assert.deepEqual(second.firstAnswers, [0, 1, 2])
  assert.deepEqual(second.latestAnswers, [3, 2, 1])
  assert.equal(second.draft, '')
  assert.equal(second.submittedText, undefined)
  assert.equal(isCetPracticeRecord(second), true)
  first.firstAnswers![0] = 2
  second.latestAnswers![0] = 0
  assert.deepEqual(fixture.row(readingId)?.firstAnswers, [0, 1, 2])
  assert.deepEqual(fixture.row(readingId)?.latestAnswers, [3, 2, 1])
  assert.equal(fixture.transactions(), 2)
})

test('CET: delayed drafts cannot replace newer drafts or completed submissions, and later edits preserve completion', async (t) => {
  t.mock.method(Date, 'now', () => 200)
  const fixture = cetFixture(t)
  await Promise.all([saveCetDraft(writingId, 'newer draft', 200), saveCetDraft(writingId, 'older draft', 100)])
  assert.equal(fixture.row(writingId)?.draft, 'newer draft')
  assert.equal(fixture.row(writingId)?.attempts, 0)
  const completed = await completeCetOutput(writingId, writingText, [true, true, true])
  assert.equal(completed.updatedAt, 201)
  assert.equal(completed.completedAt, 201)
  await saveCetDraft(writingId, 'delayed automatic save', 200)
  await saveCetDraft(writingId, 'same-time save', 201)
  assert.equal(fixture.row(writingId)?.draft, writingText)
  const nextDraft = await saveCetDraft(writingId, '', 202)
  assert.equal(nextDraft.draft, '')
  assert.equal(nextDraft.submittedText, writingText)
  assert.equal(nextDraft.attempts, 1)
  assert.equal(nextDraft.completedAt, 201)
  assert.equal(isCetPracticeRecord(nextDraft), true)
  const revised = await completeCetOutput(writingId, `${writingText} Students can then plan ahead.`, [true, true, true])
  assert.equal(revised.attempts, 2)
  assert.equal(revised.submittedAt, 203)
  assert.equal(revised.completedAt, 201)
  assert.equal(fixture.writes(), 4)
})

test('CET: incomplete, wrong-kind, sparse and invalid submissions fail before writing', async (t) => {
  const fixture = cetFixture(t)
  for (const answers of [[], [0, 1], [0, 1, 2, 3], [-1, 1, 2], [4, 1, 2], [0.5, 1, 2], [NaN, 1, 2], Array<number>(3)]) {
    await assert.rejects(submitCetReading(readingId, answers))
  }
  await assert.rejects(submitCetReading(writingId, [0, 1, 2]))
  await assert.rejects(submitCetReading('unknown', [0, 1, 2]))
  await assert.rejects(saveCetDraft(readingId, 'text'))
  await assert.rejects(saveCetDraft(writingId, 'text', NaN))
  await assert.rejects(completeCetOutput(readingId, writingText, [true, true, true]))
  await assert.rejects(completeCetOutput(writingId, 'word '.repeat(19), [true, true, true]))
  await assert.rejects(completeCetOutput(translationId, 'word '.repeat(9), [true, true, true]))
  for (const checks of [[], [true, true], [true, true, false], [true, true, true, true], Array<boolean>(3)]) {
    await assert.rejects(completeCetOutput(writingId, writingText, checks))
  }
  assert.equal(fixture.writes(), 0)
  assert.equal(fixture.transactions(), 0)
  const writing = await completeCetOutput(writingId, 'word '.repeat(20), [true, true, true])
  const translation = await completeCetOutput(translationId, 'word '.repeat(10), [true, true, true])
  assert.equal(isCetPracticeRecord(writing), true)
  assert.equal(isCetPracticeRecord(translation), true)
})

test('CET: failed writes roll back without losing the prior draft or adding an attempt', async (t) => {
  const fixture = cetFixture(t)
  await saveCetDraft(translationId, 'unfinished', 100)
  const before = fixture.row(translationId)
  fixture.failNextWrite()
  await assert.rejects(completeCetOutput(translationId, translationText, [true, true, true]), /storage failure/)
  assert.deepEqual(fixture.row(translationId), before)
  const checks = [true, true, true]
  const submission = completeCetOutput(translationId, translationText, checks)
  checks[0] = false
  const complete = await submission
  assert.equal(complete.attempts, 1)
  assert.deepEqual(complete.checks, [true, true, true])
  assert.equal(complete.kind, 'translation')
})
