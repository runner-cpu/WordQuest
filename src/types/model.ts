/** 数据模型 —— 对应设计方案 §8.3 */

/** 词条（来自 ECDICT，构建期生成的分片 JSON） */
export interface Word {
  id: string // 稳定 id：小写单词本身（ECDICT 词条大小写不敏感）
  word: string
  phonetic?: string
  pos?: string
  definition: string // 中文释义（多义项用 \n 分隔）
  example?: string
  exampleSource?: 'tatoeba' | 'llm' | 'none'
  root?: string // 词根拆解，如 im-port
  bookId: BookId
  freqRank: number // BNC 词频序（越小越高频），无则取大值
  difficultyWeight: number // 1.0 / 1.3 / 1.6，见 §4.1
  unitId: number // 分片/单元编号
  /** 同一单词在各本词书中的单元归属；旧记录可由 bookId / unitId 补齐 */
  bookUnits?: Partial<Record<BookId, number>>
}

export type BookId =
  | 'cet4-core'
  | 'cet4-full'
  | 'cet6-core'
  | 'cet6-full'
  | 'ky-core'
  | 'ielts-core'

export type WordState = 'new' | 'learning' | 'review' | 'mastered'

/** FSRS 卡片状态快照（由 review_log 重放推导，非真相来源） */
export interface FsrsSnapshot {
  due: number // epoch ms
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  /** 学习步进索引；可选以兼容旧版本与已有 JSON 备份 */
  learning_steps?: number
  reps: number
  lapses: number
  state: number // ts-fsrs State 数值
  last_review?: number
}

export interface UserWordStat {
  wordId: string
  fsrs: FsrsSnapshot
  state: WordState
  mistakeCount: number
  correctCount: number
  firstSeenAt: number
  lastReviewedAt: number
}

/** append-only 复习事件日志 —— 同步的唯一真相来源（§8.3） */
export interface ReviewLog {
  id: string // UUID
  wordId: string
  rating: number // 1 Again / 2 Hard / 3 Good / 4 Easy
  reviewedAt: number
  deviceId: string
  elapsedMs: number
  /** 本次复习所用题型，用于统计与防刷 */
  mode: ReviewMode
  /** 该次作答是否正确（用于正确率统计；Again 即 false） */
  correct: boolean
}

export type ReviewMode = 'new-card' | 'choice-word' | 'choice-meaning' | 'spell' | 'listen-meaning' | 'listen-spell'

export interface DailyLog {
  date: string // YYYY-MM-DD（本地时区）
  newLearned: number
  reviewsDone: number
  listeningSeconds: number
  /** 完成的听写句数，精确计数（不再用秒数推算） */
  listeningSentences: number
  xp: number
  coinsEarned: number
  correctCount: number
  totalAnswered: number
  /** 有效学习日：≥10 分钟或完成核心任务（§5.3） */
  effectiveDay: boolean
  studySeconds: number
}

export interface MascotState {
  name: string
  skin: string
}

export interface Profile {
  id: 'me'
  level: number
  xp: number
  power: number
  powerPeak: number
  rankId: string
  coins: number
  streak: number
  lastStudyDate?: string
  freezes: number
  dormancy: boolean
  theme: string
  mascot: MascotState
  examType?: 'cet4' | 'cet6'
  examDate?: string
  dailyNewTarget: number
  onboarded: boolean
  deviceId: string
  schemaVersion: number
  /** 已结算的连击奖励档位，避免重复发冻结券 */
  streakRewardTier: number
  /** 已购买的主题 id（含默认主题） */
  ownedThemes?: string[]
  /** 已购买的吉祥物皮肤 */
  ownedSkins?: string[]
  /** 主题碎片：每 5 个每日宝箱必得 1 个，攒够可兑换主题 */
  themeFragments?: number
  /** 每 5 个宝箱的碎片奖励已发到哪一档；旧记录在下次开箱时逐枚补发 */
  chestRewardTier?: number
  /** 当前主学词书。为空时按考试类型推导 */
  studyBook?: string
  /** 视觉风格：pixel / soft / calm / focus */
  styleId?: string
  /** 自定义主题的色相（0-359），仅 theme === 'custom' 时生效 */
  customHue?: number
}

export interface AchievementUnlock {
  id: string
  unlockedAt: number
}

export interface DailyQuest {
  date: string
  questIds: string[]
  progress: number[]
  chestOpened: boolean
  chestCount: number
}

/** 情景冒险的累计掌握进度；正确题 id 同时作为一次性奖励凭据。 */
export interface AdventureProgress {
  sceneId: string
  bestScore: number
  attempts: number
  correctQuestionIds: string[]
  firstPlayedAt: number
  lastPlayedAt: number
  completedAt?: number
}

/** 表达提取练习的独立调度与奖励凭据，不改变词汇 FSRS。 */
export interface ExpressionProgress {
  id: string
  sceneId: string
  attempts: number
  firstPracticedAt: number
  lastPracticedAt: number
  dueAt: number
  stage: number
  lastScheduledDate: string
  independentDays: string[]
  rewardedDates: string[]
  lastOutcome: 'independent' | 'assisted' | 'retry'
}

export type CetPracticeKind = 'reading' | 'writing' | 'translation'

/** 四六级原创专项练习档案；不改变词汇 FSRS、词汇统计或游戏奖励。 */
export interface CetPracticeRecord {
  id: string
  examType: 'cet4' | 'cet6'
  kind: CetPracticeKind
  draft: string
  updatedAt: number
  /** 阅读首次完整提交的答案，用于保留首次表现。 */
  firstSubmittedAt?: number
  firstAnswers?: number[]
  latestAnswers?: number[]
  submittedText?: string
  /** 最近一次完整提交；保存草稿不改变此时间。 */
  submittedAt?: number
  checks?: boolean[]
  /** 首次完整提交时间，之后的修改和重做不会清除。 */
  completedAt?: number
  attempts: number
}
