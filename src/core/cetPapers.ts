import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import { db } from '../db/database'
import type { CetPaperFileKind, CetPaperFileRef, CetPaperScope, CetPaperStudy, CetPaperSubmission } from '../types/cetPaper'
import type { CetRewardProgress, CetRewardQuestionProgress } from '../types/model'
import { CET_READY_PAPERS, loadReadyCetPaper } from './cetReadyPapers'
import { addCetPaperReward, cetRewardQuestionKey, emptyCetPaperRewards, mergeCetRewardProgress, type CetPaperRewards } from './cetRewards'
import { bumpDaily, ensureProfile, patchProfile } from './profile'
import { invalidateInitialChecks, isOutputRevision, mergeOutputRevisions, outputRevisionEqual } from './outputRevision'

const QUESTION_COUNT = 55
export function cetPaperQuestionNumbers(scope: CetPaperScope = 'all'): number[] {
  const start = scope === 'reading' ? 26 : 1
  const end = scope === 'listening' ? 25 : QUESTION_COUNT
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function cetPaperSubmissions(study: CetPaperStudy, scope: CetPaperScope = 'all') {
  const pair = scope === 'all' ? undefined : study.sectionSubmissions?.[scope]
  const numbers = cetPaperQuestionNumbers(scope)
  const applicable = (submission?: CetPaperSubmission) => submission && numbers.some((number) => submission.answers[number - 1] && submission.answerKey[number - 1]) ? submission : undefined
  return { first: pair?.first ?? applicable(study.firstSubmission), latest: pair?.latest ?? applicable(study.latestSubmission) }
}
const FILE_KINDS: CetPaperFileKind[] = ['paper', 'answers', 'audio']
const PDF_LIMIT = 30 * 1024 * 1024
const AUDIO_LIMIT = 60 * 1024 * 1024
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac'])
const PATCH_KEYS = ['variant', 'answers', 'answerKey', 'writingDraft', 'translationDraft', 'notes', 'elapsedSeconds', 'writingRevision', 'translationRevision'] as const
type StudyPatch = Partial<Pick<CetPaperStudy, typeof PATCH_KEYS[number]>>

export class CetDraftConflict extends Error {
  constructor(public current: CetPaperStudy) {
    super('另一页面修改了同一道题或同一份草稿。本页输入已保留，请选择如何处理冲突。')
  }
}

/** Merge only locally changed fields and question slots; never replace unrelated edits. */
export function mergeCetDraft(previous: CetPaperStudy, base: StudyPatch, patch: StudyPatch): StudyPatch {
  const merged: StudyPatch = {}
  for (const key of PATCH_KEYS) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (key === 'answers' || key === 'answerKey') {
      const before = base[key]
      const next = value as string[]
      if (!before) throw new Error('缺少草稿原始版本')
      merged[key] = previous[key].map((remote, index) => {
        if (next[index] === before[index]) return remote
        if (remote !== before[index] && remote !== next[index]) throw new CetDraftConflict(previous)
        return next[index]
      })
    } else if (key === 'writingRevision' || key === 'translationRevision') {
      const next = patch[key]
      // Missing optional fields come from older editors; they never erase a saved revision.
      if (next === undefined || outputRevisionEqual(next, base[key])) continue
      if (!outputRevisionEqual(previous[key], base[key]) && !outputRevisionEqual(previous[key], next)) throw new CetDraftConflict(previous)
      merged[key] = structuredClone(next)
    } else if (value !== base[key]) {
      if (previous[key] !== base[key] && previous[key] !== value) throw new CetDraftConflict(previous)
      Object.assign(merged, { [key]: value })
    }
  }
  return merged
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function nextTimestamp(previous = -1): number {
  const now = Date.now()
  const next = Math.max(now, previous + 1)
  if (!timestamp(now) || !timestamp(next)) throw new Error('保存时间无效，请检查设备时间')
  return next
}

function knownSource(sourceId: unknown): sourceId is string {
  return typeof sourceId === 'string' && CET_PAPER_SOURCES.some((source) => source.id === sourceId)
}

function validChoice(choice: unknown, index: number): choice is string {
  if (choice === '') return true
  const maximum = index >= 25 && index < 35 ? 'O' : index >= 35 && index < 45 ? 'Z' : 'D'
  return typeof choice === 'string' && choice.length === 1 && choice >= 'A' && choice <= maximum
}

function validAnswers(answers: unknown): answers is string[] {
  return Array.isArray(answers) && answers.length === QUESTION_COUNT &&
    [...answers].every((answer, index) => validChoice(answer, index))
}

function cloneSubmission(submission: CetPaperSubmission): CetPaperSubmission {
  return { answers: [...submission.answers], answerKey: [...submission.answerKey], submittedAt: submission.submittedAt }
}

function validSubmission(value: unknown): value is CetPaperSubmission {
  if (!record(value) || !timestamp(value.submittedAt) || !validAnswers(value.answers) || !validAnswers(value.answerKey)) return false
  const key = value.answerKey
  return value.answers.some((answer, index) => answer !== '' && key[index] !== '')
}

function validPair(first: unknown, latest: unknown, createdAt: number, updatedAt: number): boolean {
  if (first === undefined && latest === undefined) return true
  return validSubmission(first) && validSubmission(latest) &&
    createdAt <= first.submittedAt && first.submittedAt <= latest.submittedAt && latest.submittedAt <= updatedAt &&
    (first.submittedAt !== latest.submittedAt || first.answers.every((answer, index) =>
      answer === latest.answers[index] && first.answerKey[index] === latest.answerKey[index]))
}

function validFileRef(value: unknown, studyId: string, kind: CetPaperFileKind): value is CetPaperFileRef {
  if (!record(value) || typeof value.id !== 'string' || !value.id.startsWith(`cet-paper:${studyId}:${kind}:`) ||
    value.id.length <= `cet-paper:${studyId}:${kind}:`.length || typeof value.name !== 'string' || !value.name.trim() ||
    value.name.length > 512 || typeof value.type !== 'string' || !timestamp(value.size) || value.size === 0) return false
  return kind === 'audio' ? AUDIO_TYPES.has(value.type) && value.size <= AUDIO_LIMIT :
    value.type === 'application/pdf' && value.size <= PDF_LIMIT
}

/** 备份写入前校验完整档案和文件引用，拒绝未知来源及伪造提交。 */
export function isCetPaperStudy(value: unknown): value is CetPaperStudy {
  if (!record(value) || typeof value.id !== 'string' || !/^cet-paper-[\w-]+$/.test(value.id) ||
    !knownSource(value.sourceId) || typeof value.variant !== 'string' || value.variant.length > 200 ||
    (value.paperRevision !== undefined && (typeof value.paperRevision !== 'string' || !/^[a-f0-9]{16}$/.test(value.paperRevision))) ||
    !timestamp(value.createdAt) || !timestamp(value.updatedAt) || value.createdAt > value.updatedAt ||
    !validAnswers(value.answers) || !validAnswers(value.answerKey) ||
    typeof value.writingDraft !== 'string' || typeof value.translationDraft !== 'string' || typeof value.notes !== 'string' ||
    !timestamp(value.elapsedSeconds) || !record(value.files) ||
    Object.keys(value.files).some((kind) => !FILE_KINDS.includes(kind as CetPaperFileKind) ||
      !validFileRef((value.files as Record<string, unknown>)[kind], value.id as string, kind as CetPaperFileKind))) return false
  if (value.correctionEvidence !== undefined) {
    if (!value.paperRevision || !record(value.correctionEvidence) || !Object.entries(value.correctionEvidence).every(([number, evidence]) =>
      /^(?:[1-9]|[1-4][0-9]|5[0-5])$/.test(number) && record(evidence) &&
      typeof evidence.text === 'string' && Boolean(evidence.text.trim()) && evidence.text.length <= 10_000 &&
      timestamp(evidence.previousSubmittedAt) && timestamp(evidence.recordedAt) &&
      (value.createdAt as number) <= evidence.previousSubmittedAt && evidence.previousSubmittedAt < evidence.recordedAt && evidence.recordedAt <= (value.updatedAt as number))) return false
  }
  for (const [key, draft] of [['writingRevision', 'writingDraft'], ['translationRevision', 'translationDraft']] as const) {
    const revision = value[key]
    if (revision !== undefined && (!isOutputRevision(revision) || revision.updatedAt < value.createdAt ||
      revision.updatedAt > value.updatedAt || (revision.initialChecks.every(Boolean) && revision.initialCheckedText !== value[draft]))) return false
  }
  if (!validPair(value.firstSubmission, value.latestSubmission, value.createdAt, value.updatedAt)) return false
  if (value.sectionSubmissions === undefined) return true
  if (!record(value.sectionSubmissions)) return false
  return Object.entries(value.sectionSubmissions).every(([scope, pair]) => {
    if ((scope !== 'listening' && scope !== 'reading') || !record(pair) || !pair.first || !pair.latest ||
      !validPair(pair.first, pair.latest, value.createdAt as number, value.updatedAt as number)) return false
    const indexes = new Set(cetPaperQuestionNumbers(scope).map((number) => number - 1))
    return [pair.first, pair.latest].every((submission) => validSubmission(submission) &&
      submission.answers.every((answer, index) => indexes.has(index) || (answer === '' && submission.answerKey[index] === '')))
  })
}

async function requireStudy(id: string): Promise<CetPaperStudy> {
  if (typeof id !== 'string') throw new Error('未找到真题学习档案')
  const study = await db.cetPapers.get(id)
  if (!study || !isCetPaperStudy(study)) throw new Error('未找到有效的真题学习档案')
  return study
}

export async function createCetPaperStudy(sourceId: string, variant = '', answerKey?: string[], paperRevision?: string): Promise<CetPaperStudy> {
  if (!knownSource(sourceId)) throw new Error('未找到这份公开真题来源')
  if (typeof variant !== 'string' || variant.length > 200) throw new Error('套卷名称须在 200 字以内')
  if (answerKey !== undefined && (!validAnswers(answerKey) || answerKey.some((answer) => !answer))) throw new Error('内置参考答案不完整')
  if (paperRevision !== undefined && (!/^[a-f0-9]{16}$/.test(paperRevision) || !answerKey)) throw new Error('内置题目版本无效')
  const now = nextTimestamp()
  const study: CetPaperStudy = {
    id: `cet-paper-${crypto.randomUUID()}`, sourceId, variant, createdAt: now, updatedAt: now,
    answers: Array<string>(QUESTION_COUNT).fill(''), answerKey: answerKey ? [...answerKey] : Array<string>(QUESTION_COUNT).fill(''),
    writingDraft: '', translationDraft: '', notes: '', elapsedSeconds: 0, files: {},
  }
  if (paperRevision) study.paperRevision = paperRevision
  await db.cetPapers.add(study)
  return structuredClone(study)
}

/** 编辑时刻早于当前档案的自动保存不会覆盖新稿、提交或文件导入。 */
export async function saveCetPaperStudy(id: string, patch: StudyPatch, editedAt?: number, base?: StudyPatch): Promise<CetPaperStudy> {
  if (!record(patch) || Object.keys(patch).some((key) => !(PATCH_KEYS as readonly string[]).includes(key)) ||
    (editedAt !== undefined && !timestamp(editedAt))) throw new Error('档案内容或保存时间无效')
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const value = patch[key]
    if (key === 'answers' || key === 'answerKey') {
      if (!validAnswers(value)) throw new Error('答案必须包含 55 个有效选项或空白')
    } else if (key === 'elapsedSeconds') {
      if (!timestamp(value)) throw new Error('学习时长无效')
    } else if (key === 'writingRevision' || key === 'translationRevision') {
      if (value !== undefined && !isOutputRevision(value)) throw new Error('修订稿、修改原因或自查记录无效')
    } else if (typeof value !== 'string' || (key === 'variant' && value.length > 200)) {
      throw new Error('草稿或套卷名称无效')
    }
  }
  const copiedPatch = structuredClone(patch)
  return db.transaction('rw', [db.cetPapers], async () => {
    const previous = await requireStudy(id)
    if (!base && editedAt !== undefined && editedAt <= previous.updatedAt) return previous
    const updatedAt = base ? nextTimestamp(previous.updatedAt) : editedAt ?? nextTimestamp(previous.updatedAt)
    const applied = base ? mergeCetDraft(previous, base, copiedPatch) : copiedPatch
    for (const key of ['writingRevision', 'translationRevision'] as const) {
      const revision = applied[key]
      if (revision === undefined || (!base && previous[key] && revision.updatedAt <= previous[key]!.updatedAt)) delete applied[key]
      else applied[key] = { ...revision, updatedAt }
    }
    const study: CetPaperStudy = { ...previous, ...applied, updatedAt }
    for (const [key, draft] of [['writingRevision', 'writingDraft'], ['translationRevision', 'translationDraft']] as const) {
      if (study[draft] !== previous[draft]) {
        const revision = invalidateInitialChecks(study[key], study[draft], updatedAt)
        if (revision) study[key] = { ...revision, updatedAt }
      }
    }
    if (!isCetPaperStudy(study)) throw new Error('修订稿与当前初稿或保存时间不一致，请重新核对')
    await db.cetPapers.put(study)
    return structuredClone(study)
  })
}

