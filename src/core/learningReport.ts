import { cetPaperSubmissions } from './cetPapers'
import { getCetAnalysis } from './cetExplanations'
import type { CetPaperStudy } from '../types/cetPaper'

export const REPORT_SECTIONS = [
  { id: 'listening', name: '听力', start: 1, end: 25 },
  { id: 'banked', name: '选词填空', start: 26, end: 35 },
  { id: 'matching', name: '长篇匹配', start: 36, end: 45 },
  { id: 'careful', name: '仔细阅读', start: 46, end: 55 },
] as const

export type CetReportSection = typeof REPORT_SECTIONS[number]['id']
export interface PendingCetSection {
  id: CetReportSection
  name: string
  pending: number
  covered: number
  verified: number
}

/** One latest study per paper edition: corrections and repeat attempts must not inflate samples. */
export function latestNonemptyPaperStudies(studies: CetPaperStudy[]): CetPaperStudy[] {
  const editions = new Map<string, CetPaperStudy>()
  for (const study of studies) {
    if (!study.answers.some(Boolean) && !study.writingDraft.trim() && !study.translationDraft.trim() &&
      !study.writingRevision?.text.trim() && !study.translationRevision?.text.trim()) continue
    const key = `${study.sourceId}:${study.paperRevision ?? study.variant}`
    if (!editions.has(key) || editions.get(key)!.updatedAt < study.updatedAt) editions.set(key, study)
  }
  return [...editions.values()]
}

/** Pending work comes from the last checked answers, not an unsubmitted correction draft. */
export function buildPendingCetSections(studies: CetPaperStudy[]): PendingCetSection[] {
  const rows = latestNonemptyPaperStudies(studies)
  return REPORT_SECTIONS.map(section => {
    let pending = 0, covered = 0, verified = 0
    for (const row of rows) {
      const { latest } = cetPaperSubmissions(row, section.id === 'listening' ? 'listening' : 'reading')
      if (!latest) continue
      for (let i = section.start - 1; i < section.end; i++) {
        if (!latest.answers[i] || !latest.answerKey[i] || latest.answers[i] === latest.answerKey[i]) continue
        pending++
        // Manual archives and other editions cannot borrow built-in explanations.
        const analysis = row.paperRevision ? getCetAnalysis(row.sourceId, i + 1, row.paperRevision) : undefined
        if (!analysis) continue
        covered++
        if (analysis.verified) verified++
      }
    }
    return { id: section.id, name: section.name, pending, covered, verified }
  })
}

export function buildPaperReport(studies: CetPaperStudy[]) {
  const rows = latestNonemptyPaperStudies(studies)
  return {
    papers: rows.length,
    writing: rows.filter(row => row.writingDraft.trim() || row.writingRevision?.text.trim()).length,
    translation: rows.filter(row => row.translationDraft.trim() || row.translationRevision?.text.trim()).length,
    sections: REPORT_SECTIONS.map(section => {
      let firstCorrect = 0, compared = 0, pending = 0, answered = 0
      for (const row of rows) {
        const { first, latest } = cetPaperSubmissions(row, section.id === 'listening' ? 'listening' : 'reading')
        for (let i = section.start - 1; i < section.end; i++) {
          if (row.answers[i]) answered++
          if (first?.answers[i] && first.answerKey[i]) {
            compared++
            if (first.answers[i] === first.answerKey[i]) firstCorrect++
          }
          if (latest?.answers[i] && latest.answerKey[i] && latest.answers[i] !== latest.answerKey[i]) pending++
        }
      }
      return { ...section, firstCorrect, compared, pending, answered }
    }),
  }
}

/** Calendar-day buckets, including overdue work today and respecting local DST boundaries. */
export function reviewForecast(dueTimes: number[], now: number): number[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const ends = Array.from({ length: 7 }, (_, i) => {
    const end = new Date(start); end.setDate(end.getDate() + i + 1); return end.getTime()
  })
  const buckets = Array<number>(7).fill(0)
  for (const due of dueTimes) {
    if (!Number.isFinite(due)) continue
    const index = ends.findIndex(end => due < end)
    if (index >= 0) buckets[index]++
  }
  return buckets
}

export function englishWordCount(text: string): number {
  return (text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) ?? []).length
}
