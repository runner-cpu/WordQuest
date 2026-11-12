import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCetStudyPlan, CET_FOUNDATIONS } from '../src/core/cetStudyPlan.ts'
import { dateKeyOffset, SCHEMA_VERSION } from '../src/db/database.ts'
import { defaultProfile, patchProfile } from '../src/core/profile.ts'
import { db } from '../src/db/database.ts'
import type { CetPaperStudy, CetPaperSubmission } from '../src/types/cetPaper.ts'

const now = new Date(2026, 10, 12, 23, 30)
const blank = () => Array<string>(55).fill('')
const submission = (wrong: number[], submittedAt = 5): CetPaperSubmission => {
  const answers = blank()
  for (const number of wrong) answers[number - 1] = 'B'
  return { answers, answerKey: Array(55).fill('A'), submittedAt }
}
function study(wrong: number[], patch: Partial<CetPaperStudy> = {}): CetPaperStudy {
  const latestSubmission = submission(wrong)
  return { id: 'study-1', sourceId: 'cet4-202606-set1-nju', paperRevision: '4222c1c11c62fb7c',
    variant: '', createdAt: 1, updatedAt: 10, answers: [...latestSubmission.answers], answerKey: Array(55).fill('A'),
    writingDraft: '', translationDraft: '', notes: '', elapsedSeconds: 0, files: {}, latestSubmission, ...patch }
}

test('study plan foundations remain an optional self report and new profiles do not invent a choice', async (t) => {
  assert.deepEqual(CET_FOUNDATIONS.map(option => option.id), ['building', 'steady', 'ready'])
  assert.equal(CET_FOUNDATIONS.every(option => Boolean(option.label.trim() && option.description.trim())), true)
  assert.equal(defaultProfile().cetFoundation, undefined)
  assert.equal(SCHEMA_VERSION, 12)
  let saved = { ...defaultProfile(), theme: 'paper' }
  t.mock.method(db.profile, 'get', async () => saved)
  t.mock.method(db.profile, 'put', async value => { saved = structuredClone(value); return 'me' })
  assert.equal((await patchProfile({ cetFoundation: 'building' })).cetFoundation, 'building')
  assert.equal(saved.theme, 'paper')
  await assert.rejects(patchProfile({ cetFoundation: 'expert' } as never), /基础|选项/)
  assert.equal(saved.cetFoundation, 'building')
})

test('study plan uses inclusive calendar-day stage boundaries without changing the chosen date', () => {
  for (const [days, expected] of [[0, 'sprint'], [14, 'sprint'], [15, 'mock'], [45, 'mock'],
    [46, 'specialized'], [90, 'specialized'], [91, 'foundation']] as const) {
    const profile = { examDate: dateKeyOffset(days, now), cetFoundation: 'building' as const }
    const before = structuredClone(profile)
    const plan = buildCetStudyPlan(profile, [], now)
    assert.equal(plan.stage, expected, `${days} days`)
    assert.equal(Boolean(plan.stageLabel && plan.stageReason && plan.title && plan.reason), true)
    assert.deepEqual(profile, before)
  }
  assert.equal(buildCetStudyPlan({ examDate: '2026-11-13' }, [], new Date(2026, 10, 12, 0, 1)).stage, 'sprint')
  assert.equal(buildCetStudyPlan({ examDate: '2026-11-13' }, [], now).stage, 'sprint')
})

test('self reported foundations only adjust distant or undated suggestions and never diagnose readiness', () => {
  assert.equal(buildCetStudyPlan({}, [], now).stage, 'foundation')
  assert.equal(buildCetStudyPlan({ cetFoundation: 'building' }, [], now).target, 'vocabulary')
  assert.equal(buildCetStudyPlan({ cetFoundation: 'steady' }, [], now).stage, 'specialized')
  const ready = buildCetStudyPlan({ cetFoundation: 'ready', examDate: dateKeyOffset(120, now) }, [], now)
  assert.equal(ready.stage, 'specialized')
  assert.match(ready.stageReason, /自述|自选|选择/)
  assert.equal(ready.target, 'listening')
  assert.equal(buildCetStudyPlan({ cetFoundation: 'building', examDate: dateKeyOffset(10, now) }, [], now).stage, 'sprint')
  assert.equal(buildCetStudyPlan({ examDate: 'not-a-date' }, [], now).stage, 'foundation')
})

test('an expired plan date is explained separately and is not treated as an upcoming sprint', () => {
  const plan = buildCetStudyPlan({ examDate: '2026-11-11' }, [], now)
  assert.equal(plan.stage, 'foundation')
  assert.match(plan.stageReason, /日期.*已过|已过.*日期/)
  assert.match(plan.stageReason, /2026-11-11/)
  assert.match(`${plan.title} ${plan.reason}`, /更新.*日期|日期.*更新/)
})

test('pending corrections prefer the covered section even when an uncovered section has more mistakes', () => {
  const rows = [study([1, 2, 3, 4, 5, 46, 47])]
  const before = structuredClone(rows)
  const plan = buildCetStudyPlan({ examDate: dateKeyOffset(7, now) }, rows, now)
  assert.equal(plan.stage, 'sprint')
  assert.equal(plan.target, 'prep')
  assert.deepEqual(plan.section, { id: 'careful', name: '仔细阅读', pending: 2, covered: 2, verified: 0 })
  assert.match(plan.reason, /2/)
  assert.match(plan.coverageNote!, /部分卷别/)
  assert.match(plan.coverageNote!, /待人工核验/)
  assert.match(plan.coverageNote!, /解析草稿/)
  assert.deepEqual(rows, before)
})

test('uncovered pending work uses the largest section and explicitly reports missing structured explanations', () => {
  const rows = [study([1, 2, 3, 46], { paperRevision: 'other-revision' })]
  const plan = buildCetStudyPlan({}, rows, now)
  assert.equal(plan.section?.id, 'listening')
  assert.equal(plan.target, 'listening')
  assert.equal(plan.section?.pending, 3)
  assert.equal(plan.section?.covered, 0)
  assert.match(plan.coverageNote!, /该题型暂无结构化解析/)
  const correctCovered = study([1, 2, 3])
  correctCovered.answers[45] = 'A'
  correctCovered.latestSubmission!.answers[45] = 'A'
  assert.equal(buildCetStudyPlan({}, [correctCovered], now).section?.id, 'listening')
})

test('partial analysis coverage is quantified and empty histories fall back to stage suggestions', () => {
  const rows = [study([46]), study([47], { id: 'study-2', sourceId: 'cet4-other-paper' })]
  const plan = buildCetStudyPlan({}, rows, now)
  assert.equal(plan.section?.pending, 2)
  assert.equal(plan.section?.covered, 1)
  assert.match(plan.coverageNote!, /1/)
  for (const [days, target] of [[120, 'vocabulary'], [60, 'listening'], [30, 'prep'], [7, 'prep']] as const) {
    const empty = buildCetStudyPlan({ examDate: dateKeyOffset(days, now) }, [], now)
    assert.equal(empty.section, undefined)
    assert.equal(empty.target, target)
  }
})