/** 类型、体积与文件头一起核验，避免把改扩展名的文件当成 PDF 或录音。 */
export async function validateCetPaperFile(kind: CetPaperFileKind, file: Blob): Promise<void> {
  if (!FILE_KINDS.includes(kind) || !(file instanceof Blob) || !timestamp(file.size) || file.size === 0) {
    throw new Error('请选择有效的 PDF 文档或听力录音')
  }
  const audio = kind === 'audio'
  const limit = audio ? AUDIO_LIMIT : PDF_LIMIT
  if (file.size > limit) throw new Error(audio ? '听力录音不能超过 60 MB' : 'PDF 文档不能超过 30 MB')
  if (audio ? !AUDIO_TYPES.has(file.type) : file.type !== 'application/pdf') {
    throw new Error(audio ? '请选择支持的听力音频格式' : '试卷与答案须使用 PDF 文档')
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const starts = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte)
  const text = (signature: string, offset = 0) => starts([...signature].map((char) => char.charCodeAt(0)), offset)
  let valid = text('%PDF-')
  if (audio) {
    switch (file.type) {
      case 'audio/mpeg': case 'audio/mp3': valid = text('ID3') || (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0); break
      case 'audio/wav': case 'audio/x-wav': case 'audio/wave': valid = text('RIFF') && text('WAVE', 8); break
      case 'audio/ogg': valid = text('OggS'); break
      case 'audio/webm': valid = starts([0x1a, 0x45, 0xdf, 0xa3]); break
      case 'audio/mp4': case 'audio/x-m4a': valid = text('ftyp', 4); break
      case 'audio/aac': valid = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0; break
      case 'audio/flac': case 'audio/x-flac': valid = text('fLaC'); break
      default: valid = false
    }
  }
  if (!valid) throw new Error('文件内容与所选格式不符，请检查原文件')
}

