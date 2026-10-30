import type { CetPracticeKind } from '../types/model'

/** 轻量任务索引：草稿与备份校验不需要加载完整阅读文章和范文。 */
export interface CetPracticeMeta {
  id: string
  examType: 'cet4' | 'cet6'
  kind: CetPracticeKind
  optionCounts?: readonly number[]
  minWords?: number
}

export const CET_PRACTICE_META: readonly CetPracticeMeta[] = [
  { id: 'cet4-reading-1', examType: 'cet4', kind: 'reading', optionCounts: [4, 4, 4] },
  { id: 'cet4-reading-2', examType: 'cet4', kind: 'reading', optionCounts: [4, 4, 4] },
  { id: 'cet4-writing-1', examType: 'cet4', kind: 'writing', minWords: 20 },
  { id: 'cet4-writing-2', examType: 'cet4', kind: 'writing', minWords: 20 },
  { id: 'cet4-translation-1', examType: 'cet4', kind: 'translation', minWords: 10 },
  { id: 'cet4-translation-2', examType: 'cet4', kind: 'translation', minWords: 10 },
  { id: 'cet6-reading-1', examType: 'cet6', kind: 'reading', optionCounts: [4, 4, 4] },
  { id: 'cet6-reading-2', examType: 'cet6', kind: 'reading', optionCounts: [4, 4, 4] },
  { id: 'cet6-writing-1', examType: 'cet6', kind: 'writing', minWords: 20 },
  { id: 'cet6-writing-2', examType: 'cet6', kind: 'writing', minWords: 20 },
  { id: 'cet6-translation-1', examType: 'cet6', kind: 'translation', minWords: 10 },
  { id: 'cet6-translation-2', examType: 'cet6', kind: 'translation', minWords: 10 },
]

export const CET_PRACTICE_IDS = CET_PRACTICE_META.map((task) => task.id)

export function cetPracticeMeta(id: unknown): CetPracticeMeta | undefined {
  return typeof id === 'string' ? CET_PRACTICE_META.find((task) => task.id === id) : undefined
}
