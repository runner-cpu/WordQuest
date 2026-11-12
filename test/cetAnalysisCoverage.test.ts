import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCetAnalysisCoverage } from '../src/core/cetAnalysisCoverage.ts'
import type { CetPaperStudy } from '../src/types/cetPaper.ts'

const revision = '4222c1c11c62fb7c'
const study = (patch: Partial<CetPaperStudy> = {}): CetPaperStudy => ({
  id: 'one', sourceId: 'cet4-202606-set1-nju', variant: 'set1', paperRevision: revision,
  createdAt: 1, updatedAt: 2, answers: Array(55).fill(''), answerKey: Array(55).fill(''),
  writingDraft: '', translationDraft: '', notes: '', elapsedSeconds: 0, files: {}, ...patch,
})
const answers = (...numbers: number[]) => {
  const values = Array<string>(55).fill('')
  for (const number of numbers) values[number - 1] = 'A'
  return values
}

test('analysis coverage counts only answered questions and exposes pending human review', () => {
  assert.deepEqual(buildCetAnalysisCoverage([study({ answers: answers(1, 46, 47) })]), {
    answered: 3, covered: 2, verified: 0, pendingReview: 2,
  })
  assert.deepEqual(buildCetAnalysisCoverage([]), { answered: 0, covered: 0, verified: 0, pendingReview: 0 })
})

test('analysis coverage follows latest nonempty edition and ignores empty reopened studies', () => {
  const old = study({ answers: answers(46, 47, 48) })
  const recent = study({ id: 'recent', updatedAt: 3, answers: answers(46) })
  const empty = study({ id: 'empty', updatedAt: 4 })
  assert.deepEqual(buildCetAnalysisCoverage([old, recent, empty]), {
    answered: 1, covered: 1, verified: 0, pendingReview: 1,
  })
})

test('unmatched and unpinned paper editions never borrow explanations from another revision', () => {
  const studies = [
    study({ id: 'wrong-revision', paperRevision: 'other-revision', answers: answers(46) }),
    study({ id: 'manual', sourceId: 'manual-source', paperRevision: undefined, answers: answers(47) }),
    study({ id: 'unpinned', paperRevision: undefined, answers: answers(48) }),
  ]
  assert.deepEqual(buildCetAnalysisCoverage(studies), { answered: 3, covered: 0, verified: 0, pendingReview: 0 })
})