/** 文件替换与引用更新在同一事务内完成，失败时保留旧文件。 */
export async function attachCetPaperFile(id: string, kind: CetPaperFileKind, file: File): Promise<CetPaperStudy> {
  if (!(file instanceof File) || !file.name.trim() || file.name.length > 512) throw new Error('请选择有效文件')
  await validateCetPaperFile(kind, file)
  return db.transaction('rw', [db.cetPapers, db.media], async () => {
    const previous = await requireStudy(id)
    const ref: CetPaperFileRef = { id: `cet-paper:${id}:${kind}:${crypto.randomUUID()}`, name: file.name, type: file.type, size: file.size }
    const study: CetPaperStudy = {
      ...previous, updatedAt: nextTimestamp(previous.updatedAt), files: { ...previous.files, [kind]: ref },
    }
    await db.media.add({ id: ref.id, blob: file })
    await db.cetPapers.put(study)
    const old = previous.files[kind]
    if (old) await db.media.delete(old.id)
    return structuredClone(study)
  })
}

export async function submitCetPaperStudy(id: string, scope: CetPaperScope = 'all'): Promise<CetPaperStudy> {
  if (!['all', 'listening', 'reading'].includes(scope)) throw new Error('练习范围无效')
  return db.transaction('rw', [db.cetPapers], async () => {
    const previous = await requireStudy(id)
    const study = submittedStudy(previous, scope)
    await db.cetPapers.put(study)
    return structuredClone(study)
  })
}

