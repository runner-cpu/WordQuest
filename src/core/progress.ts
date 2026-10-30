import { db, dateKeyOffset, todayKey } from '../db/database'
import { COIN_RULES, FREEZE_RULES } from './game'
import { bumpDaily, ensureProfile, patchProfile } from './profile'
import { wordInBooks } from './wordMembership'
import { BOOKS } from './wordbook'
import { ADVENTURE_SCENE_IDS } from '../data/adventureIds'
import { ACHIEVEMENTS, createAchievementLogAccumulator, type AchievementCtx, type AchievementDef, type AchievementLogFacts } from './achievements'
import type { DailyQuest, ReviewLog } from '../types/model'

export { ACHIEVEMENTS, achievementProgress } from './achievements'
export type { AchievementDef, AchievementCtx, AchievementCategory } from './achievements'

let logCache: {
  count: number
  latestAt: number
  ids: Set<string>
  accumulator: ReturnType<typeof createAchievementLogAccumulator>
} | undefined
let pendingFacts: { count: number; promise: Promise<AchievementLogFacts> } | undefined

/** 正常作答只读取新增日志；导入早于游标的旧日志时重新建立聚合。 */
async function achievementLogFacts(count: number): Promise<AchievementLogFacts> {
  if (logCache?.count === count) return logCache.accumulator.snapshot()
  if (pendingFacts) {
    if (pendingFacts.count === count) return pendingFacts.promise
    await pendingFacts.promise
    return achievementLogFacts(count)
  }
  const promise = (async () => {
    if (count === 0) {
      logCache = { count: 0, latestAt: 0, ids: new Set(), accumulator: createAchievementLogAccumulator() }
      return logCache.accumulator.snapshot()
    }
    let incoming: ReviewLog[] = []
    if (logCache && count > logCache.count) {
      incoming = (await db.reviewLogs.where('reviewedAt').aboveOrEqual(logCache.latestAt).toArray())
        .filter((log) => !logCache!.ids.has(log.id))
    }
    if (!logCache || incoming.length !== count - logCache.count) {
      incoming = await db.reviewLogs.orderBy('reviewedAt').toArray()
      logCache = { count: 0, latestAt: 0, ids: new Set(), accumulator: createAchievementLogAccumulator() }
    }
    incoming.sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id))
    for (const log of incoming) {
      logCache.accumulator.add(log)
      logCache.ids.add(log.id)
      logCache.latestAt = Math.max(logCache.latestAt, log.reviewedAt)
    }
    logCache.count = count
    return logCache.accumulator.snapshot()
  })()
  pendingFacts = { count, promise }
  try { return await promise } finally { if (pendingFacts?.promise === promise) pendingFacts = undefined }
}

