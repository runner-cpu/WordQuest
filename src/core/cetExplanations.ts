import analysisData from '../data/cetExplanations.json'
import readyPaperEntries from '../data/cetReadyPapers.json'
import type { CetAnalysisEvidence, CetAnalysisPack, CetQuestionAnalysis, CetReadyPaper } from '../types/cetReadyPaper'

const distractorTypes = new Set(['concept-swap', 'over-inference', 'mismatch', 'not-mentioned', 'scope-shift'])
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length < 100_000
const index = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const questionNumber = (value: unknown): value is number => index(value) && value >= 1 && value <= 55

function isEvidence(value: unknown, number: number): value is CetAnalysisEvidence {
  return record(value) && text(value.text) && value.question === number &&
    (value.section === 'careful' || value.section === 'listening') &&
    (value.passageIndex === undefined || index(value.passageIndex)) &&
    (value.paragraph === undefined || (index(value.paragraph) && value.paragraph > 0)) &&
    (value.sentenceIndex === undefined || index(value.sentenceIndex)) &&
    (value.sourceRef === undefined || text(value.sourceRef))
}

function isQuestionAnalysis(value: unknown): value is CetQuestionAnalysis {
  if (!record(value) || !questionNumber(value.number) || typeof value.verified !== 'boolean' || !text(value.sourceNote) ||
    !Array.isArray(value.evidence) || !value.evidence.length || !value.evidence.every((item) => isEvidence(item, Number(value.number))) ||
    !Array.isArray(value.distractors) || !value.distractors.length) return false
  const options = new Set<string>()
  for (const item of value.distractors) {
    if (!record(item) || typeof item.option !== 'string' || !/^[A-Z]$/.test(item.option) || options.has(item.option) ||
      typeof item.type !== 'string' || !distractorTypes.has(item.type) || !text(item.explanation)) return false
    options.add(item.option)
  }
  return value.paraphrase === undefined || (Array.isArray(value.paraphrase) &&
    value.paraphrase.every((item) => record(item) && text(item.original) && text(item.alternative)))
}

/** Checks the published schema; `verified` remains an explicit editorial claim. */
export function isCetAnalysisPack(value: unknown): value is CetAnalysisPack {
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.papers)) return false
  const sources = new Set<string>()
  for (const paper of value.papers) {
    if (!record(paper) || !text(paper.sourceId) || sources.has(paper.sourceId) || typeof paper.paperRevision !== 'string' ||
      !/^[a-f0-9]{16,64}$/.test(paper.paperRevision) || !Array.isArray(paper.questions) || !paper.questions.length ||
      !paper.questions.every(isQuestionAnalysis)) return false
    if (new Set(paper.questions.map((question) => question.number)).size !== paper.questions.length) return false
    sources.add(paper.sourceId)
  }
  return true
}

// A static import makes the content part of the application bundle and its precache.
const pack: CetAnalysisPack = isCetAnalysisPack(analysisData) ? analysisData : { schema: 1, papers: [] }

/** Only returns analyses for the currently published edition of a paper. */
export function getCetAnalysis(sourceId: string, number: number, revision?: string): CetQuestionAnalysis | undefined {
  if (!questionNumber(number)) return undefined
  const entry = readyPaperEntries.find((item) => item.sourceId === sourceId)
  if (!entry || (revision !== undefined && revision !== entry.revision)) return undefined
  return pack.papers.find((paper) => paper.sourceId === sourceId && paper.paperRevision === entry.revision)?.questions
    .find((question) => question.number === number)
}

export function analysisStatus(analysis?: CetQuestionAnalysis): string {
  if (!analysis) return '本题暂无结构化解析，仅提供参考答案'
  return analysis.verified ? '已人工核验的解析' : '解析草稿 · 尚未人工核验'
}

function evidenceLocation(evidence: CetAnalysisEvidence): string {
  const section = evidence.section === 'careful' ? '仔细阅读' : '听力'
  const passage = evidence.passageIndex === undefined ? section :
    `${section}第 ${evidence.passageIndex + 1} ${evidence.section === 'careful' ? '篇' : '组'}`
  return [
    `第 ${evidence.question} 题`, passage,
    evidence.paragraph === undefined ? '' : `第 ${evidence.paragraph} 段`,
    evidence.sentenceIndex === undefined ? '' : `第 ${evidence.sentenceIndex + 1} 句`,
    evidence.sourceRef ?? '',
  ].filter(Boolean).join(' · ')
}

/** Pure note update; callers save it through the existing draft/conflict workflow. */
export function appendEvidenceNote(notes: string, analysis: CetQuestionAnalysis): string {
  const additions = new Set<string>()
  for (const evidence of analysis.evidence) {
    if (!text(evidence.text)) continue
    const block = `【原文证据 · ${evidenceLocation(evidence)}】\n${evidence.text}`
    if (!notes.includes(block)) additions.add(block)
  }
  if (!additions.size) return notes
  const separator = notes ? (notes.endsWith('\n') ? '\n' : '\n\n') : ''
  return `${notes}${separator}${[...additions].join('\n\n')}`
}

function matchesReadingLocation(evidence: CetAnalysisEvidence, passage: string): boolean {
  if (!passage.includes(evidence.text)) return false
  const paragraphs = passage.split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.trim())
  const scope = evidence.paragraph === undefined ? passage : paragraphs[evidence.paragraph - 1]
  if (scope === undefined || !scope.includes(evidence.text)) return false
  if (evidence.sentenceIndex === undefined) return true
  // Sentence positions use punctuation and following whitespace; no timing is inferred.
  const sentences = scope.split(/(?<=[.!?]["'”’)]?)\s+/).filter((sentence) => sentence.trim())
  return sentences[evidence.sentenceIndex]?.includes(evidence.text) ?? false
}

/** Validates question/option/location consistency, without claiming a human review. */
export function validateAnalysisForPaper(analysis: unknown, paper: CetReadyPaper): analysis is CetQuestionAnalysis {
  if (!isQuestionAnalysis(analysis)) return false
  // Current papers have no listening transcripts to validate quotations against.
  const passageIndex = paper.careful.findIndex((passage) => passage.questions.some((question) => question.number === analysis.number))
  if (passageIndex < 0) return false
  const group = paper.careful[passageIndex]
  const question = group.questions.find((item) => item.number === analysis.number)!
  const optionKeys = question.options.map((option) => option.key)
  if (!optionKeys.includes(question.answer) || new Set(optionKeys).size !== optionKeys.length) return false
  const wrongOptions = optionKeys.filter((key) => key !== question.answer)
  if (analysis.distractors.length !== wrongOptions.length || !analysis.distractors.every((item) => wrongOptions.includes(item.option))) return false
  return analysis.evidence.every((evidence) => evidence.section === 'careful' && evidence.passageIndex === passageIndex &&
    matchesReadingLocation(evidence, group.passage))
}
