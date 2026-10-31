import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import { db } from '../db/database'
import type { CetPaperFileKind, CetPaperFileRef, CetPaperStudy, CetPaperSubmission } from '../types/cetPaper'

const QUESTION_COUNT = 55
const FILE_KINDS: CetPaperFileKind[] = ['paper', 'answers', 'audio']
const PDF_LIMIT = 30 * 1024 * 1024
const AUDIO_LIMIT = 60 * 1024 * 1024
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac'])
const PATCH_KEYS = ['variant', 'answers', 'answerKey', 'writingDraft', 'translationDraft', 'notes', 'elapsedSeconds'] as const
type StudyPatch = Partial<Pick<CetPaperStudy, typeof PATCH_KEYS[number]>>

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
  if (value.firstSubmission === undefined && value.latestSubmission === undefined) return true
  const first = value.firstSubmission
  const latest = value.latestSubmission
  return validSubmission(first) && validSubmission(latest) &&
    value.createdAt <= first.submittedAt && first.submittedAt <= latest.submittedAt && latest.submittedAt <= value.updatedAt &&
    (first.submittedAt !== latest.submittedAt || first.answers.every((answer, index) =>
      answer === latest.answers[index] && first.answerKey[index] === latest.answerKey[index]))
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
export async function saveCetPaperStudy(id: string, patch: StudyPatch, editedAt?: number): Promise<CetPaperStudy> {
  if (!record(patch) || Object.keys(patch).some((key) => !(PATCH_KEYS as readonly string[]).includes(key)) ||
    (editedAt !== undefined && !timestamp(editedAt))) throw new Error('档案内容或保存时间无效')
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const value = patch[key]
    if (key === 'answers' || key === 'answerKey') {
      if (!validAnswers(value)) throw new Error('答案必须包含 55 个有效选项或空白')
    } else if (key === 'elapsedSeconds') {
      if (!timestamp(value)) throw new Error('学习时长无效')
    } else if (typeof value !== 'string' || (key === 'variant' && value.length > 200)) {
      throw new Error('草稿或套卷名称无效')
    }
  }
  const copiedPatch = structuredClone(patch)
  return db.transaction('rw', [db.cetPapers], async () => {
    const previous = await requireStudy(id)
    if (editedAt !== undefined && editedAt <= previous.updatedAt) return previous
    const updatedAt = editedAt ?? nextTimestamp(previous.updatedAt)
    const study: CetPaperStudy = { ...previous, ...copiedPatch, updatedAt }
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

export async function submitCetPaperStudy(id: string): Promise<CetPaperStudy> {
  return db.transaction('rw', [db.cetPapers], async () => {
    const previous = await requireStudy(id)
    if (!previous.answers.some((answer, index) => answer !== '' && previous.answerKey[index] !== '')) {
      throw new Error('请至少选择一道题的答案，并录入该题的参考答案后核对')
    }
    const submittedAt = nextTimestamp(previous.updatedAt)
    const submission: CetPaperSubmission = { answers: [...previous.answers], answerKey: [...previous.answerKey], submittedAt }
    const study: CetPaperStudy = {
      ...previous, updatedAt: submittedAt,
      firstSubmission: cloneSubmission(previous.firstSubmission ?? submission), latestSubmission: cloneSubmission(submission),
    }
    await db.cetPapers.put(study)
    return structuredClone(study)
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
export function cetPaperResult(submission?: CetPaperSubmission): { correct: number; compared: number; unanswered: number; wrong: number[] } {
  if (!submission) return { correct: 0, compared: 0, unanswered: QUESTION_COUNT, wrong: [] }
  let correct = 0
  let compared = 0
  let unanswered = 0
  const wrong: number[] = []
  for (let index = 0; index < QUESTION_COUNT; index++) {
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
  return study
}
