import Dexie, { type Table, type Transaction } from 'dexie'
import { deriveState } from '../core/fsrs'
import { computePower, difficultyWeight } from '../core/game'
import { countProductionCorrect } from '../core/vocabProgress'
import type { ExamPaperRow } from '../core/examImport'
import type { CetPaperStudy } from '../types/cetPaper'
import type {
  AchievementUnlock,
  AdventureProgress,
  CetPracticeRecord,
  DailyLog,
  DailyQuest,
  ExpressionProgress,
  Profile,
  ReviewLog,
  UserWordStat,
  Word,
} from '../types/model'

/** 只更新业务掌握口径；升级不会再次调度、改写 FSRS 快照或发放学习奖励。 */
export async function migrateVocabularyProgress(transaction: Transaction): Promise<void> {
  const [stats, logs] = await Promise.all([
    transaction.table<UserWordStat>('stats').toArray(),
    transaction.table<ReviewLog>('reviewLogs').toArray(),
  ])
  const byWord = new Map<string, ReviewLog[]>()
  for (const log of logs) {
    const list = byWord.get(log.wordId) ?? []
    list.push(log)
    byWord.set(log.wordId, list)
  }
  const nextStats = stats.map((stat) => {
    const productionCorrectCount = countProductionCorrect(byWord.get(stat.wordId) ?? [])
    return { ...stat, productionCorrectCount, state: deriveState(stat.fsrs, productionCorrectCount) }
  })
  if (nextStats.length > 0) await transaction.table<UserWordStat>('stats').bulkPut(nextStats)
  const mastered = nextStats.filter((stat) => stat.state === 'mastered')
  const words = await transaction.table<Word>('words').bulkGet(mastered.map((stat) => stat.wordId))
  const power = computePower({ masteredWeights: words.map((word) => word ? word.difficultyWeight ?? difficultyWeight(word.freqRank) : 1) })
  await transaction.table<Profile>('profile').toCollection().modify((profile) => {
    profile.power = power
    profile.powerPeak = Math.max(profile.powerPeak, power)
    profile.familiarWords ??= {}
    profile.schemaVersion = 9
  })
}

/** 难度缓存是可选元数据；升级只标记版本，不猜测缺失词条的难度。 */
export async function migrateWordDifficultyMetadata(transaction: Transaction): Promise<void> {
  await transaction.table<Profile>('profile').toCollection().modify((profile) => { profile.schemaVersion = 12 })
}

/**
 * 本地优先数据库。IndexedDB 是主存储，手动迁移复用备份合并。
 * 迁移策略：schema 版本号递增 + upgrade()，迁移前自动快照（§8.2）。
 */
export class WordQuestDB extends Dexie {
  words!: Table<Word, string>
  stats!: Table<UserWordStat, string>
  reviewLogs!: Table<ReviewLog, string>
  dailyLogs!: Table<DailyLog, string>
  profile!: Table<Profile, string>
  achievements!: Table<AchievementUnlock, string>
  quests!: Table<DailyQuest, string>
  /** 导入的音频与 PDF Blob；字节与真题档案引用分开保存。 */
  media!: Table<{ id: string; blob: Blob }, string>
  /** 用户导入的结构化听力练习包。 */
  exams!: Table<ExamPaperRow, string>
  /** 情景冒险进度及已发放的题目奖励凭据。 */
  adventures!: Table<AdventureProgress, string>
  expressions!: Table<ExpressionProgress, string>
  cetPractice!: Table<CetPracticeRecord, string>
  /** 公开真题来源的本机答题卡、草稿与文件引用。 */
  cetPapers!: Table<CetPaperStudy, string>

  constructor() {
    super('wordquest')
    this.version(1).stores({
      words: 'id, bookId, freqRank, unitId, difficultyWeight',
      stats: 'wordId, state, fsrs.due, mistakeCount, lastReviewedAt',
      reviewLogs: 'id, wordId, reviewedAt, [wordId+reviewedAt]',
      dailyLogs: 'date',
      profile: 'id',
      achievements: 'id, unlockedAt',
      quests: 'date',
    })
    // v2：补上听力音频表。已有用户升级时不会丢数据。
    this.version(2).stores({
      media: 'id',
    })
    // v3：用户导入的结构化听力练习包。
    this.version(3).stores({
      exams: 'id, importedAt',
    })
    this.version(4).stores({
      adventures: 'sceneId, lastPlayedAt, completedAt',
    })
    this.version(5).stores({
      expressions: 'id, sceneId, dueAt',
    })
    this.version(6).stores({
      cetPractice: 'id, examType, kind, updatedAt',
    })
    this.version(7).stores({
      cetPapers: 'id, sourceId, updatedAt',
    })
    // v8：奖励凭据保留在账户中，增量补默认值，不重建表或清理学习记录。
    this.version(8).stores({}).upgrade(async (transaction) => {
      await transaction.table<Profile>('profile').toCollection().modify((profile) => {
        profile.cetRewardProgress ??= {}
        profile.schemaVersion = 8
      })
    })
    this.version(9).stores({}).upgrade(migrateVocabularyProgress)
    // v10：写译修订为可选字段；旧初稿、提交、自查和奖励不做改写。
    this.version(10).stores({}).upgrade(async (transaction) => {
      await transaction.table<Profile>('profile').toCollection().modify((profile) => { profile.schemaVersion = 10 })
    })
    // v11：基础自述是可选偏好，不替旧账户选择，也不改动其他设置或学习历史。
    this.version(11).stores({}).upgrade(async (transaction) => {
      await transaction.table<Profile>('profile').toCollection().modify((profile) => { profile.schemaVersion = 11 })
    })
    this.version(12).stores({}).upgrade(migrateWordDifficultyMetadata)
  }
}

