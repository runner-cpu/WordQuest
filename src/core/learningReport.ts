import { cetPaperSubmissions } from './cetPapers'
import type { CetPaperStudy } from '../types/cetPaper'

export const REPORT_SECTIONS = [
  { id: 'listening', name: '听力', start: 1, end: 25 },
  { id: 'banked', name: '选词填空', start: 26, end: 35 },
  { id: 'matching', name: '长篇匹配', start: 36, end: 45 },
  { id: 'careful', name: '仔细阅读', start: 46, end: 55 },
] as const

/** One latest study per paper edition: corrections and repeat attempts must not inflate samples. */
export function buildPaperReport(studies: CetPaperStudy[]) {
  const editions = new Map<string, CetPaperStudy>()
  for (const study of studies) {
    if (!study.answers.some(Boolean) && !study.writingDraft.trim() && !study.translationDraft.trim()) continue
    const key = `${study.sourceId}:${study.paperRevision ?? study.variant}`
    if (!editions.has(key) || editions.get(key)!.updatedAt < study.updatedAt) editions.set(key, study)
  }
  const rows = [...editions.values()]
  return {
    papers: rows.length,
    writing: rows.filter(row => row.writingDraft.trim()).length,
    translation: rows.filter(row => row.translationDraft.trim()).length,
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
