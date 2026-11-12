export interface CetPaperOption { key: string; text: string }

export type CetDistractorType = 'concept-swap' | 'over-inference' | 'mismatch' | 'not-mentioned' | 'scope-shift'

export interface CetAnalysisEvidence {
  text: string
  question: number
  section: 'careful' | 'listening'
  /** Zero-based reading passage or listening group index. */
  passageIndex?: number
  /** One-based paragraph number in the reading passage. */
  paragraph?: number
  /** Zero-based sentence index within the paragraph, or the passage if no paragraph is given. */
  sentenceIndex?: number
  sourceRef?: string
}

export interface CetAnalysisDistractor {
  option: string
  type: CetDistractorType
  explanation: string
}

export interface CetQuestionAnalysis {
  number: number
  verified: boolean
  sourceNote: string
  evidence: CetAnalysisEvidence[]
  distractors: CetAnalysisDistractor[]
  paraphrase?: { original: string; alternative: string }[]
}

export interface CetAnalysisPack {
  schema: 1
  papers: { sourceId: string; paperRevision: string; questions: CetQuestionAnalysis[] }[]
}

export interface CetReadyQuestion {
  number: number
  prompt: string
  options: CetPaperOption[]
  answer: string
  explanation?: string
  analysis?: CetQuestionAnalysis
}

export interface CetListeningGroup {
  title: string
  startSeconds?: number
  endSeconds?: number
  questions: CetReadyQuestion[]
}

export interface CetPaperAsset {
  path: string
  bytes: number
  sha256: string
  sourceUrl: string
}

export interface CetReadyPaper {
  schema: 1
  sourceId: string
  title: string
  level: 'cet4' | 'cet6'
  year: number
  month: 6 | 12
  provider: string
  sourceUrl: string
  checkedAt: string
  answerKey: string[]
  writing: { prompt: string; reference: string }
  translation: { prompt: string; reference: string }
  listening: CetListeningGroup[]
  banked: { passage: string; options: CetPaperOption[]; questions: CetReadyQuestion[] }
  matching: { paragraphs: CetPaperOption[]; questions: CetReadyQuestion[] }
  careful: { title: string; passage: string; questions: CetReadyQuestion[] }[]
  assets: { paper: CetPaperAsset; answers?: CetPaperAsset; audio: CetPaperAsset }
}

export interface CetReadyPaperEntry {
  sourceId: string
  path: string
  revision: string
  bytes: number
  audioBytes: number
  questionCount: number
}
