export type CetPaperFileKind = 'paper' | 'answers' | 'audio'

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
}
