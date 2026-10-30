import type { CetPractice, CetReading } from '../data/cetPractice'
import type { CetPracticeRecord } from '../types/model'

export function readingResult(task: CetReading, row?: CetPracticeRecord) {
  const first = row?.firstAnswers
  const latest = row?.latestAnswers ?? first
  return {
    firstCorrect: task.questions.filter((q, i) => first?.[i] === q.answer).length,
    latestCorrect: task.questions.filter((q, i) => latest?.[i] === q.answer).length,
    pending: latest ? task.questions.flatMap((q, i) => latest[i] !== q.answer ? [i] : []) : [],
  }
}

/** Recommendations describe practice evidence, never readiness or an exam score. */
export function recommendCetPractice(tasks: CetPractice[], rows: CetPracticeRecord[]) {
  const records = new Map(rows.map((row) => [row.id, row]))
  const correction = tasks.find((task) => task.kind === 'reading' && readingResult(task, records.get(task.id)).pending.length > 0)
  if (correction) return { task: correction, reason: '先把上次的证据找回来' }
  const draft = tasks.find((task) => task.kind !== 'reading' && Boolean(records.get(task.id)?.draft.trim()) && (!records.get(task.id)?.submittedAt || records.get(task.id)!.updatedAt > records.get(task.id)!.submittedAt!))
  if (draft) return { task: draft, reason: '接着上次的草稿写' }
  const completedByKind = (kind: CetPractice['kind']) => tasks.filter((task) => task.kind === kind && records.get(task.id)?.completedAt).length
  const unfinished = tasks.filter((task) => !records.get(task.id)?.completedAt)
    .sort((a, b) => completedByKind(a.kind) - completedByKind(b.kind))[0]
  if (unfinished) return { task: unfinished, reason: '今天补上一项专项练习' }
  const oldest = [...tasks].sort((a, b) => (records.get(a.id)?.updatedAt ?? 0) - (records.get(b.id)?.updatedAt ?? 0))[0]
  return oldest ? { task: oldest, reason: '回看上次的证据与修订' } : undefined
}

export function cetPhaseAdvice(days: number | null) {
  if (days === null) return '先选一次目标考试日期，再把词汇、听力、阅读和产出练习分散到一周。'
  if (days < 0) return '计划日期已过。请在设置更新目标，再安排下一阶段练习。'
  if (days <= 14) return '临近计划日期：优先订正旧错题，并搭配完整真题熟悉答题顺序与时间。'
  if (days <= 45) return '本阶段建议交替练听力与阅读，每周留出写作和翻译时间，再订正一次。'
  return '先稳住词汇复习，每周接触听、读、写、译；让练习逐步覆盖不同题型。'
}