export const db = new WordQuestDB()

export const SCHEMA_VERSION = 12

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateKeyOffset(days: number, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return todayKey(d)
}

/** Blob → base64（备份 JSON 里存不了 Blob，只能存字节） */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** base64 → Blob（导入备份时还原音频） */
export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

/** 备份里音频和文档的总体积：超过就跳过，避免 JSON 备份过大。 */
export const MEDIA_BACKUP_LIMIT = 100 * 1024 * 1024

/** 备份里一条音频的 JSON 形态 */
export interface MediaBackupRow {
  id: string
  type: string
  base64: string
}

/**
 * 默认把当前 IndexedDB 全量导出为 JSON 备份。
 *
 * 真题卷（exams）与导入音频（media）也在备份范围内——它们是用户花时间
 * 导入的内容，备份往返丢掉等于白做。音频超过 MEDIA_BACKUP_LIMIT 时跳过，
 * 由 mediaSkipped 计数告知调用方，避免一个 JSON 文件膨胀到几百 MB。
 * 轻量迁移省略附件字节与词条正文，仅提取学习过的词的难度，保留学习记录和文件引用。
 */
export async function exportBackup(options: { includeMedia?: boolean; includeWords?: boolean } = {}) {
  const includeMedia = options.includeMedia !== false
  const includeWords = options.includeWords !== false
  const [words, stats, reviewLogs, dailyLogs, profile, achievements, quests, exams, mediaRows, adventures, expressions, cetPractice, cetPapers, omittedMedia, wordsSkipped] =
    await Promise.all([
      includeWords ? db.words.toArray() : Promise.resolve([] as Word[]),
      db.stats.toArray(),
      db.reviewLogs.toArray(),
      db.dailyLogs.toArray(),
      db.profile.toArray(),
      db.achievements.toArray(),
      db.quests.toArray(),
      db.exams.toArray(),
      includeMedia ? db.media.toArray() : Promise.resolve([] as { id: string; blob: Blob }[]),
      db.adventures.toArray(),
      db.expressions.toArray(),
      db.cetPractice.toArray(),
      db.cetPapers.toArray(),
      includeMedia ? 0 : db.media.count(),
      includeWords ? 0 : db.words.count(),
    ])

  let backupProfiles = profile
  if (!includeWords) {
    const wordIds = new Set([...stats.map((stat) => stat.wordId), ...reviewLogs.map((log) => log.wordId)])
    const studiedWords = await db.words.bulkGet([...wordIds])
    backupProfiles = profile.map((row) => {
      const weights = new Map(Object.entries(row.wordDifficultyWeights ?? {})
        .filter(([wordId, weight]) => wordIds.has(wordId) && [1, 1.3, 1.6].includes(weight)))
      for (const word of studiedWords) {
        if (word) weights.set(word.id, [1, 1.3, 1.6].includes(word.difficultyWeight)
          ? word.difficultyWeight : difficultyWeight(word.freqRank))
      }
      return weights.size > 0 ? { ...row, wordDifficultyWeights: Object.fromEntries(weights) } : row
    })
  }

  const media: MediaBackupRow[] = []
  let mediaBytes = 0
  let mediaSkipped = omittedMedia
  for (const row of mediaRows) {
    if (!row?.blob) continue
    if (mediaBytes + row.blob.size > MEDIA_BACKUP_LIMIT) {
      mediaSkipped++
      continue
    }
    media.push({ id: row.id, type: row.blob.type, base64: await blobToBase64(row.blob) })
    mediaBytes += row.blob.size
  }

  return {
    app: 'wordquest',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: { words, stats, reviewLogs, dailyLogs, profile: backupProfiles, achievements, quests, exams, media, adventures, expressions, cetPractice, cetPapers },
    ...(mediaSkipped > 0 ? { mediaSkipped } : {}),
    ...(wordsSkipped > 0 ? { wordsSkipped } : {}),
  }
}
