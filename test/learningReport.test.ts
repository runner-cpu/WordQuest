import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPaperReport, buildPendingCetSections, englishWordCount, latestNonemptyPaperStudies, reviewForecast } from '../src/core/learningReport.ts'
import type { CetPaperStudy, CetPaperSubmission } from '../src/types/cetPaper.ts'
import { emptyOutputRevision } from '../src/core/outputRevision.ts'

const blank = () => Array<string>(55).fill('')
const paper = (patch: Partial<CetPaperStudy> = {}): CetPaperStudy => ({
  id: 'paper-1', sourceId: 'cet4-example', variant: '', createdAt: 1, updatedAt: 10,
  answers: blank(), answerKey: Array(55).fill('A'), writingDraft: '', translationDraft: '', notes: '', elapsedSeconds: 0, files: {}, ...patch,
})
const submission = (answers: string[], submittedAt = 5): CetPaperSubmission => ({ answers, answerKey: Array(55).fill('A'), submittedAt })

test('forecast uses calendar days, includes overdue and separates midnight boundaries', () => {
  const now = new Date(2026, 10, 1, 18).getTime()
  const due = [new Date(2026, 9, 30).getTime(), now, new Date(2026, 10, 1, 23, 59).getTime(), new Date(2026, 10, 2).getTime(), new Date(2026, 10, 7, 23).getTime(), new Date(2026, 10, 8).getTime(), NaN]
  assert.deepEqual(reviewForecast(due, now), [3, 1, 0, 0, 0, 0, 1])
  assert.deepEqual(reviewForecast([], now), Array(7).fill(0))
})

test('English word count ignores Chinese notes, punctuation, and counts apostrophes as one word', () => {
  assert.equal(englishWordCount('这是中文笔记 123 !!!'), 0)
  assert.equal(englishWordCount("It's a well-known fact.\nStudents’ notes are useful."), 8)
  assert.equal(englishWordCount(''), 0)
})

