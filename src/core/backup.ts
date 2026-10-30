import { db, base64ToBlob, type MediaBackupRow } from '../db/database'
import type { ExamPaperRow } from './examImport'
import { schedule, emptySnapshot, deriveState } from './fsrs'
import { ensureProfile, patchProfile, recomputePower } from './profile'
import { levelFromXp } from './game'
import { DEFAULT_THEMES, SHOP_ITEMS } from './shop'
import { wordBookUnits } from './wordMembership'
import { ADVENTURE_SCENE_IDS } from '../data/adventureIds'
import { isCetPracticeRecord, mergeCetPracticeRecords } from './cetPractice'
import { isCetPaperStudy, mergeCetPaperStudies, validateCetPaperFile } from './cetPapers'
import type { CetPaperFileKind, CetPaperFileRef, CetPaperStudy } from '../types/cetPaper'
import type { AdventureProgress, CetPracticeRecord, DailyLog, DailyQuest, ExpressionProgress, FsrsSnapshot, Profile, ReviewLog, UserWordStat, Word } from '../types/model'

/**
 * 备份导入与合并（§8.3 事件日志同步模型）
 *
 * review_log 是唯一真相来源，所以合并的正确做法是「并集去重」，
 * 再由日志重放推导 FSRS 状态，而不是整条记录 LWW 覆盖。
 */

export interface BackupPayload {
  app?: string
  schemaVersion?: number
  exportedAt?: number
  /** 导出时被跳过的音频或文档条数（超 MEDIA_BACKUP_LIMIT），缺省为 0 */
  mediaSkipped?: number
  data?: {
    words?: Word[]
    stats?: UserWordStat[]
    reviewLogs?: ReviewLog[]
    dailyLogs?: DailyLog[]
    profile?: unknown[]
    achievements?: { id: string; unlockedAt: number }[]
    quests?: DailyQuest[]
    exams?: ExamPaperRow[]
    media?: MediaBackupRow[]
    adventures?: AdventureProgress[]
    expressions?: ExpressionProgress[]
    cetPractice?: CetPracticeRecord[]
    cetPapers?: CetPaperStudy[]
  }
}

export interface ImportResult {
  ok: boolean
  error?: string
  addedLogs: number
  totalLogs: number
  rebuiltWords: number
  addedWords: number
  addedExams: number
  addedCetPapers: number
  addedMedia: number
}