function submittedStudy(previous: CetPaperStudy, scope: CetPaperScope, after = previous.updatedAt): CetPaperStudy {
  const indexes = new Set(cetPaperQuestionNumbers(scope).map(number => number - 1))
  if (!previous.answers.some((answer, index) => indexes.has(index) && answer !== '' && previous.answerKey[index] !== '')) {
    throw new Error('请至少选择一道题的答案，并录入该题的参考答案后核对')
  }
  const submittedAt = nextTimestamp(Math.max(previous.updatedAt, after))
  const mask = (values: string[]) => values.map((value, index) => indexes.has(index) ? value : '')
  const submission: CetPaperSubmission = { answers: mask(previous.answers), answerKey: mask(previous.answerKey), submittedAt }
  const study: CetPaperStudy = { ...previous, updatedAt: submittedAt }
  if (scope === 'all') {
    study.firstSubmission = cloneSubmission(previous.firstSubmission ?? submission)
    study.latestSubmission = cloneSubmission(submission)
  } else {
    const legacyFirst = previous.firstSubmission
    const inherited = legacyFirst && legacyFirst.answers.some((answer, index) => indexes.has(index) && answer && legacyFirst.answerKey[index])
      ? { answers: mask(legacyFirst.answers), answerKey: mask(legacyFirst.answerKey), submittedAt: legacyFirst.submittedAt } : undefined
    study.sectionSubmissions = { ...previous.sectionSubmissions, [scope]: {
      first: cloneSubmission(previous.sectionSubmissions?.[scope]?.first ?? inherited ?? submission), latest: cloneSubmission(submission),
    } }
  }
  return study
}

