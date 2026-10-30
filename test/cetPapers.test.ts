import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { CET_PAPER_SOURCES } from '../src/data/cetPaperSources.ts'
import { db, SCHEMA_VERSION } from '../src/db/database.ts'
import {
  attachCetPaperFile,
  cetPaperResult,
  createCetPaperStudy,
  isCetPaperStudy,
  parseCetAnswerKey,
  saveCetPaperStudy,
  submitCetPaperStudy,
} from '../src/core/cetPapers.ts'
import type { CetPaperStudy } from '../src/types/cetPaper.ts'

const sourceId = CET_PAPER_SOURCES[0].id
const emptyAnswers = () => Array<string>(55).fill('')
const pdf = (name = 'paper.pdf') => new File(['%PDF-1.7\nexample'], name, { type: 'application/pdf' })
const audio = (name = 'listening.mp3') => new File([new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])], name, { type: 'audio/mpeg' })

/** The storage boundary serializes writers and rolls back both metadata and blobs. */
function paperFixture(t: TestContext) {
  let papers = new Map<string, CetPaperStudy>()
  let media = new Map<string, { id: string; blob: Blob }>()
  let pending: Promise<void> = Promise.resolve()
  let active = false
  let failWrite = false
  let writes = 0
  const guard = () => assert.equal(active, true, 'paper state reads and writes must share a transaction')
  t.mock.method(db.cetPapers, 'get', async (id: string) => {
    guard()
    await Promise.resolve()
    return structuredClone(papers.get(id))
  })
  const writePaper = async (row: CetPaperStudy) => {
    papers.set(row.id, structuredClone(row))
    writes++
    if (failWrite) {
      failWrite = false
      throw new Error('simulated paper storage failure')
    }
    return row.id
  }
  t.mock.method(db.cetPapers, 'put', async (row: CetPaperStudy) => { guard(); return writePaper(row) })
  t.mock.method(db.cetPapers, 'add', writePaper)
  t.mock.method(db.media, 'get', async (id: string) => {
    guard()
    return structuredClone(media.get(id))
  })
  const putMedia = async (row: { id: string; blob: Blob }) => {
    guard()
    media.set(row.id, structuredClone(row))
    return row.id
  }
  t.mock.method(db.media, 'put', putMedia)
  t.mock.method(db.media, 'add', putMedia)
  t.mock.method(db.media, 'delete', async (id: string) => { guard(); media.delete(id) })
  for (const table of [db.profile, db.dailyLogs, db.stats, db.reviewLogs]) {
    for (const method of ['add', 'put', 'update', 'bulkPut'] as const) {
      t.mock.method(table, method, () => { throw new Error('paper study must not award XP or change FSRS') })
    }
  }
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    assert.equal(args[0], 'rw')
    const names = (args[1] as { name: string }[]).map((table) => table.name)
    assert.ok(names.includes('cetPapers'))
    assert.ok(names.every((name) => ['cetPapers', 'media'].includes(name)))
    const previous = pending
    let release!: () => void
    pending = new Promise<void>((resolve) => { release = resolve })
    await previous
    active = true
    const beforePapers = structuredClone(papers)
    const beforeMedia = structuredClone(media)
    try {
      return await (args[args.length - 1] as () => Promise<unknown>)()
    } catch (error) {
      papers = beforePapers
      media = beforeMedia
      throw error
    } finally {
      active = false
      release()
    }
  })
  return {
    paper: (id: string) => structuredClone(papers.get(id)),
    blobs: () => structuredClone([...media.values()]),
    writes: () => writes,
    failNextWrite: () => { failWrite = true },
  }
}

test('CET papers: create an independent local answer card with 55 empty answers', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  const fixture = paperFixture(t)
  assert.equal(SCHEMA_VERSION, 7)
  const first = await createCetPaperStudy(sourceId, '第一套')
  const second = await createCetPaperStudy(sourceId, '第二套')
  assert.notEqual(first.id, second.id)
  assert.equal(first.sourceId, sourceId)
  assert.equal(first.variant, '第一套')
  assert.equal(first.createdAt, 100)
  assert.equal(first.updatedAt, 100)
  assert.deepEqual(first.answers, emptyAnswers())
  assert.deepEqual(first.answerKey, emptyAnswers())
  assert.deepEqual(first.files, {})
  assert.equal(first.firstSubmission, undefined)
  assert.equal(first.latestSubmission, undefined)
  assert.equal(isCetPaperStudy(first), true)
  first.answers[0] = 'D'
  assert.equal(fixture.paper(first.id)?.answers[0], '')
  await assert.rejects(createCetPaperStudy('unknown-source'))
  assert.equal(fixture.writes(), 2)
})

