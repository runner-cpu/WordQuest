import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPaperReport, englishWordCount, reviewForecast } from '../src/core/learningReport.ts'
import type { CetPaperStudy, CetPaperSubmission } from '../src/types/cetPaper.ts'

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