function allSubmissions(study: CetPaperStudy): CetPaperSubmission[] {
  return [study.firstSubmission, study.latestSubmission,
    study.sectionSubmissions?.listening?.first, study.sectionSubmissions?.listening?.latest,
    study.sectionSubmissions?.reading?.first, study.sectionSubmissions?.reading?.latest]
    .filter((submission): submission is CetPaperSubmission => submission !== undefined)
}

function latestQuestionSubmission(study: CetPaperStudy, number: number): CetPaperSubmission | undefined {
  return allSubmissions(study).filter(submission => submission.answers[number - 1] && submission.answerKey[number - 1])
    .reduce<CetPaperSubmission | undefined>((latest, submission) => !latest || submission.submittedAt > latest.submittedAt ? submission : latest, undefined)
}

/** 显式登记单题依据。公共 notes 与草稿保持独立，双标签更新可用 expectedText 检查冲突。 */
export async function recordCetCorrectionEvidence(id: string, number: number, text: string, expectedText?: string): Promise<CetPaperStudy> {
  if (!Number.isInteger(number) || number < 1 || number > QUESTION_COUNT || typeof text !== 'string' || !text.trim() || text.length > 10_000 ||
    (expectedText !== undefined && typeof expectedText !== 'string')) throw new Error('请填写有效题号和本题订正依据')
  return db.transaction('rw', [db.cetPapers], async () => {
    const previous = await requireStudy(id)
    const latest = latestQuestionSubmission(previous, number)
    if (!previous.paperRevision || !latest || latest.answers[number - 1] === latest.answerKey[number - 1]) throw new Error('请先核对这道题的错误答案，再保存订正依据')
    if (expectedText !== undefined && (previous.correctionEvidence?.[number]?.text ?? '') !== expectedText) throw new CetDraftConflict(previous)
    const recordedAt = nextTimestamp(previous.updatedAt)
    const study: CetPaperStudy = { ...previous, updatedAt: recordedAt, correctionEvidence: { ...previous.correctionEvidence,
      [number]: { text: text.trim(), recordedAt, previousSubmittedAt: latest.submittedAt },
    } }
    await db.cetPapers.put(study)
    return structuredClone(study)
  })
}