test('CET papers: delayed saves preserve newer drafts and submission history', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  const fixture = paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  await Promise.all([
    saveCetPaperStudy(study.id, { writingDraft: 'new writing', translationDraft: 'new translation', notes: 'review note', elapsedSeconds: 90 }, 300),
    saveCetPaperStudy(study.id, { writingDraft: 'old delayed writing' }, 200),
  ])
  assert.equal(fixture.paper(study.id)?.writingDraft, 'new writing')
  assert.equal(fixture.paper(study.id)?.translationDraft, 'new translation')
  assert.equal(fixture.paper(study.id)?.notes, 'review note')
  assert.equal(fixture.paper(study.id)?.elapsedSeconds, 90)
  await saveCetPaperStudy(study.id, { writingDraft: 'same-time late save' }, 300)
  assert.equal(fixture.paper(study.id)?.writingDraft, 'new writing')
  await saveCetPaperStudy(study.id, { writingDraft: '' }, 301)
  assert.equal(fixture.paper(study.id)?.writingDraft, '')
})

test('CET papers: first submission remains an independent snapshot after correction', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  const fixture = paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  const answers = emptyAnswers()
  const key = emptyAnswers()
  answers[0] = 'A'
  answers[1] = 'C'
  key[0] = 'A'
  key[1] = 'B'
  key[2] = 'D'
  await saveCetPaperStudy(study.id, { answers, answerKey: key }, 200)
  const first = await submitCetPaperStudy(study.id)
  assert.deepEqual(cetPaperResult(first.firstSubmission), { correct: 1, compared: 2, unanswered: 53, wrong: [2] })
  assert.equal(first.firstSubmission?.submittedAt, first.latestSubmission?.submittedAt)
  answers[1] = 'B'
  answers[2] = 'D'
  await saveCetPaperStudy(study.id, { answers }, 300)
  const revised = await submitCetPaperStudy(study.id)
  assert.deepEqual(revised.firstSubmission?.answers.slice(0, 3), ['A', 'C', ''])
  assert.deepEqual(revised.latestSubmission?.answers.slice(0, 3), ['A', 'B', 'D'])
  assert.deepEqual(cetPaperResult(revised.latestSubmission), { correct: 3, compared: 3, unanswered: 52, wrong: [] })
  assert.ok(revised.latestSubmission!.submittedAt > revised.firstSubmission!.submittedAt)
  revised.firstSubmission!.answers[0] = 'D'
  revised.latestSubmission!.answerKey[0] = 'C'
  assert.equal(fixture.paper(study.id)?.firstSubmission?.answers[0], 'A')
  assert.equal(fixture.paper(study.id)?.latestSubmission?.answerKey[0], 'A')
  await saveCetPaperStudy(study.id, { notes: 'delayed before submission' }, 300)
  assert.equal(fixture.paper(study.id)?.notes, '')
})

test('CET papers: incomplete and invalid data cannot submit or mutate the stored card', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  const fixture = paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  await assert.rejects(submitCetPaperStudy(study.id))
  const answers = emptyAnswers()
  answers[0] = 'A'
  await saveCetPaperStudy(study.id, { answers }, 200)
  await assert.rejects(submitCetPaperStudy(study.id), 'an answer without its corresponding key cannot submit')
  const answerKey = emptyAnswers()
  answerKey[1] = 'B'
  await saveCetPaperStudy(study.id, { answerKey }, 201)
  await assert.rejects(submitCetPaperStudy(study.id), 'disjoint answered and keyed questions cannot submit')
  const before = fixture.paper(study.id)
  for (const invalid of [[], emptyAnswers().slice(1), [...emptyAnswers(), 'A'], Array<string>(55),
    emptyAnswers().map((answer, index) => index === 0 ? 'E' : answer),
    emptyAnswers().map((answer, index) => index === 25 ? 'P' : answer),
    emptyAnswers().map((answer, index) => index === 45 ? 'E' : answer)]) {
    await assert.rejects(saveCetPaperStudy(study.id, { answers: invalid }, 300))
    await assert.rejects(saveCetPaperStudy(study.id, { answerKey: invalid }, 300))
  }
  for (const editedAt of [-1, NaN, Infinity, 1.5]) {
    await assert.rejects(saveCetPaperStudy(study.id, { notes: 'bad time' }, editedAt))
  }
  for (const elapsedSeconds of [-1, NaN, Infinity, 1.5]) {
    await assert.rejects(saveCetPaperStudy(study.id, { elapsedSeconds }, 300))
  }
  await assert.rejects(saveCetPaperStudy(study.id, { notes: 123 } as unknown as { notes: string }, 300))
  await assert.rejects(saveCetPaperStudy('missing-study', { notes: 'missing' }, 300))
  assert.deepEqual(fixture.paper(study.id), before)
  assert.deepEqual(cetPaperResult(), { correct: 0, compared: 0, unanswered: 55, wrong: [] })
})

