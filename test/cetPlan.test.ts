import test from 'node:test'
import assert from 'node:assert/strict'
import { CET_PRACTICES } from '../src/data/cetPractice'
import { cetPhaseAdvice, readingResult, recommendCetPractice } from '../src/core/cetPlan'
import type { CetPracticeRecord } from '../src/types/model'

const tasks = CET_PRACTICES.filter((item) => item.examType === 'cet4')
const reading = tasks.find((item) => item.kind === 'reading')!
function row(id: string, patch: Partial<CetPracticeRecord> = {}): CetPracticeRecord {
  const task = tasks.find((item) => item.id === id)!
  return { id, examType: 'cet4', kind: task.kind, draft: '', updatedAt: 10, attempts: 0, ...patch }
}
test('CET recommendation prioritizes actual unresolved reading errors over fresh tasks', () => {
  assert.equal(reading.kind, 'reading')
  if (reading.kind !== 'reading') return
  const wrong = reading.questions.map((q) => (q.answer + 1) % 4)
  const result = recommendCetPractice(tasks, [row(reading.id, { completedAt: 1, firstAnswers: wrong, latestAnswers: wrong })])
  assert.equal(result?.task.id, reading.id)
  const corrected = row(reading.id, { firstAnswers: wrong, latestAnswers: reading.questions.map((q) => q.answer) })
  assert.deepEqual(readingResult(reading, corrected), { firstCorrect: 0, latestCorrect: 3, pending: [] })
})
test('CET recommendation resumes an unfinished revision; completed work moves to another task', () => {
  const writing = tasks.find((item) => item.kind === 'writing')!
  assert.equal(recommendCetPractice(tasks, [row(writing.id, { draft: 'A draft', updatedAt: 30, submittedAt: 20 })])?.task.id, writing.id)
  const records = tasks.map((task, i) => row(task.id, { completedAt: 1, updatedAt: i + 1 }))
  assert.equal(recommendCetPractice(tasks, records)?.task.id, tasks[0].id)
})
test('CET fresh-task recommendations balance practice types after completing one reading', () => {
  if (reading.kind !== 'reading') return
  const answers = reading.questions.map((q) => q.answer)
  const recommendation = recommendCetPractice(tasks, [row(reading.id, { completedAt: 1, firstAnswers: answers, latestAnswers: answers })])
  assert.equal(recommendation?.task.kind, 'writing')
})
test('CET date advice treats missing and past targets as planning states', () => {
  assert.match(cetPhaseAdvice(null), /目标考试日期/)
  assert.match(cetPhaseAdvice(-1), /日期已过/)
  assert.match(cetPhaseAdvice(0), /临近/)
  assert.match(cetPhaseAdvice(43), /写作和翻译/)
})
