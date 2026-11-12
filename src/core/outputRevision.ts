import type { OutputReason, OutputRevision } from '../types/outputRevision'

export const OUTPUT_REASONS: readonly { id: OutputReason; label: string }[] = [
  { id: 'tense', label: '时态' }, { id: 'agreement', label: '主谓一致' },
  { id: 'article', label: '冠词' }, { id: 'plural', label: '单复数' },
  { id: 'spelling', label: '拼写' }, { id: 'collocation', label: '搭配' },
  { id: 'omission', label: '遗漏信息' }, { id: 'cohesion', label: '段落衔接' },
]

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validChecks(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === 3 && [...value].every((check) => typeof check === 'boolean')
}

function nextTime(previous: number, at: number): number {
  const next = Math.max(previous + 1, at)
  if (!validTime(at) || !validTime(next)) throw new Error('修订保存时间无效，请检查设备时间')
  return next
}

export function emptyOutputRevision(now = Date.now()): OutputRevision {
  if (!validTime(now)) throw new Error('修订保存时间无效')
  return { text: '', reasons: [], initialChecks: [false, false, false], revisionChecks: [false, false, false], updatedAt: now }
}

export function isOutputRevision(value: unknown): value is OutputRevision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const keys = ['text', 'reasons', 'initialChecks', 'revisionChecks', 'initialCheckedText', 'revisionCheckedText', 'updatedAt']
  if (Object.keys(row).some((key) => !keys.includes(key)) || typeof row.text !== 'string' ||
    !validTime(row.updatedAt) || !Array.isArray(row.reasons) ||
    ![...row.reasons].every((reason) => OUTPUT_REASONS.some((entry) => entry.id === reason)) ||
    new Set(row.reasons).size !== row.reasons.length || !validChecks(row.initialChecks) || !validChecks(row.revisionChecks)) return false
  for (const version of ['initial', 'revision'] as const) {
    const checks = row[`${version}Checks`] as boolean[]
    const snapshot = row[`${version}CheckedText`]
    if (snapshot !== undefined && typeof snapshot !== 'string') return false
    if (checks.every(Boolean) && (typeof snapshot !== 'string' || (version === 'revision' && snapshot !== row.text))) return false
    if (!checks.every(Boolean) && snapshot !== undefined) return false
  }
  return true
}

export function outputRevisionEqual(a: OutputRevision | undefined, b: OutputRevision | undefined): boolean {
  if (!a || !b) return a === b
  return a.text === b.text && a.updatedAt === b.updatedAt && a.initialCheckedText === b.initialCheckedText &&
    a.revisionCheckedText === b.revisionCheckedText && a.reasons.length === b.reasons.length &&
    a.reasons.every((reason, index) => reason === b.reasons[index]) &&
    a.initialChecks.every((check, index) => check === b.initialChecks[index]) &&
    a.revisionChecks.every((check, index) => check === b.revisionChecks[index])
}

export function editOutputRevision(previous: OutputRevision | undefined, patch: { text?: string; reasons?: OutputReason[] }, at = Date.now()): OutputRevision {
  const before = previous ?? emptyOutputRevision(at)
  const next = structuredClone({ ...before, ...patch, updatedAt: nextTime(before.updatedAt, at) })
  if (next.text !== before.text) {
    next.revisionChecks = [false, false, false]
    delete next.revisionCheckedText
  }
  if (!isOutputRevision(next)) throw new Error('修订内容或修改原因无效')
  return next
}

export function setOutputChecks(previous: OutputRevision | undefined, version: 'initial' | 'revision', text: string, checks: boolean[], at = Date.now()): OutputRevision {
  if (typeof text !== 'string' || !validChecks(checks)) throw new Error('请核对三项自查内容')
  const before = previous ?? emptyOutputRevision(at)
  const next = structuredClone(before)
  next[`${version}Checks`] = [...checks]
  if (checks.every(Boolean)) next[`${version}CheckedText`] = text
  else delete next[`${version}CheckedText`]
  next.updatedAt = nextTime(before.updatedAt, at)
  if (!isOutputRevision(next)) throw new Error('自查快照与当前修订文字不一致')
  return next
}

/** 初稿继续输入会取消该版的部分或全部勾选，修订稿自身的自查保留。 */
export function invalidateInitialChecks(previous: OutputRevision | undefined, initialText: string, at = Date.now()): OutputRevision | undefined {
  if (!previous || (!previous.initialChecks.some(Boolean) && previous.initialCheckedText === undefined) ||
    previous.initialCheckedText === initialText) return previous
  const next = structuredClone(previous)
  next.initialChecks = [false, false, false]
  delete next.initialCheckedText
  next.updatedAt = nextTime(previous.updatedAt, at)
  return next
}

/** 字段缺失表示旧备份，不删除本机修订；每份修订按自己的保存时间合并。 */
export function mergeOutputRevisions(local: OutputRevision | undefined, incoming: OutputRevision | undefined): OutputRevision | undefined {
  const selected = !local || (incoming && incoming.updatedAt > local.updatedAt) ? incoming : local
  return selected ? structuredClone(selected) : undefined
}

/** 空行区分段落；PDF 复制文本中的单换行视作段内软换行。 */
export function splitOutputParagraphs(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n/u).map((paragraph) => paragraph.replace(/\s*\r?\n\s*/gu, ' ').trim()).filter(Boolean)
}

function referenceParts(text: string): { text: string; paragraphIndex: number }[] {
  return splitOutputParagraphs(text).flatMap((paragraph, paragraphIndex) =>
    paragraph.split(/(?<=[.!?。！？])\s+(?=\S)/u).map((text) => ({ text: text.trim(), paragraphIndex })).filter((row) => row.text))
}

export function splitReferenceSentences(text: string): string[] {
  return referenceParts(text).map((part) => part.text)
}

export interface ReferenceDraftTarget {
  status: 'position' | 'fallback'
  paragraphIndex: number | null
  paragraphText: string | null
  message: string
}

/** 不推断语义对应：只在段落数一致时按位置定位，否则请学习者手动对照。 */
export function mapReferenceToDraft(reference: string, draft: string, referenceIndex: number): ReferenceDraftTarget {
  const source = referenceParts(reference)
  const target = splitOutputParagraphs(draft)
  const selected = Number.isInteger(referenceIndex) ? source[referenceIndex] : undefined
  if (!selected || !target.length || splitOutputParagraphs(reference).length !== target.length) {
    return { status: 'fallback', paragraphIndex: null, paragraphText: null, message: '段落数量不同或缺少文本，请手动选择要核对的段落；系统不判断内容是否对应。' }
  }
  return { status: 'position', paragraphIndex: selected.paragraphIndex, paragraphText: target[selected.paragraphIndex], message: '仅按段落顺序定位，请自行核对内容对应；这不是自动评分。' }
}