/** 用已有核对记录建立不补奖的基线，也覆盖奖励功能启用前的其他同卷档案。 */
function legacyRewardBaseline(studies: CetPaperStudy[], sourceId: string, paperRevision: string, answerKey: string[], recorded: CetRewardProgress = {}): CetRewardProgress {
  const baseline: CetRewardProgress = {}
  const submissions = studies.filter(study => study.sourceId === sourceId && study.paperRevision === paperRevision && isCetPaperStudy(study))
    .flatMap(allSubmissions).sort((a, b) => a.submittedAt - b.submittedAt)
  for (const submission of submissions) {
    submission.answers.forEach((answer, index) => {
      if (!answer || !submission.answerKey[index]) return
      const key = cetRewardQuestionKey(sourceId, paperRevision, index + 1)
      const state = answer === answerKey[index] ? 'correct' : 'wrong'
      const prior = baseline[key]
      const row: CetRewardQuestionProgress = prior ?? { sourceId, paperRevision, number: index + 1,
        first: state, firstSubmittedAt: submission.submittedAt, last: state, lastSubmittedAt: submission.submittedAt, paid: {} }
      row.last = state
      row.lastSubmittedAt = submission.submittedAt
      if (row.first === 'correct') row.paid.firstCorrect = 0
      else if (state === 'correct') { row.paid.correction = 0; row.paid.evidence = 0 }
      baseline[key] = row
    })
  }
  for (const [key, row] of Object.entries(baseline)) {
    const prior = recorded[key]
    // 已在奖励事务中登记过的历史无需再消费尚未满足条件的奖励 kind。
    if (prior && prior.firstSubmittedAt <= row.firstSubmittedAt && prior.lastSubmittedAt >= row.lastSubmittedAt) row.paid = {}
  }
  return baseline
}

