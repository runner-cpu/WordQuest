export interface CetPaperOption { key: string; text: string }

export interface CetReadyQuestion {
  number: number
  prompt: string
  options: CetPaperOption[]
  answer: string
  explanation?: string
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
