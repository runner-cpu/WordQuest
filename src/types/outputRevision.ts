export type OutputReason = 'tense' | 'agreement' | 'article' | 'plural' | 'spelling' | 'collocation' | 'omission' | 'cohesion'

/** 两版文字分别自查；快照只说明学习者核对过该文本，不是系统评分。 */
export interface OutputRevision {
  text: string
  reasons: OutputReason[]
  initialChecks: boolean[]
  revisionChecks: boolean[]
  initialCheckedText?: string
  revisionCheckedText?: string
  updatedAt: number
}
