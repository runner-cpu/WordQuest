import { cetPracticeMeta, type CetPracticeMeta } from '../data/cetPracticeIds'
import { db } from '../db/database'
import type { CetPracticeRecord } from '../types/model'

const CHECK_COUNT = 3

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** 连字符词与缩写按一个词计；数字和中文不计入英文词数。 */
export function countCetEnglishWords(text: string): number {
  return text.normalize('NFKC').match(/[a-z]+(?:['’\u002d][a-z]+)*/gi)?.length ?? 0
}

function validAnswers(value: unknown, meta: CetPracticeMeta): value is number[] {
  return Array.isArray(value) && Boolean(meta.optionCounts) && value.length === meta.optionCounts!.length &&
    [...value].every((answer, index) => Number.isInteger(answer) && answer >= 0 && answer < meta.optionCounts![index])
}

function validChecks(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === CHECK_COUNT && [...value].every((check) => check === true)
}

function requirePractice(id: string): CetPracticeMeta {
  const meta = cetPracticeMeta(id)
  if (!meta) throw new Error('未找到这道专项练习')
  return meta
}

function nextTimestamp(previous?: CetPracticeRecord): number {
  const now = Date.now()
  if (!timestamp(now)) throw new Error('当前时间无效，请检查设备时间')
  const next = Math.max(now, (previous?.updatedAt ?? -1) + 1)
  if (!timestamp(next)) throw new Error('练习时间无效，请检查设备时间')
  return next
}

function emptyRecord(meta: CetPracticeMeta, updatedAt: number): CetPracticeRecord {
  return { id: meta.id, examType: meta.examType, kind: meta.kind, draft: '', updatedAt, attempts: 0 }
}

/** 草稿以编辑时刻比较，延迟的自动保存不会覆盖新稿或已完成的提交。 */
export async function saveCetDraft(id: string, text: string, editedAt = Date.now()): Promise<CetPracticeRecord> {
  const meta = requirePractice(id)
  if (meta.kind === 'reading') throw new Error('阅读练习请提交完整答案')
  if (typeof text !== 'string' || !timestamp(editedAt)) throw new Error('草稿内容或保存时间无效')
  return db.transaction('rw', [db.cetPractice], async () => {
    const previous = await db.cetPractice.get(id)
    if (previous && editedAt <= previous.updatedAt) return previous
    const record: CetPracticeRecord = { ...(previous ?? emptyRecord(meta, editedAt)), draft: text, updatedAt: editedAt }
    await db.cetPractice.put(record)
    return record
  })
}

/** 保留首次答案，同时允许逐次重做订正；整份答案在一个事务内提交。 */
export async function submitCetReading(id: string, answers: number[]): Promise<CetPracticeRecord> {
  const meta = requirePractice(id)
  if (meta.kind !== 'reading' || !validAnswers(answers, meta)) throw new Error('请完成全部阅读题后再提交')
  const submitted = [...answers]
  return db.transaction('rw', [db.cetPractice], async () => {
    const previous = await db.cetPractice.get(id)
    const now = nextTimestamp(previous)
    const record: CetPracticeRecord = {
      ...(previous ?? emptyRecord(meta, now)),
      updatedAt: now,
      firstSubmittedAt: previous?.firstSubmittedAt ?? now,
      firstAnswers: previous?.firstAnswers ? [...previous.firstAnswers] : [...submitted],
      latestAnswers: [...submitted],
      submittedAt: now,
      completedAt: previous?.completedAt ?? now,
      attempts: (previous?.attempts ?? 0) + 1,
    }
    await db.cetPractice.put(record)
    return record
  })
}

/** 写作/翻译只记录学习者自查完成，不生成考试分数或词汇奖励。 */
export async function completeCetOutput(id: string, text: string, checks: boolean[]): Promise<CetPracticeRecord> {
  const meta = requirePractice(id)
  if (meta.kind === 'reading') throw new Error('阅读练习请提交完整答案')
  if (typeof text !== 'string' || countCetEnglishWords(text) < meta.minWords!) {
    throw new Error(`请先写下至少 ${meta.minWords} 个英文单词，再完成自查`)
  }
  if (!validChecks(checks)) throw new Error('请完成全部三项自查后再提交')
  const submittedChecks = [...checks]
  return db.transaction('rw', [db.cetPractice], async () => {
    const previous = await db.cetPractice.get(id)
    const now = nextTimestamp(previous)
    const record: CetPracticeRecord = {
      ...(previous ?? emptyRecord(meta, now)),
      draft: text,
      submittedText: text,
      checks: submittedChecks,
      updatedAt: now,
      submittedAt: now,
      completedAt: previous?.completedAt ?? now,
      attempts: (previous?.attempts ?? 0) + 1,
    }
    await db.cetPractice.put(record)
    return record
  })
}

/** 校验备份中的完整档案；坏行在任何表写入前拒绝，避免伪造完成态。 */
export function isCetPracticeRecord(value: unknown): value is CetPracticeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const meta = cetPracticeMeta(row.id)
  if (!meta || row.examType !== meta.examType || row.kind !== meta.kind || typeof row.draft !== 'string' ||
    !timestamp(row.updatedAt) || typeof row.attempts !== 'number' || !Number.isSafeInteger(row.attempts) || row.attempts < 0) return false
  const submittedFields = [row.submittedAt, row.completedAt]
  if (row.attempts === 0) {
    return [...submittedFields, row.firstSubmittedAt, row.firstAnswers, row.latestAnswers, row.submittedText, row.checks]
      .every((field) => field === undefined) && (meta.kind !== 'reading' || row.draft === '')
  }
  if (!timestamp(row.submittedAt) || !timestamp(row.completedAt) ||
    row.completedAt > row.submittedAt || row.submittedAt > row.updatedAt) return false
  if (meta.kind === 'reading') {
    return row.draft === '' && timestamp(row.firstSubmittedAt) && row.firstSubmittedAt <= row.completedAt &&
      validAnswers(row.firstAnswers, meta) && validAnswers(row.latestAnswers, meta) &&
      row.submittedText === undefined && row.checks === undefined
  }
  return row.firstSubmittedAt === undefined && row.firstAnswers === undefined && row.latestAnswers === undefined &&
    typeof row.submittedText === 'string' && countCetEnglishWords(row.submittedText) >= meta.minWords! && validChecks(row.checks)
}

/** 草稿、最近提交、首次阅读答案各按自己的时间合并；导入不累加尝试次数。 */
export function mergeCetPracticeRecords(local: CetPracticeRecord | undefined, incoming: CetPracticeRecord): CetPracticeRecord {
  const newest = !local || incoming.updatedAt > local.updatedAt ? incoming : local
  const submission = local?.submittedAt === undefined ||
    (incoming.submittedAt !== undefined && incoming.submittedAt > local.submittedAt) ? incoming : local
  const first = local?.firstSubmittedAt === undefined ||
    (incoming.firstSubmittedAt !== undefined && incoming.firstSubmittedAt < local.firstSubmittedAt) ? incoming : local
  const completed = [local?.completedAt, incoming.completedAt].filter((time): time is number => time !== undefined)
  const record: CetPracticeRecord = {
    id: incoming.id,
    examType: incoming.examType,
    kind: incoming.kind,
    draft: newest.draft,
    updatedAt: Math.max(local?.updatedAt ?? incoming.updatedAt, incoming.updatedAt),
    attempts: Math.max(local?.attempts ?? 0, incoming.attempts),
    ...(completed.length ? { completedAt: Math.min(...completed) } : {}),
  }
  if (submission.submittedAt !== undefined) {
    record.submittedAt = submission.submittedAt
    if (incoming.kind === 'reading') record.latestAnswers = [...submission.latestAnswers!]
    else {
      record.submittedText = submission.submittedText
      record.checks = [...submission.checks!]
    }
  }
  if (incoming.kind === 'reading' && first.firstSubmittedAt !== undefined) {
    record.firstSubmittedAt = first.firstSubmittedAt
    record.firstAnswers = [...first.firstAnswers!]
  }
  return record
}