test('CET papers: equal submission times require identical first and latest answers and keys', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  const answers = emptyAnswers()
  answers[0] = 'A'
  await saveCetPaperStudy(study.id, { answers, answerKey: answers }, 200)
  const submitted = await submitCetPaperStudy(study.id)
  assert.equal(isCetPaperStudy(submitted), true)
  for (const field of ['answers', 'answerKey'] as const) {
    const contradictory = structuredClone(submitted)
    contradictory.latestSubmission![field][0] = 'B'
    assert.equal(isCetPaperStudy(contradictory), false, `same-time ${field} cannot disagree`)
  }
})

test('CET papers: import numbered answer keys with section-specific ranges and report bad entries', () => {
  const parsed = parseCetAnswerKey('1 A\n25 D\n26 O\n35 N\n36 Z\n45 Y\n46 B\n55 C')
  assert.equal(parsed.answers.length, 55)
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual([0, 24, 25, 34, 35, 44, 45, 54].map((index) => parsed.answers[index]), ['A', 'D', 'O', 'N', 'Z', 'Y', 'B', 'C'])
  for (const text of ['1 E', '26 P', '46 E', '56 A', '1 A\n1 B']) {
    assert.ok(parseCetAnswerKey(text).errors.length > 0, text)
  }
  const partial = parseCetAnswerKey('A B C D')
  assert.deepEqual(partial.errors, [])
  assert.deepEqual(partial.answers.slice(0, 5), ['A', 'B', 'C', 'D', ''])
  assert.equal(partial.answers.length, 55)
})

test('CET papers: attach local PDFs and recordings, replacing the blob atomically', async (t) => {
  t.mock.method(Date, 'now', () => 100)
  const fixture = paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  const withPaper = await attachCetPaperFile(study.id, 'paper', pdf())
  const originalId = withPaper.files.paper!.id
  assert.ok(originalId.startsWith('cet-paper'))
  assert.equal(withPaper.files.paper!.name, 'paper.pdf')
  assert.equal(withPaper.files.paper!.type, 'application/pdf')
  assert.equal(withPaper.files.paper!.size, pdf().size)
  const withAudio = await attachCetPaperFile(study.id, 'audio', audio())
  assert.equal(withAudio.files.paper!.id, originalId)
  assert.equal(fixture.blobs().length, 2)
  const replacement = await attachCetPaperFile(study.id, 'paper', pdf('revised.pdf'))
  assert.equal(replacement.files.paper!.name, 'revised.pdf')
  assert.equal(fixture.blobs().length, 2, 'the replaced PDF must not remain orphaned')
  assert.equal(fixture.blobs().some((row) => row.id === originalId), false)
  const before = fixture.paper(study.id)
  const blobIds = fixture.blobs().map((row) => row.id).sort()
  fixture.failNextWrite()
  await assert.rejects(attachCetPaperFile(study.id, 'paper', pdf('failed.pdf')), /storage failure/)
  assert.deepEqual(fixture.paper(study.id), before)
  assert.deepEqual(fixture.blobs().map((row) => row.id).sort(), blobIds)
})

test('CET papers: reject disguised, wrong-type, empty and oversized attachments before storing blobs', async (t) => {
  const fixture = paperFixture(t)
  const study = await createCetPaperStudy(sourceId)
  const oversizedPdf = pdf()
  Object.defineProperty(oversizedPdf, 'size', { value: 30 * 1024 * 1024 + 1 })
  const oversizedAudio = audio()
  Object.defineProperty(oversizedAudio, 'size', { value: 60 * 1024 * 1024 + 1 })
  for (const file of [new File(['text'], 'fake.pdf', { type: 'application/pdf' }),
    new File(['%PDF-1.7'], 'paper.png', { type: 'image/png' }),
    new File([], 'empty.pdf', { type: 'application/pdf' }), oversizedPdf]) {
    await assert.rejects(attachCetPaperFile(study.id, 'paper', file))
  }
  for (const file of [new File(['text'], 'fake.mp3', { type: 'audio/mpeg' }), pdf(), oversizedAudio]) {
    await assert.rejects(attachCetPaperFile(study.id, 'audio', file))
  }
  await assert.rejects(attachCetPaperFile('missing-study', 'paper', pdf()))
  assert.deepEqual(fixture.blobs(), [])
  assert.deepEqual(fixture.paper(study.id)?.files, {})
})
