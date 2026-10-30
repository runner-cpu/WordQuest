import { db, todayKey } from '../db/database'
import { RANKS, computePower, difficultyWeight } from '../core/game'
import type { DailyLog, Profile } from '../types/model'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultProfile(): Profile {
  return {
    id: 'me',
    level: 1,
    xp: 0,
    power: 0,
    powerPeak: 0,
    rankId: RANKS[0].id,
    coins: 0,
    streak: 0,
    freezes: 0,
    dormancy: false,
    theme: 'night',
    mascot: { name: '阿词', skin: 'default' },
    dailyNewTarget: 20,
    onboarded: false,
    deviceId: uid(),
    schemaVersion: 1,
    streakRewardTier: 0,
  }
}

export async function ensureProfile(): Promise<Profile> {
  const existing = await db.profile.get('me')
  if (existing) return existing
  const p = defaultProfile()
  await db.profile.put(p)
  return p
}

export async function patchProfile(patch: Partial<Profile>): Promise<Profile> {
  const cur = await ensureProfile()
  const next = { ...cur, ...patch }
  await db.profile.put(next)
  return next
}

export function emptyDaily(date = todayKey()): DailyLog {
  return {
    date,
    newLearned: 0,
    reviewsDone: 0,
    listeningSeconds: 0,
    listeningSentences: 0,
    xp: 0,
    coinsEarned: 0,
    correctCount: 0,
    totalAnswered: 0,
    effectiveDay: false,
    studySeconds: 0,
  }
}

export async function getDaily(date = todayKey()): Promise<DailyLog> {
  return (await db.dailyLogs.get(date)) ?? emptyDaily(date)
}

export async function bumpDaily(patch: Partial<DailyLog>, date = todayKey()): Promise<DailyLog> {
  const cur = await getDaily(date)
  const next: DailyLog = {
    ...cur,
    ...patch,
    newLearned: cur.newLearned + (patch.newLearned ?? 0),
    reviewsDone: cur.reviewsDone + (patch.reviewsDone ?? 0),
    listeningSeconds: cur.listeningSeconds + (patch.listeningSeconds ?? 0),
    listeningSentences: (cur.listeningSentences ?? 0) + (patch.listeningSentences ?? 0),
    xp: cur.xp + (patch.xp ?? 0),
    coinsEarned: cur.coinsEarned + (patch.coinsEarned ?? 0),
    correctCount: cur.correctCount + (patch.correctCount ?? 0),
    totalAnswered: cur.totalAnswered + (patch.totalAnswered ?? 0),
    studySeconds: cur.studySeconds + (patch.studySeconds ?? 0),
  }
  next.effectiveDay = next.studySeconds >= 600 || next.newLearned >= 10 || next.reviewsDone >= 10
  await db.dailyLogs.put(next)
  return next
}

/**
 * 统一发放经验与金币：同时写 daily_log 与 profile。
 *
 * 这两处必须一起更新。历史上有过只写 daily 的路径（听力），
 * 结果每日汇总里有经验、但等级永远不涨。
 */
export async function awardRewards(opts: {
  xp?: number
  coins?: number
  studySeconds?: number
  listeningSeconds?: number
  listeningSentences?: number
}): Promise<{ xp: number; coins: number; totalXp: number }> {
  const xp = Math.max(0, Math.round(opts.xp ?? 0))
  const coins = Math.max(0, Math.round(opts.coins ?? 0))
  return db.transaction('rw', [db.profile, db.dailyLogs], async () => {
    await bumpDaily({
      xp,
      coinsEarned: coins,
      studySeconds: opts.studySeconds ?? 0,
      listeningSeconds: opts.listeningSeconds ?? 0,
      listeningSentences: opts.listeningSentences ?? 0,
    })
    const profile = await ensureProfile()
    const next = await patchProfile({ xp: profile.xp + xp, coins: profile.coins + coins })
    return { xp, coins, totalXp: next.xp }
  })
}

/** 由 review_log 全量重放推导掌握词与战力（§8.3 事件日志模型） */
export async function recomputePower(): Promise<{ power: number; peak: number; masteredCount: number }> {
  const mastered = await db.stats.where('state').equals('mastered').toArray()
  // 一次 bulkGet 取齐，别对每个掌握词发一条 get（千词即千次串行查询）
  const words = await db.words.bulkGet(mastered.map((s) => s.wordId))
  const weights = words.map((w) => w?.difficultyWeight ?? difficultyWeight(w?.freqRank))
  const power = computePower({ masteredWeights: weights })
  const profile = await ensureProfile()
  const peak = Math.max(profile.powerPeak, power)
  const rankId = [...RANKS].reverse().find((r) => peak >= r.threshold)?.id ?? RANKS[0].id
  await patchProfile({ power, powerPeak: peak, rankId })
  return { power, peak, masteredCount: mastered.length }
}