/** 只为通过内容散列校验的当前站内版本结算；三处写入共享事务，任何一步失败都会回滚。 */
export async function submitRewardedCetPaperStudy(id: string, scope: CetPaperScope = 'all'): Promise<{ study: CetPaperStudy; rewards: CetPaperRewards }> {
  if (!['all', 'listening', 'reading'].includes(scope)) throw new Error('练习范围无效')
  const initial = await requireStudy(id)
  const entry = CET_READY_PAPERS.find(candidate => candidate.sourceId === initial.sourceId && candidate.revision === initial.paperRevision)
  if (!entry) throw new Error('只有当前站内真题版本可以结算学习奖励')
  // 网络、解析和散列运算全部在事务外完成，避免 IndexedDB 事务跨异步网络等待失效。
  const paper = await loadReadyCetPaper(initial.sourceId)
  const canonicalKey = [...paper.answerKey]
  const verify = (study: CetPaperStudy) => {
    if (study.sourceId !== initial.sourceId || study.paperRevision !== entry.revision ||
      !study.answerKey.every((answer, index) => answer === canonicalKey[index])) throw new Error('题目版本或参考答案已更改，请重新打开站内真题后核对')
  }
  verify(initial)
  return db.transaction('rw', [db.cetPapers, db.profile, db.dailyLogs], async () => {
    const previous = await requireStudy(id)
    verify(previous)
    const profile = await ensureProfile()
    const baseline = legacyRewardBaseline(await db.cetPapers.toArray(), initial.sourceId, entry.revision, canonicalKey, profile.cetRewardProgress)
    const progress = mergeCetRewardProgress(profile.cetRewardProgress, baseline)
    const latestGlobalAt = Object.values(progress).reduce((latest, row) =>
      row.sourceId === initial.sourceId && row.paperRevision === entry.revision ? Math.max(latest, row.lastSubmittedAt) : latest, previous.updatedAt)
    const study = submittedStudy(previous, scope, latestGlobalAt)
    const rewards = emptyCetPaperRewards()
    for (const number of cetPaperQuestionNumbers(scope)) {
      const answer = previous.answers[number - 1]
      if (!answer) continue
      const correct = answer === canonicalKey[number - 1]
      const key = cetRewardQuestionKey(initial.sourceId, entry.revision, number)
      const prior = progress[key]
      const row: CetRewardQuestionProgress = prior ?? { sourceId: initial.sourceId, paperRevision: entry.revision, number,
        first: correct ? 'correct' : 'wrong', firstSubmittedAt: study.updatedAt,
        last: correct ? 'correct' : 'wrong', lastSubmittedAt: study.updatedAt, paid: {} }
      const pay = (kind: 'firstCorrect' | 'correction' | 'evidence') => {
        if (row.paid[kind] !== undefined) return
        row.paid[kind] = study.updatedAt
        addCetPaperReward(rewards, kind)
      }
      if (!prior && correct) pay('firstCorrect')
      if (prior && prior.first === 'wrong' && correct) {
        pay('correction')
        const evidence = previous.correctionEvidence?.[number]
        if (prior.last === 'wrong' && evidence?.text.trim() && evidence.previousSubmittedAt === prior.lastSubmittedAt &&
          evidence.recordedAt > prior.lastSubmittedAt && evidence.recordedAt < study.updatedAt) pay('evidence')
      }
      row.last = correct ? 'correct' : 'wrong'
      row.lastSubmittedAt = study.updatedAt
      progress[key] = row
    }
    await db.cetPapers.put(study)
    await bumpDaily({ xp: rewards.xp, coinsEarned: rewards.coins })
    await patchProfile({ xp: profile.xp + rewards.xp, coins: profile.coins + rewards.coins, cetRewardProgress: progress })
    return { study: structuredClone(study), rewards }
  })
}

/** 支持按顺序粘贴字母，或用 1.A / 26 O 等单题编号录入部分答案。 */
export function parseCetAnswerKey(text: string): { answers: string[]; errors: string[] } {
  const answers = Array<string>(QUESTION_COUNT).fill('')
  const errors: string[] = []
  if (typeof text !== 'string') return { answers, errors: ['答案须为文字'] }
  const normalized = text.normalize('NFKC').toUpperCase().trim()
  if (!normalized) return { answers, errors }
  const set = (index: number, answer: string) => {
    if (!Number.isInteger(index) || index < 0 || index >= QUESTION_COUNT) errors.push('题号须在 1–55 之间')
    else if (!validChoice(answer, index)) errors.push(`第 ${index + 1} 题的选项超出范围`)
    else answers[index] = answer
  }
  if (/\d/.test(normalized)) {
    const seen = new Set<number>()
    const remaining = normalized.replace(/(\d+)\s*[.、:=)\-]?\s*([A-Z])/g, (_match, question: string, answer: string) => {
      const index = Number(question) - 1
      if (seen.has(index)) errors.push(`第 ${index + 1} 题重复录入`)
      else { seen.add(index); set(index, answer) }
      return ''
    }).replace(/[\s,;|/、。]+/g, '')
    if (remaining) errors.push('存在无法识别的内容，请使用单题编号与选项，例如 1.A 26.O')
  } else {
    const choices = normalized.replace(/[\s,;|/、。]+/g, '')
    if (!/^[A-Z]+$/.test(choices)) errors.push('答案仅可包含选项字母或单题编号')
    else if (choices.length > QUESTION_COUNT) errors.push('答案不能超过 55 题')
    else [...choices].forEach((answer, index) => set(index, answer))
  }
  return { answers, errors }
}

