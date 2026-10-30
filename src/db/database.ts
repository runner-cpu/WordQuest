import Dexie, { type Table } from 'dexie'
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

/**
 * 本地优先数据库。数据即真相：IndexedDB 是主存储，云同步只做并集合并。
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
  }
}

export const db = new WordQuestDB()

export const SCHEMA_VERSION = 7

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
 * 把当前 IndexedDB 全量导出为 JSON（备份/云同步 payload）。
 *
 * 真题卷（exams）与导入音频（media）也在备份范围内——它们是用户花时间
 * 导入的内容，备份往返丢掉等于白做。音频超过 MEDIA_BACKUP_LIMIT 时跳过，
 * 由 mediaSkipped 计数告知调用方，避免一个 JSON 文件膨胀到几百 MB。
 */
export async function exportBackup() {
  const [words, stats, reviewLogs, dailyLogs, profile, achievements, quests, exams, mediaRows, adventures, expressions, cetPractice, cetPapers] =
    await Promise.all([
      db.words.toArray(),
      db.stats.toArray(),
      db.reviewLogs.toArray(),
      db.dailyLogs.toArray(),
      db.profile.toArray(),
      db.achievements.toArray(),
      db.quests.toArray(),
      db.exams.toArray(),
      db.media.toArray(),
      db.adventures.toArray(),
      db.expressions.toArray(),
      db.cetPractice.toArray(),
      db.cetPapers.toArray(),
    ])

  const media: MediaBackupRow[] = []
  let mediaBytes = 0
  let mediaSkipped = 0
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
    data: { words, stats, reviewLogs, dailyLogs, profile, achievements, quests, exams, media, adventures, expressions, cetPractice, cetPapers },
    ...(mediaSkipped > 0 ? { mediaSkipped } : {}),
  }
}
