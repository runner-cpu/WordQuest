export type CetPaperFileKind = 'paper' | 'answers' | 'audio'
export type CetPaperScope = 'all' | 'listening' | 'reading'

/** 用户在本机导入的文件；字节保存在 media 表中。 */
export interface CetPaperFileRef {
  id: string
  name: string
  type: string
  size: number
}

/** 每次核对都复制答案与答案键，后续订正不改变历史。 */
export interface CetPaperSubmission {
  answers: string[]
  answerKey: string[]
  submittedAt: number
}

export interface CetPaperStudy {
  id: string
  sourceId: string
  variant: string
  /** Present only for studies created from a verified built-in edition. */
  paperRevision?: string
  createdAt: number
  updatedAt: number
  answers: string[]
  answerKey: string[]
  writingDraft: string
  translationDraft: string
  notes: string
  elapsedSeconds: number
  files: Partial<Record<CetPaperFileKind, CetPaperFileRef>>
  firstSubmission?: CetPaperSubmission
  latestSubmission?: CetPaperSubmission
  /** 分项核对独立保留首次与最近记录，共享同一份作答草稿。 */
  sectionSubmissions?: Partial<Record<Exclude<CetPaperScope, 'all'>, {
    first: CetPaperSubmission
    latest: CetPaperSubmission
  }>>
}