test('paper report separates original performance from corrections and each skill', () => {
  const first = blank(); first[0] = 'B'; first[25] = 'A'; first[45] = 'B'
  const latest = [...first]; latest[0] = 'A'
  const report = buildPaperReport([paper({ answers: latest, firstSubmission: submission(first), latestSubmission: submission(latest, 8), writingDraft: 'My essay' })])
  assert.equal(report.papers, 1)
  assert.equal(report.writing, 1)
  assert.equal(report.translation, 0)
  assert.deepEqual(report.sections.map(s => [s.answered, s.firstCorrect, s.compared, s.pending]), [[1, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [1, 0, 1, 1]])
})

test('repeated editions and blank opened studies cannot inflate paper report', () => {
  const answers = blank(); answers[0] = 'A'
  const old = paper({ answers, firstSubmission: submission(answers), latestSubmission: submission(answers) })
  const newer = paper({ id: 'new', answers, updatedAt: 20 })
  const empty = paper({ id: 'empty', updatedAt: 30 })
  const report = buildPaperReport([old, newer, empty])
  assert.equal(report.papers, 1)
  assert.equal(report.sections[0].answered, 1)
  assert.equal(report.sections[0].compared, 0, 'a new unsubmitted round is not treated as an examined result')
  assert.equal(buildPaperReport([empty]).papers, 0)
  assert.equal(buildPaperReport([paper({ translationDraft: 'A translation' })]).translation, 1)
})

test('latest nonempty paper studies include independent revision text without counting check-only records', () => {
  const answered = blank(); answered[0] = 'A'
  const old = paper({ answers: answered })
  const revised = paper({ id: 'revised', updatedAt: 20, writingRevision: { ...emptyOutputRevision(20), text: 'My revised essay.' } })
  const empty = paper({ id: 'empty', updatedAt: 30, writingRevision: emptyOutputRevision(30) })
  const translated = paper({ id: 'translated', sourceId: 'second-paper', translationRevision: { ...emptyOutputRevision(10), text: 'My revised translation.' } })
  const rows = [old, revised, empty, translated]
  assert.deepEqual(latestNonemptyPaperStudies(rows).map(row => row.id), ['revised', 'translated'])
  assert.deepEqual(rows.map(row => row.id), ['paper-1', 'revised', 'empty', 'translated'])
  const report = buildPaperReport(rows)
  assert.equal(report.papers, 2)
  assert.equal(report.writing, 1)
  assert.equal(report.translation, 1)
  assert.equal(report.sections[0].answered, 0)
})

test('pending sections use latest checked scope snapshots and count coverage only for their unresolved questions', () => {
  const current = blank(); current[0] = 'A'; current[25] = 'A'; current[45] = 'A'; current[46] = 'A'; current[47] = 'A'
  const earlier = blank(); earlier[0] = 'B'; earlier[25] = 'B'; earlier[45] = 'B'
  const reading = blank(); reading[25] = 'B'; reading[45] = 'B'; reading[46] = 'B'; reading[47] = 'B'
  const noKey = submission(reading, 9); noKey.answerKey[47] = ''
  const checkedListening = blank(); checkedListening[0] = 'A'
  const row = paper({ sourceId: 'cet4-202606-set1-nju', paperRevision: '4222c1c11c62fb7c', answers: current,
    answerKey: Array(55).fill('B'), firstSubmission: submission(earlier), latestSubmission: submission(earlier),
    sectionSubmissions: {
      listening: { first: submission(earlier), latest: submission(checkedListening, 8) },
      reading: { first: submission(earlier), latest: noKey },
    },
  })
  assert.deepEqual(buildPendingCetSections([row]), [
    { id: 'listening', name: '听力', pending: 0, covered: 0, verified: 0 },
    { id: 'banked', name: '选词填空', pending: 1, covered: 0, verified: 0 },
    { id: 'matching', name: '长篇匹配', pending: 0, covered: 0, verified: 0 },
    { id: 'careful', name: '仔细阅读', pending: 2, covered: 2, verified: 0 },
  ])
  assert.equal(buildPaperReport([row]).sections.reduce((sum, section) => sum + section.pending, 0), 3)
})

test('pending coverage never recommends covered correct questions or borrows another paper revision', () => {
  const current = blank(); current[0] = 'B'; current[45] = 'A'
  const checked = submission(current)
  const valid = paper({ sourceId: 'cet4-202606-set1-nju', paperRevision: '4222c1c11c62fb7c', answers: current, latestSubmission: checked })
  const sections = buildPendingCetSections([valid])
  assert.deepEqual(sections.find(section => section.id === 'listening'), { id: 'listening', name: '听力', pending: 1, covered: 0, verified: 0 })
  assert.deepEqual(sections.find(section => section.id === 'careful'), { id: 'careful', name: '仔细阅读', pending: 0, covered: 0, verified: 0 })
  const wrong = blank(); wrong[45] = 'B'
  for (const row of [
    paper({ sourceId: valid.sourceId, paperRevision: 'other-revision', answers: wrong, latestSubmission: submission(wrong) }),
    paper({ sourceId: valid.sourceId, paperRevision: undefined, answers: wrong, latestSubmission: submission(wrong) }),
  ]) {
    assert.equal(buildPendingCetSections([row])[3].pending, 1)
    assert.equal(buildPendingCetSections([row])[3].covered, 0)
  }
  assert.equal(buildPendingCetSections([paper({ answers: wrong, firstSubmission: submission(wrong) })])[3].pending, 0)
})

test('pending sections share edition deduplication and ignore a newer blank reopened record', () => {
  const wrong = blank(); wrong[45] = 'B'; wrong[46] = 'B'
  const old = paper({ sourceId: 'cet4-202606-set1-nju', paperRevision: '4222c1c11c62fb7c', answers: wrong, latestSubmission: submission(wrong) })
  const corrected = [...wrong]; corrected[45] = 'A'
  const recent = { ...old, id: 'recent', answers: corrected, updatedAt: 20, latestSubmission: submission(corrected, 19) }
  const empty = { ...old, id: 'empty', answers: blank(), latestSubmission: undefined, updatedAt: 30 }
  assert.equal(buildPendingCetSections([old, recent, empty])[3].pending, 1)
  assert.equal(buildPendingCetSections([old, recent, empty])[3].covered, 1)
  assert.deepEqual(buildPendingCetSections([]).map(section => section.pending), [0, 0, 0, 0])
})