function isBackup(x: unknown): x is BackupPayload {
  if (!x || typeof x !== 'object') return false
  const p = x as BackupPayload
  return Boolean((p.app === undefined || p.app === 'wordquest') && p.data && Array.isArray(p.data.reviewLogs))
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function date(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00`)) ? value : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : []
}

function practiceDate(value: unknown): string | undefined {
  const parsed = date(value)
  if (!parsed) return undefined
  const day = new Date(`${parsed}T00:00:00`)
  const canonical = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  return canonical === parsed ? parsed : undefined
}

/** 消耗品只取两份余额的较大值，外观取并集；合并不会把同一备份反复相加。 */
function profilePatch(local: Profile, remote: Record<string, unknown>, restoreSettings: boolean): Partial<Profile> {
  const validThemes = new Set([...DEFAULT_THEMES, ...SHOP_ITEMS.filter((i) => i.kind === 'theme').map((i) => i.payload)])
  const validSkins = new Set(['default', ...SHOP_ITEMS.filter((i) => i.kind === 'mascot').map((i) => i.payload)])
  const remoteMascot = record(remote.mascot)
  const remoteTheme = typeof remote.theme === 'string' && validThemes.has(remote.theme) ? remote.theme : undefined
  const remoteSkin = typeof remoteMascot?.skin === 'string' && validSkins.has(remoteMascot.skin) ? remoteMascot.skin : undefined
  // 旧备份可能没有 ownedThemes / ownedSkins；正在使用的有效外观本身就是拥有凭据。
  const ownedThemes = [...new Set([
    ...DEFAULT_THEMES, ...(local.ownedThemes ?? []), ...strings(remote.ownedThemes),
    local.theme, ...(remoteTheme ? [remoteTheme] : []),
  ])].filter((id) => validThemes.has(id))
  const ownedSkins = [...new Set([
    'default', ...(local.ownedSkins ?? []), ...strings(remote.ownedSkins), local.mascot.skin,
    ...(remoteSkin ? [remoteSkin] : []),
  ])].filter((id) => validSkins.has(id))
  const xp = Math.max(local.xp, count(remote.xp))
  const lastStudyDate = [date(local.lastStudyDate), date(remote.lastStudyDate)]
    .filter((d): d is string => Boolean(d)).sort().pop()
  const patch: Partial<Profile> = {
    xp,
    level: levelFromXp(xp),
    powerPeak: Math.max(local.powerPeak, count(remote.powerPeak)),
    coins: Math.max(local.coins, count(remote.coins)),
    freezes: Math.max(local.freezes, count(remote.freezes)),
    themeFragments: Math.max(local.themeFragments ?? 0, count(remote.themeFragments)),
    streak: Math.max(local.streak, count(remote.streak)),
    streakRewardTier: Math.max(local.streakRewardTier, count(remote.streakRewardTier)),
    chestRewardTier: Math.max(local.chestRewardTier ?? 0, count(remote.chestRewardTier)),
    lastStudyDate,
    ownedThemes,
    ownedSkins,
    onboarded: local.onboarded || remote.onboarded === true,
    schemaVersion: Math.max(local.schemaVersion, count(remote.schemaVersion)),
  }
  if (restoreSettings) {
    patch.theme = remoteTheme ?? local.theme
    patch.mascot = {
      name: typeof remoteMascot?.name === 'string' && remoteMascot.name.trim() ? remoteMascot.name : local.mascot.name,
      skin: remoteSkin ?? local.mascot.skin,
    }
    if (remote.examType === 'cet4' || remote.examType === 'cet6') patch.examType = remote.examType
    if (date(remote.examDate)) patch.examDate = date(remote.examDate)
    if (typeof remote.studyBook === 'string' && ['cet4-core', 'cet4-full', 'cet6-core', 'cet6-full', 'ky-core', 'ielts-core'].includes(remote.studyBook)) {
      patch.studyBook = remote.studyBook
    }
    if (typeof remote.dailyNewTarget === 'number' && Number.isFinite(remote.dailyNewTarget)) {
      patch.dailyNewTarget = Math.max(5, Math.min(300, Math.round(remote.dailyNewTarget)))
    }
    if (typeof remote.styleId === 'string' && ['pixel', 'soft', 'calm', 'focus'].includes(remote.styleId)) patch.styleId = remote.styleId
    if (typeof remote.customHue === 'number' && Number.isFinite(remote.customHue)) {
      patch.customHue = ((Math.round(remote.customHue) % 360) + 360) % 360
    }
    if (typeof remote.dormancy === 'boolean') patch.dormancy = remote.dormancy
  }
  // deviceId 始终留给当前设备；学习日志保留各自原来的设备标识。
  return patch
}

/**
 * 导入备份并与本地合并。
 * - 词库：补缺失条目，并合并已有词的多书归属
 * - 复习日志：按 id 取并集（append-only 的天然合并方式）
 * - 成就 / 真题卷 / 导入音频：按 id 取并集；任务按日期保留已领奖状态
 * - 统计：导入后由日志重放重建，避免两份快照互相覆盖
 */
const ZERO: Pick<ImportResult, 'addedLogs' | 'totalLogs' | 'rebuiltWords' | 'addedWords' | 'addedExams' | 'addedCetPapers' | 'addedMedia'> = {
  addedLogs: 0,
  totalLogs: 0,
  rebuiltWords: 0,
  addedWords: 0,
  addedExams: 0,
  addedCetPapers: 0,
  addedMedia: 0,
}

export async function importBackup(file: File): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: '文件不是合法的 JSON', ...ZERO }
  }
  if (!isBackup(parsed)) {
    return {
      ok: false,
      error: '不是 WordQuest 的备份文件',
      ...ZERO,
    }
  }

  const data = parsed.data!
  // 校验会参与 FSRS 重放的字段，避免坏日志先落库、再让整个导入或后续重建失败。
  if (data.reviewLogs!.some((log) => !log || typeof log.id !== 'string' || !log.id ||
    typeof log.wordId !== 'string' || !log.wordId || ![1, 2, 3, 4].includes(log.rating) ||
    !Number.isFinite(log.reviewedAt) || !Number.isFinite(log.elapsedMs) ||
    typeof log.correct !== 'boolean')) {
    return { ok: false, error: '备份中的复习记录格式不正确', ...ZERO }
  }
  if (data.cetPractice !== undefined && (!Array.isArray(data.cetPractice) ||
    data.cetPractice.some((row) => !isCetPracticeRecord(row)))) {
    return { ok: false, error: '备份中的四六级专项练习记录格式不正确', ...ZERO }
  }
  if (data.cetPapers !== undefined && (!Array.isArray(data.cetPapers) ||
    data.cetPapers.some((row) => !isCetPaperStudy(row)) ||
    new Set(data.cetPapers.map((row) => row.id)).size !== data.cetPapers.length)) {
    return { ok: false, error: '备份中的真题学习档案格式不正确', ...ZERO }
  }
  let paperMedia: Map<string, Blob>
  try {
    paperMedia = await prepareCetPaperMedia(data)
  } catch {
    return { ok: false, error: '备份中的真题文档或录音与档案引用不符', ...ZERO }
  }
  try {
    // 备份恢复与合并是一次操作：失败时不留下半份词库、库存或任务记录。
    return await db.transaction('rw', [db.words, db.stats, db.reviewLogs, db.dailyLogs,
      db.profile, db.achievements, db.quests, db.exams, db.media, db.adventures, db.expressions, db.cetPractice, db.cetPapers], () => mergeBackupData(data, paperMedia))
  } catch {
    return { ok: false, error: '备份导入失败，请检查文件内容和可用存储空间后重试', ...ZERO }
  }
}

/** 先核验新档案关联的字节，再进入写事务；100 MB 导出跳过的缺失附件可稍后重新导入。 */
async function prepareCetPaperMedia(data: NonNullable<BackupPayload['data']>): Promise<Map<string, Blob>> {
  const refs = new Map<string, { kind: CetPaperFileKind; ref: CetPaperFileRef }>()
  for (const study of data.cetPapers ?? []) {
    for (const [kind, ref] of Object.entries(study.files)) {
      if (ref) refs.set(ref.id, { kind: kind as CetPaperFileKind, ref })
    }
  }
  const prepared = new Map<string, Blob>()
  if (data.cetPapers !== undefined && data.media !== undefined && !Array.isArray(data.media)) throw new Error('invalid media table')
  if (!Array.isArray(data.media)) return prepared
  for (const row of data.media) {
    const linked = row && refs.get(row.id)
    if (!linked) continue
    if (prepared.has(row.id) || row.type !== linked.ref.type || typeof row.base64 !== 'string' ||
      row.base64.length !== Math.ceil(linked.ref.size / 3) * 4) throw new Error('invalid file bytes')
    const blob = base64ToBlob(row.base64, row.type)
    if (blob.size !== linked.ref.size) throw new Error('file size mismatch')
    await validateCetPaperFile(linked.kind, blob)
    prepared.set(row.id, blob)
  }
  return prepared
}

async function mergeBackupData(data: NonNullable<BackupPayload['data']>, paperMedia: Map<string, Blob>): Promise<ImportResult> {
  const localBefore = await db.profile.get('me')
  const [localReviews, localStudiedWords, localDays, localClaimedChests, localAdventures, localExpressions, localCetPractice, localCetPapers] = await Promise.all([
    db.reviewLogs.count(),
    db.stats.filter((stat) => stat.fsrs.reps > 0 || stat.correctCount > 0 || stat.mistakeCount > 0).count(),
    db.dailyLogs.toArray(),
    db.quests.filter((row) => row.chestOpened).count(),
    db.adventures.count(),
    db.expressions.filter((row) => row.attempts > 0).count(),
    db.cetPractice.filter((row) => row.attempts > 0).count(),
    db.cetPapers.filter((row) => row.latestSubmission !== undefined || row.elapsedSeconds > 0 ||
      row.answers.some(Boolean) || row.answerKey.some(Boolean) || Boolean(row.writingDraft.trim()) ||
      Boolean(row.translationDraft.trim()) || Boolean(row.notes.trim()) || Object.keys(row.files).length > 0).count(),
  ])
  // 新设备必须先完成引导才能打开设置，首页也会自动建立未完成任务行。
  // 这些初始化记录不代表已学习；只有真实作答、听力或历史进度才保留本机设置。
  const hasStudyProgress = localReviews > 0 || localStudiedWords > 0 || localClaimedChests > 0 || localAdventures > 0 || localExpressions > 0 || localCetPractice > 0 || localCetPapers > 0 ||
    localDays.some((day) => day.totalAnswered > 0 || day.newLearned > 0 || day.reviewsDone > 0 ||
      day.listeningSeconds > 0 || day.listeningSentences > 0 || day.studySeconds > 0 || day.effectiveDay) ||
    Boolean(localBefore && (localBefore.xp > 0 || localBefore.powerPeak > 0 || localBefore.streak > 0 ||
      date(localBefore.lastStudyDate)))
  const restoreSettings = !hasStudyProgress
  let addedWords = 0
  let addedLogs = 0

  // 词条内容保留本地版本，但备份中的其他词书归属也需要恢复。
  if (Array.isArray(data.words) && data.words.length > 0) {
    const incoming = data.words.filter((w) => w && typeof w.id === 'string' && w.id && typeof w.word === 'string')
    const existing = await db.words.bulkGet(incoming.map((w) => w.id))
    const merged = new Map<string, Word>()
    for (const [i, word] of incoming.entries()) {
      const local = merged.get(word.id) ?? existing[i]
      if (!local) addedWords++
      merged.set(word.id, local ? {
        ...local,
        bookUnits: { ...wordBookUnits(word), ...wordBookUnits(local) },
      } : { ...word, bookUnits: wordBookUnits(word) })
    }
    if (merged.size > 0) await db.words.bulkPut([...merged.values()])
  }

  // 复习日志：按 id 并集
  if (Array.isArray(data.reviewLogs)) {
    const existingIds = new Set(await db.reviewLogs.toCollection().primaryKeys())
    const incoming = data.reviewLogs.filter((l) => {
      if (existingIds.has(l.id)) return false
      existingIds.add(l.id)
      return true
    })
    if (incoming.length > 0) {
      await db.reviewLogs.bulkPut(incoming)
      addedLogs = incoming.length
    }
  }

  // 日汇总取较大快照，听力等独立计数也合并；不会把相同备份重复累加。
  if (Array.isArray(data.dailyLogs)) {
    for (const incoming of data.dailyLogs) {
      if (!incoming || !date(incoming.date)) continue
      const local = await db.dailyLogs.get(incoming.date)
      const answers = !local || count(incoming.totalAnswered) > local.totalAnswered ? incoming : local
      const merged: DailyLog = {
        date: incoming.date,
        newLearned: Math.max(count(local?.newLearned), count(incoming.newLearned)),
        reviewsDone: Math.max(count(local?.reviewsDone), count(incoming.reviewsDone)),
        listeningSeconds: Math.max(count(local?.listeningSeconds), count(incoming.listeningSeconds)),
        listeningSentences: Math.max(count(local?.listeningSentences), count(incoming.listeningSentences)),
        xp: Math.max(count(local?.xp), count(incoming.xp)),
        coinsEarned: Math.max(count(local?.coinsEarned), count(incoming.coinsEarned)),
        totalAnswered: count(answers.totalAnswered),
        correctCount: Math.min(count(answers.correctCount), count(answers.totalAnswered)),
        studySeconds: Math.max(count(local?.studySeconds), count(incoming.studySeconds)),
        effectiveDay: local?.effectiveDay === true || incoming.effectiveDay === true,
      }
      await db.dailyLogs.put(merged)
    }
  }

  // 旧版可能只有 stats 没有对应日志；先补缺失快照，随后让完整日志覆盖其派生状态。
  if (Array.isArray(data.stats)) {
    const existing = new Set(await db.stats.toCollection().primaryKeys())
    const missing = data.stats.filter((s) => s?.wordId && s.fsrs &&
      Number.isFinite(s.fsrs.due) && Number.isFinite(s.fsrs.reps) && !existing.has(s.wordId))
    if (missing.length > 0) await db.stats.bulkPut(missing)
  }

  // 已开箱状态取并集；恢复后不能再次领取同一天的奖励。
  if (Array.isArray(data.quests)) {
    for (const incoming of data.quests) {
      if (!incoming || !date(incoming.date)) continue
      const local = await db.quests.get(incoming.date)
      const localIds = strings(local?.questIds)
      const remoteIds = strings(incoming.questIds)
      const questIds = [...new Set([...localIds, ...remoteIds])]
      await db.quests.put({
        date: incoming.date,
        questIds,
        progress: questIds.map((id) => Math.max(
          count(local?.progress?.[localIds.indexOf(id)]),
          count(incoming.progress?.[remoteIds.indexOf(id)]),
        )),
        chestOpened: local?.chestOpened === true || incoming.chestOpened === true,
        chestCount: Math.max(count(local?.chestCount), count(incoming.chestCount)),
      })
    }
  }

  // 冒险进度按掌握集合合并，尝试次数取较大快照，导入不会重新发放题目奖励。
  if (Array.isArray(data.adventures)) {
    for (const incoming of data.adventures) {
      if (!incoming || typeof incoming.sceneId !== 'string' || !incoming.sceneId ||
        !Number.isFinite(incoming.firstPlayedAt) || !Number.isFinite(incoming.lastPlayedAt)) continue
      const local = await db.adventures.get(incoming.sceneId)
      const completed = [local?.completedAt, incoming.completedAt]
        .filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time >= 0)
      const merged: AdventureProgress = {
        sceneId: incoming.sceneId,
        bestScore: Math.min(3, Math.max(count(local?.bestScore), count(incoming.bestScore))),
        attempts: Math.max(count(local?.attempts), count(incoming.attempts)),
        correctQuestionIds: [...new Set([
          ...strings(local?.correctQuestionIds), ...strings(incoming.correctQuestionIds),
        ])],
        firstPlayedAt: Math.min(local?.firstPlayedAt ?? incoming.firstPlayedAt, incoming.firstPlayedAt),
        lastPlayedAt: Math.max(local?.lastPlayedAt ?? incoming.lastPlayedAt, incoming.lastPlayedAt),
        ...(completed.length > 0 ? { completedAt: Math.min(...completed) } : {}),
      }
      await db.adventures.put(merged)
    }
  }

  // 表达练习保留调度较新的一方；同日冲突取更早复习、较低阶段，奖励凭据只增不减。
  // id 校验只依赖轻量场景索引，首页与备份入口不会加载完整表达内容。
  if (Array.isArray(data.expressions)) {
    for (const incoming of data.expressions) {
      if (!incoming || !(ADVENTURE_SCENE_IDS as readonly string[]).includes(incoming.sceneId) ||
        ![`${incoming.sceneId}-say-1`, `${incoming.sceneId}-say-2`].includes(incoming.id) ||
        count(incoming.attempts) < 1 || !practiceDate(incoming.lastScheduledDate) ||
        !Number.isFinite(incoming.firstPracticedAt) || incoming.firstPracticedAt < 0 ||
        !Number.isFinite(incoming.lastPracticedAt) || incoming.lastPracticedAt < 0 ||
        !Number.isFinite(incoming.dueAt) || incoming.dueAt < 0) continue
      const local = await db.expressions.get(incoming.id)
      const newer = !local || incoming.lastScheduledDate > local.lastScheduledDate ? incoming : local
      const sameDay = local?.lastScheduledDate === incoming.lastScheduledDate
      const latestAttempt = !local || incoming.lastPracticedAt > local.lastPracticedAt ? incoming : local
      const outcome = latestAttempt.lastOutcome
      const merged: ExpressionProgress = {
        id: incoming.id,
        sceneId: incoming.sceneId,
        attempts: Math.max(count(local?.attempts), count(incoming.attempts)),
        firstPracticedAt: Math.min(local?.firstPracticedAt ?? incoming.firstPracticedAt, incoming.firstPracticedAt),
        lastPracticedAt: Math.max(local?.lastPracticedAt ?? incoming.lastPracticedAt, incoming.lastPracticedAt),
        dueAt: sameDay ? Math.min(local!.dueAt, incoming.dueAt) : newer.dueAt,
        stage: Math.min(5, sameDay ? Math.min(count(local!.stage), count(incoming.stage)) : count(newer.stage)),
        lastScheduledDate: newer.lastScheduledDate,
        independentDays: [...new Set([
          ...strings(local?.independentDays), ...strings(incoming.independentDays),
        ].filter((day) => practiceDate(day)))].sort(),
        rewardedDates: [...new Set([
          ...strings(local?.rewardedDates), ...strings(incoming.rewardedDates),
        ].filter((day) => practiceDate(day)))].sort(),
        lastOutcome: outcome === 'independent' || outcome === 'assisted' ? outcome : 'retry',
      }
      await db.expressions.put(merged)
    }
  }

  // 专项草稿与最近提交分别取较新快照，阅读首次答案与完成时间取最早历史。
  // 整批记录已在事务前校验；合并只写专项档案，不产生学习奖励或词汇统计。
  if (Array.isArray(data.cetPractice)) {
    for (const incoming of data.cetPractice) {
      const local = await db.cetPractice.get(incoming.id)
      await db.cetPractice.put(mergeCetPracticeRecords(local, incoming))
    }
  }

  // 草稿、最早首次核对和最近核对独立合并；附件按最终引用恢复，陈旧备份不产生孤儿。
  const replacedPaperMedia = new Set<string>()
  const neededPaperMedia = new Set<string>()
  let addedCetPapers = 0
  if (Array.isArray(data.cetPapers)) {
    for (const incoming of data.cetPapers) {
      const local = await db.cetPapers.get(incoming.id)
      if (!local) addedCetPapers++
      const merged = mergeCetPaperStudies(local, incoming)
      // 附件可能因导出体积限制缺失；不能用一个空引用替换本机唯一可用的文件。
      for (const [kind, ref] of Object.entries(merged.files)) {
        const old = local?.files[kind as CetPaperFileKind]
        if (ref && old && old.id !== ref.id && !paperMedia.has(ref.id) &&
          !(await db.media.get(ref.id)) && await db.media.get(old.id)) {
          merged.files[kind as CetPaperFileKind] = { ...old }
        }
      }
      await db.cetPapers.put(merged)
      for (const [kind, ref] of Object.entries(merged.files)) {
        if (ref) neededPaperMedia.add(ref.id)
        const old = local?.files[kind as CetPaperFileKind]
        if (old && old.id !== ref?.id) replacedPaperMedia.add(old.id)
      }
    }
  }

  // 成就：并集
  if (Array.isArray(data.achievements)) {
    const existing = new Set(await db.achievements.toCollection().primaryKeys())
    const incoming = data.achievements.filter((a) => a?.id && !existing.has(a.id))
    if (incoming.length > 0) await db.achievements.bulkPut(incoming)
  }

  // 真题卷：按 id 并集，不覆盖本地（本地可能有用户改过的版本）
  let addedExams = 0
  if (Array.isArray(data.exams) && data.exams.length > 0) {
    const existing = new Set(await db.exams.toCollection().primaryKeys())
    const missing = data.exams.filter((x) => x?.id && !existing.has(x.id))
    if (missing.length > 0) {
      await db.exams.bulkPut(missing)
      addedExams = missing.length
    }
  }

  // 导入音频：base64 还原成 Blob，按 id 并集。
  // 单行损坏（截断的备份、非法 base64）只跳过那一条，不让整个导入失败。
  let addedMedia = 0
  if (Array.isArray(data.media) && data.media.length > 0) {
    const existing = new Set(await db.media.toCollection().primaryKeys())
    const missing: { id: string; blob: Blob }[] = []
    for (const m of data.media) {
      if (!m?.id || typeof m.base64 !== 'string' || existing.has(m.id)) continue
      if (typeof m.id !== 'string') continue
      if (m.id.startsWith('cet-paper')) {
        if (neededPaperMedia.has(m.id) && paperMedia.has(m.id)) {
          missing.push({ id: m.id, blob: paperMedia.get(m.id)! })
          existing.add(m.id)
        }
        continue
      }
      try {
        missing.push({ id: m.id, blob: base64ToBlob(m.base64, m.type ?? '') })
        existing.add(m.id)
      } catch {
        continue
      }
    }
    if (missing.length > 0) {
      await db.media.bulkPut(missing)
      addedMedia = missing.length
    }
  }
  for (const id of replacedPaperMedia) await db.media.delete(id)

  const totalLogs = await db.reviewLogs.count()
  const rebuiltWords = await rebuildStatsFromLogs()

  const local = await ensureProfile()
  const remote = Array.isArray(data.profile) ? record(data.profile[0]) : undefined
  if (remote) {
    await patchProfile(profilePatch(local, remote, restoreSettings))
  }
  await recomputePower()

  return {
    ok: true,
    addedLogs,
    totalLogs,
    rebuiltWords,
    addedWords,
    addedExams,
    addedCetPapers,
    addedMedia,
  }
}

/**
 * 由 review_log 全量重放推导 FSRS 状态（§8.3）。
 * 这是 review_log 作为唯一真相来源的兑现：即使 stats 表损坏或缺失，
 * 也能从日志重建出等价的学习状态。
 */
export async function rebuildStatsFromLogs(): Promise<number> {
  const logs = await db.reviewLogs.orderBy('reviewedAt').toArray()
  if (logs.length === 0) return 0

  const byWord = new Map<string, ReviewLog[]>()
  for (const log of logs) {
    const list = byWord.get(log.wordId) ?? []
    list.push(log)
    byWord.set(log.wordId, list)
  }

  const nextStats: UserWordStat[] = []
  for (const [wordId, list] of byWord) {
    let snap: FsrsSnapshot = emptySnapshot(list[0].reviewedAt)
    let correctCount = 0
    let mistakeCount = 0
    for (const log of list) {
      // 重放时按日志里的评级与时间推进，不依赖当前 stats 快照
      snap = schedule(snap, (log.rating as 1 | 2 | 3 | 4) ?? 3, log.reviewedAt)
      if (log.correct) correctCount++
      else mistakeCount++
    }
    nextStats.push({
      wordId,
      fsrs: snap,
      state: deriveState(snap),
      mistakeCount,
      correctCount,
      firstSeenAt: list[0].reviewedAt,
      lastReviewedAt: list[list.length - 1].reviewedAt,
    })
  }

  await db.stats.bulkPut(nextStats)
  // 注意：不删除「没有日志的统计」。日志理论上覆盖全部学习记录，但旧版本数据、
  // 手动导入的词、或日志被裁剪过的情况都可能有统计无日志；删掉就等于丢学习进度。
  // 只重建有日志的词，其余保持原样。
  return nextStats.length
}