/** 只读上下文，供解锁、成就馆和今日追踪共用；不写学习数据。 */
export async function buildAchievementCtx(): Promise<AchievementCtx> {
  const [daily, profile, adventureRows, expressionRows] = await Promise.all([
    db.dailyLogs.toArray(), ensureProfile(), db.adventures.toArray(), db.expressions.toArray(),
  ])
  const [mastered, learned] = await Promise.all([
    db.stats.where('state').equals('mastered').count(),
    db.stats.filter((stat) => stat.fsrs.reps > 0).count(),
  ])
  const [cet4IdsArr, masteredKeys] = await Promise.all([
    db.words.filter((word) => wordInBooks(word, ['cet4-full'])).primaryKeys(),
    db.stats.where('state').equals('mastered').primaryKeys(),
  ])
  const cet4Ids = new Set(cet4IdsArr as string[])
  const cet4Mastered = (masteredKeys as string[]).filter((id) => cet4Ids.has(id)).length
  const cet4Total = BOOKS.find((book) => book.id === 'cet4-full')?.total ?? cet4Ids.size
  const bookMasteryRatio = cet4Total > 0 ? cet4Mastered / cet4Total : 0
  const perfectDays = daily.filter((day) => day.totalAnswered >= 20 && day.correctCount === day.totalAnswered).length
  let accuracyStreakDays = 0
  let currentRun = 0
  let previousDate = ''
  for (const day of [...daily].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.totalAnswered >= 5 && day.correctCount / day.totalAnswered >= 0.9) {
      currentRun = previousDate && dateKeyOffset(1, new Date(`${previousDate}T00:00:00`)) === day.date ? currentRun + 1 : 1
      accuracyStreakDays = Math.max(accuracyStreakDays, currentRun)
      previousDate = day.date
    } else { currentRun = 0; previousDate = '' }
  }
  const listeningDays = daily.filter((day) => day.listeningSeconds > 0 || (day.listeningSentences ?? 0) > 0).length
  const studyDates = new Set(daily.filter((day) => day.totalAnswered > 0 || day.listeningSeconds > 0 || (day.listeningSentences ?? 0) > 0 || day.studySeconds > 0).map((day) => day.date))
  const sceneIds = new Set<string>(ADVENTURE_SCENE_IDS)
  const adventures = adventureRows.filter((row) => sceneIds.has(row.sceneId))
  for (const row of adventures) {
    if (row.firstPlayedAt > 0) studyDates.add(todayKey(new Date(row.firstPlayedAt)))
    if (row.lastPlayedAt > 0) studyDates.add(todayKey(new Date(row.lastPlayedAt)))
  }
  const adventureCompleted = adventures.filter((row) => row.bestScore >= 2).length
  const adventurePerfect = adventures.filter((row) => row.bestScore >= 3).length
  // 表达目录每个情景恰有两句；统计只依赖轻量索引，不把全部题库带进首页入口。
  const expressionIds = new Set(ADVENTURE_SCENE_IDS.flatMap((id) => [`${id}-say-1`, `${id}-say-2`]))
  const expressions = expressionRows.filter((row) => row.attempts > 0 && expressionIds.has(row.id) &&
    (row.id === `${row.sceneId}-say-1` || row.id === `${row.sceneId}-say-2`))
  const validDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00`)) && todayKey(new Date(`${day}T00:00:00`)) === day
  let expressionIndependent = 0
  let expressionRetained = 0
  for (const row of expressions) {
    const independentDays = new Set((Array.isArray(row.independentDays) ? row.independentDays : []).filter(validDay))
    if (independentDays.size > 0) expressionIndependent++
    if (independentDays.size > 1) expressionRetained++
    for (const day of independentDays) studyDates.add(day)
    if (Number.isFinite(row.firstPracticedAt) && row.firstPracticedAt > 0) studyDates.add(todayKey(new Date(row.firstPracticedAt)))
    if (Number.isFinite(row.lastPracticedAt) && row.lastPracticedAt > 0) studyDates.add(todayKey(new Date(row.lastPracticedAt)))
  }
  const reviewsDone = daily.reduce((total, day) => total + day.reviewsDone, 0)
  const listeningSentences = daily.reduce((total, day) => total + (day.listeningSentences ?? 0), 0)
  const facts = await achievementLogFacts(await db.reviewLogs.count())
  return {
    streak: profile.streak, mastered, learned, bookMasteryRatio, perfectDays, accuracyStreakDays,
    listeningDays, studyDays: studyDates.size, reviewsDone, listeningSentences,
    listeningSeconds: daily.reduce((total, day) => total + day.listeningSeconds, 0),
    totalAnswered: daily.reduce((total, day) => total + day.totalAnswered, 0),
    adventureCompleted, adventurePerfect, expressionIndependent, expressionRetained, ...facts,
    learningDimensions: [learned > 0, reviewsDone > 0, facts.spellingCorrect > 0, listeningSentences > 0, adventureCompleted > 0 || expressions.length > 0].filter(Boolean).length,
  }
}

export function recordCombo(n: number) {
  const cur = Number(localStorage.getItem('wq:max-combo') ?? 0)
  if (n > cur) localStorage.setItem('wq:max-combo', String(n))
}

/** 检查并解锁成就，返回本次新解锁的成就 */
export async function checkAchievements(): Promise<AchievementDef[]> {
  const ctx = await buildAchievementCtx()
  const eligible = ACHIEVEMENTS.filter((achievement) => achievement.check(ctx))
  if (eligible.length === 0) return []
  // 上下文扫描在事务外完成；取得写锁后重新查重，多个页面/标签同时检查也只发一次。
  // 与作答、听力奖励共享 profile/dailyLogs 写锁，读余额到写入奖励属于同一次提交。
  return db.transaction('rw', [db.achievements, db.profile, db.dailyLogs], async () => {
    const unlocked = await db.achievements.bulkGet(eligible.map((achievement) => achievement.id))
    const newly = eligible.filter((_, index) => !unlocked[index])
    if (newly.length === 0) return []
    await db.achievements.bulkPut(newly.map((a) => ({ id: a.id, unlockedAt: Date.now() })))
    const profile = await ensureProfile()
    const coins = newly.length * COIN_RULES.achievement
    await patchProfile({ coins: profile.coins + coins })
    await bumpDaily({ coinsEarned: coins })
    return newly
  })
}

/** 打卡结算：更新连击、发放冻结券（§4.2） */
/**
 * 段位休眠判定（§4.1）：连续 30 天未学习则标记休眠。
 * 只影响展示（图标灰显），不扣战力、不掉段位。回访即恢复。
 */
export async function checkDormancy(): Promise<boolean> {
  const profile = await ensureProfile()
  if (!profile.lastStudyDate) return false
  // 补 T00:00:00 按本地时区解析，纯日期字符串会被当 UTC，天数差一天
  const days = Math.floor(
    (Date.now() - new Date(`${profile.lastStudyDate}T00:00:00`).getTime()) / 86400000,
  )
  const shouldSleep = days >= 30
  if (shouldSleep !== profile.dormancy) {
    await patchProfile({ dormancy: shouldSleep })
  }
  return shouldSleep
}

export async function settleStreak(): Promise<{ streak: number; freezeGranted: boolean }> {
  const profile = await ensureProfile()
  const today = todayKey()
  const yesterday = dateKeyOffset(-1)
  if (profile.lastStudyDate === today) return { streak: profile.streak, freezeGranted: false }

  let streak: number
  if (!profile.lastStudyDate) {
    streak = 1
  } else if (profile.lastStudyDate === yesterday) {
    streak = profile.streak + 1
  } else {
    // 断签不清零：回退到最近 7 天的整数档位（§4.2）
    // 日期键补 T00:00:00 按本地时区解析——纯日期字符串 new Date() 会按 UTC 解析，东八区天数会差一天
    const days = Math.max(
      1,
      Math.round(
        (new Date(`${today}T00:00:00`).getTime() - new Date(`${profile.lastStudyDate}T00:00:00`).getTime()) /
          86400000,
      ),
    )
    if (days > 1 && profile.freezes > 0 && days <= 2) {
      // 有冻结券且只漏一天：保住连击
      streak = profile.streak + 1
      await patchProfile({ freezes: profile.freezes - 1 })
    } else {
      streak = Math.max(1, Math.floor(profile.streak / 7) * 7)
    }
  }

  // 连续 7 天赠 1 张冻结券
  const tier = Math.floor(streak / FREEZE_RULES.streakDaysPerFreeze)
  let freezeGranted = false
  if (tier > profile.streakRewardTier) {
    freezeGranted = true
    await patchProfile({
      freezes: profile.freezes + (tier - profile.streakRewardTier),
      streakRewardTier: tier,
    })
  }

  await patchProfile({ streak, lastStudyDate: today, dormancy: false })
  return { streak, freezeGranted }
}

export interface QuestDef {
  id: string
  name: string
  target: number
  unit: string
  progress: (d: { newLearned: number; reviewsDone: number; listeningSeconds: number }) => number
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'learn-20', name: '学 20 个新词', target: 20, unit: '词', progress: (d) => d.newLearned },
  { id: 'learn-10', name: '学 10 个新词', target: 10, unit: '词', progress: (d) => d.newLearned },
  { id: 'review-all', name: '清空到期复习', target: 15, unit: '词', progress: (d) => d.reviewsDone },
  { id: 'review-10', name: '复习 10 个词', target: 10, unit: '词', progress: (d) => d.reviewsDone },
  { id: 'listen-1min', name: '精听 1 分钟', target: 60, unit: '秒', progress: (d) => d.listeningSeconds },
  { id: 'listen-5min', name: '精听 5 分钟', target: 300, unit: '秒', progress: (d) => d.listeningSeconds },
]

function seedFor(date: string): number {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function pickDailyQuests(date = todayKey()): QuestDef[] {
  const seed = seedFor(date)
  const pool = [...QUEST_POOL]
  const picked: QuestDef[] = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seed + i * 7) % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

/** 「清空到期复习」的目标按当天实际到期量动态收敛，否则到期词不足 15 个时任务永远做不完 */
function resolveTarget(def: QuestDef, dueCount: number): number {
  if (def.id !== 'review-all') return def.target
  // 没有到期词时该任务天然达成（真空完成），而不是变成一个不可能完成的任务
  if (dueCount <= 0) return 0
  return Math.min(def.target, dueCount)
}

/**
 * 读取今日任务进度 —— 纯读，可安全用于 useLiveQuery。
 * 任务行的初始化由 ensureTodayQuests 负责，避免在 liveQuery 里写库
 * （Dexie 会抛 "Readwrite transaction in liveQuery context"）。
 */
export async function getTodayQuests(): Promise<{ row: DailyQuest; defs: QuestDef[]; progress: number[] }> {
  const date = todayKey()
  const defs = pickDailyQuests(date)
  const row: DailyQuest =
    (await db.quests.get(date)) ?? {
      date,
      questIds: defs.map((d) => d.id),
      progress: defs.map(() => 0),
      chestOpened: false,
      chestCount: 0,
    }
  const daily = await db.dailyLogs.get(date)
  // 今日到期总量（含已完成的部分），用于收敛 review-all 的目标
  const now = Date.now()
  const stats = await db.stats.toArray()
  const dueTotal = stats.filter((s) => s.fsrs.reps > 0 && s.fsrs.due <= now).length
  const dueCount = dueTotal + (daily?.reviewsDone ?? 0)
  const progress = defs.map((d) => {
    const target = resolveTarget(d, dueCount)
    return Math.min(
      target,
      d.progress({
        newLearned: daily?.newLearned ?? 0,
        reviewsDone: daily?.reviewsDone ?? 0,
        listeningSeconds: daily?.listeningSeconds ?? 0,
      }),
    )
  })
  // 把收敛后的目标回写到 defs，UI 直接用 defs[i].target 展示
  const resolvedDefs = defs.map((d) => ({ ...d, target: resolveTarget(d, dueCount) }))
  return { row, defs: resolvedDefs, progress }
}

/** 确保今日任务行已落库（在渲染外的副作用里调用） */
export async function ensureTodayQuests(): Promise<DailyQuest> {
  const date = todayKey()
  const existing = await db.quests.get(date)
  if (existing) return existing
  const defs = pickDailyQuests(date)
  const row: DailyQuest = {
    date,
    questIds: defs.map((d) => d.id),
    progress: defs.map(() => 0),
    chestOpened: false,
    chestCount: 0,
  }
  await db.quests.put(row)
  return row
}

/** 全部完成开每日宝箱：确定性奖励（§4.5） */
export async function claimChest(): Promise<{ coins: number; fragment: boolean } | null> {
  return db.transaction('rw', [db.quests, db.profile, db.dailyLogs, db.stats], async () => {
    await ensureTodayQuests()
    const { row, defs, progress } = await getTodayQuests()
    if (row.chestOpened) return null
    const allDone = progress.every((p, i) => p >= defs[i].target)
    if (!allDone) return null

    // 旧版本每个日期的 chestCount 都从 0 开始，不能把它当作累计值。
    // 用已开启的任务行计数，旧数据也会自然计入下一次奖励。
    const chestCount = (await db.quests.filter((q) => q.chestOpened).count()) + 1
    const profile = await ensureProfile()
    const awardedTier = profile.chestRewardTier ?? 0
    const fragment = Math.floor(chestCount / 5) > awardedTier
    const coins = COIN_RULES.questAll
    await db.quests.put({ ...row, chestOpened: true, chestCount })
    await patchProfile({
      coins: profile.coins + coins,
      themeFragments: (profile.themeFragments ?? 0) + (fragment ? 1 : 0),
      // 历史漏发奖励逐次补一枚，与反馈里的单枚碎片语义一致。
      chestRewardTier: awardedTier + (fragment ? 1 : 0),
    })
    await bumpDaily({ coinsEarned: coins })
    return { coins, fragment }
  })
}