/** 仅核对已选且有答案键的题；未作答独立计数，不计入正确或错题。 */
export function cetPaperResult(submission?: CetPaperSubmission, scope: CetPaperScope = 'all'): { correct: number; compared: number; unanswered: number; wrong: number[] } {
  const numbers = cetPaperQuestionNumbers(scope)
  if (!submission) return { correct: 0, compared: 0, unanswered: numbers.length, wrong: [] }
  let correct = 0
  let compared = 0
  let unanswered = 0
  const wrong: number[] = []
  for (const number of numbers) {
    const index = number - 1
    const answer = submission.answers[index]
    const key = submission.answerKey[index]
    if (!answer) unanswered++
    if (!key || !answer) continue
    compared++
    if (answer === key) correct++
    else wrong.push(index + 1)
  }
  return { correct, compared, unanswered, wrong }
}

/** 草稿取更新的一份；首次和最近核对快照独立合并，保留原始学习历史。 */
export function mergeCetPaperStudies(local: CetPaperStudy | undefined, incoming: CetPaperStudy): CetPaperStudy {
  if (local && (local.id !== incoming.id || local.sourceId !== incoming.sourceId || local.paperRevision !== incoming.paperRevision)) throw new Error('真题档案来源或题目版本冲突')
  const newer = !local || incoming.updatedAt > local.updatedAt ? incoming : local
  const older = newer === incoming ? local : incoming
  const submissions = [local?.firstSubmission, local?.latestSubmission, incoming.firstSubmission, incoming.latestSubmission]
    .filter((submission): submission is CetPaperSubmission => submission !== undefined)
  const first = submissions.reduce<CetPaperSubmission | undefined>((earliest, submission) =>
    !earliest || submission.submittedAt < earliest.submittedAt ? submission : earliest, undefined)
  const latest = submissions.reduce<CetPaperSubmission | undefined>((last, submission) =>
    !last || submission.submittedAt > last.submittedAt ? submission : last, undefined)
  const study: CetPaperStudy = structuredClone({
    ...newer, createdAt: Math.min(local?.createdAt ?? incoming.createdAt, incoming.createdAt),
    files: { ...older?.files, ...newer.files },
  })
  if (first && latest) { study.firstSubmission = cloneSubmission(first); study.latestSubmission = cloneSubmission(latest) }
  const evidence = { ...local?.correctionEvidence }
  for (const [number, incomingEvidence] of Object.entries(incoming.correctionEvidence ?? {})) {
    const current = evidence[number]
    if (!current || incomingEvidence.recordedAt > current.recordedAt ||
      (incomingEvidence.recordedAt === current.recordedAt && incomingEvidence.text < current.text)) evidence[number] = incomingEvidence
  }
  if (Object.keys(evidence).length) study.correctionEvidence = structuredClone(evidence)
  for (const [key, draft] of [['writingRevision', 'writingDraft'], ['translationRevision', 'translationDraft']] as const) {
    const revision = mergeOutputRevisions(local?.[key], incoming[key])
    if (!revision) continue
    const original = outputRevisionEqual(revision, local?.[key]) ? local : incoming
    const normalized = original?.[draft] !== study[draft] ? invalidateInitialChecks(revision, study[draft], revision.updatedAt) : revision
    study[key] = { ...normalized!, updatedAt: revision.updatedAt }
  }
  for (const scope of ['listening', 'reading'] as const) {
    const pairs = [local?.sectionSubmissions?.[scope], incoming.sectionSubmissions?.[scope]].filter((pair) => pair !== undefined)
    if (!pairs.length) continue
    const first = pairs.reduce((earliest, pair) => pair.first.submittedAt < earliest.submittedAt ? pair.first : earliest, pairs[0].first)
    const latest = pairs.reduce((last, pair) => pair.latest.submittedAt > last.submittedAt ? pair.latest : last, pairs[0].latest)
    study.sectionSubmissions = { ...study.sectionSubmissions, [scope]: { first: cloneSubmission(first), latest: cloneSubmission(latest) } }
  }
  return study
}
