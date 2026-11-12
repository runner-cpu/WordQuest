import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { analysisStatus, appendEvidenceNote, getCetAnalysis, isCetAnalysisPack, validateAnalysisForPaper } from '../src/core/cetExplanations.ts'
import type { CetReadyPaper } from '../src/types/cetReadyPaper.ts'

const analysis = () => ({
  number: 46, verified: false,
  sourceNote: '依据原文整理，尚未人工核验。',
  evidence: [{ question: 46, section: 'careful' as const, passageIndex: 0, paragraph: 2, sentenceIndex: 0, text: 'Evidence sentence.' }],
  distractors: [
    { option: 'A', type: 'not-mentioned' as const, explanation: '原文没有此信息。' },
    { option: 'B', type: 'scope-shift' as const, explanation: '把部分扩大到全部。' },
    { option: 'C', type: 'mismatch' as const, explanation: '与证据不一致。' },
  ],
  paraphrase: [{ original: 'best', alternative: 'highest quality' }],
})
const pack = () => ({ schema: 1, papers: [{ sourceId: 'cet4-202606-set1-nju', paperRevision: '4222c1c11c62fb7c', questions: [analysis()] }] })

test('analysis pack requires source, revision, evidence, distractor types, and explicit verification state', () => {
  assert.equal(isCetAnalysisPack(pack()), true)
  const reject = (edit: (value: any) => void) => { const value = pack(); edit(value); assert.equal(isCetAnalysisPack(value), false) }
  reject(value => { delete value.papers[0].questions[0].verified })
  reject(value => { value.papers[0].questions[0].verified = 'true' })
  reject(value => { value.papers[0].questions[0].sourceNote = '' })
  reject(value => { value.papers[0].paperRevision = 'unknown' })
  reject(value => { value.papers[0].questions[0].evidence[0].question = 47 })
  reject(value => { value.papers[0].questions[0].evidence[0].text = '' })
  reject(value => { value.papers[0].questions[0].evidence = [] })
  reject(value => { value.papers[0].questions[0].evidence[0].paragraph = 0 })
  reject(value => { value.papers[0].questions[0].evidence[0].sentenceIndex = -1 })
  reject(value => { value.papers[0].questions[0].evidence[0].passageIndex = 0.5 })
  reject(value => { value.papers[0].questions[0].paraphrase[0].alternative = '' })
  reject(value => { value.papers[0].questions[0].distractors[0].type = 'guessed' })
  reject(value => { value.papers[0].questions[0].distractors[1].option = 'A' })
  reject(value => { value.papers[0].questions.push(value.papers[0].questions[0]) })
  reject(value => { value.papers.push(value.papers[0]) })
})

test('draft analyses remain visible with explicit status and missing data has an unambiguous fallback', () => {
  assert.equal(analysisStatus(), '本题暂无结构化解析，仅提供参考答案')
  assert.equal(analysisStatus(analysis()), '解析草稿 · 尚未人工核验')
  assert.equal(analysisStatus({ ...analysis(), verified: true }), '已人工核验的解析')
  assert.equal(getCetAnalysis('missing-source', 46), undefined)
  assert.equal(getCetAnalysis('cet4-202606-set1-nju', 46, '0000000000000000'), undefined)
})

test('evidence append keeps the existing notes, appends question location, and is idempotent', () => {
  const value = analysis()
  const appended = appendEvidenceNote('我的旧笔记', value)
  assert.match(appended, /^我的旧笔记\n/)
  assert.match(appended, /第 46 题/)
  assert.match(appended, /仔细阅读第 1 篇/)
  assert.match(appended, /Evidence sentence\./)
  assert.equal(appendEvidenceNote(appended, value), appended)
  const different = { ...value, evidence: [{ ...value.evidence[0], text: 'Another evidence sentence.' }] }
  assert.match(appendEvidenceNote(appended, different), /Another evidence sentence\./)
  assert.equal(appendEvidenceNote('未改', { ...value, evidence: [] }), '未改')
})

test('paper-aware validation rejects the correct answer as distractor and requires exact reading evidence', () => {
  const value = analysis()
  const paper = {
    sourceId: 'cet4-202606-set1-nju',
    listening: [], banked: { questions: [] }, matching: { questions: [] },
    careful: [{ passage: 'First paragraph.\n\nEvidence sentence.', questions: [{ number: 46, answer: 'D', options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }] }] }],
  } as unknown as CetReadyPaper
  assert.equal(validateAnalysisForPaper(value, paper), true)
  assert.equal(validateAnalysisForPaper({ ...value, distractors: [{ ...value.distractors[0], option: 'D' }, ...value.distractors.slice(1)] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, distractors: value.distractors.slice(0, 2) }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, distractors: [...value.distractors, { ...value.distractors[0], option: 'E' }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], text: 'Fabricated evidence.' }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], paragraph: 1 }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], sentenceIndex: 1 }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], passageIndex: 1 }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], section: 'listening' }] }, paper), false)
})

test('listening evidence stays unsupported without a verifiable transcript even when it cites a source', () => {
  const value = {
    ...analysis(), number: 1,
    evidence: [{ question: 1, section: 'listening' as const, passageIndex: 0, text: 'Quoted source sentence.', sourceRef: 'answers.pdf p.2' }],
  }
  const paper = {
    listening: [{ questions: [{ number: 1, answer: 'D', options: ['A', 'B', 'C', 'D'].map((key) => ({ key })) }] }],
    careful: [],
  } as unknown as CetReadyPaper
  assert.equal(isCetAnalysisPack({ ...pack(), papers: [{ ...pack().papers[0], questions: [value] }] }), true)
  assert.equal(validateAnalysisForPaper(value, paper), false)
  assert.equal(value.verified, false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], sourceRef: undefined }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], passageIndex: 1 }] }, paper), false)
  assert.equal(validateAnalysisForPaper({ ...value, evidence: [{ ...value.evidence[0], paragraph: 1 }] }, paper), false)
})

test('published analysis index matches actual paper versions and all published reading evidence', async () => {
  const value = JSON.parse(await readFile(new URL('../src/data/cetExplanations.json', import.meta.url), 'utf8'))
  assert.equal(isCetAnalysisPack(value), true)
  for (const entry of value.papers) {
    const path = entry.sourceId.match(/^(cet[46])-(\d{6})-/)
    assert.ok(path)
    const paper = JSON.parse(await readFile(new URL(`../public/exams/${path[1]}-${path[2]}-1/paper.json`, import.meta.url), 'utf8')) as CetReadyPaper
    for (const item of entry.questions) {
      assert.equal(validateAnalysisForPaper(item, paper), true, `${entry.sourceId} Q${item.number}`)
      assert.deepEqual(getCetAnalysis(entry.sourceId, item.number, entry.paperRevision), item)
      assert.equal(item.verified, false, 'machine-authored content must not claim manual verification')
    }
  }
})
