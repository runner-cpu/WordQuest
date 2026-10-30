import { db, dateKeyOffset, todayKey } from '../db/database'
import { ensureProfile } from './profile'

/**
 * 周报：把过去 7 天的数据聚合成一张可回顾的卡片。
 *
 * 数据早已存在 dailyLogs 里，缺的是一次仪式性的回顾。
 * 每周第一次打开时在今日页弹出，看过就不再打扰。
 */

export interface WeeklyReport {
  /** 周期标识：本周一~周日的周一日期，用于「已看过」判断 */
  weekId: string
  /** 学过的词（首次接触）总数 */
  newWords: number
  /** 复习次数 */
  reviews: number
  /** 精听分钟 */
  listeningMinutes: number
  /** 词卡答题总数与正确数 */
  answered: number
  correct: number
  /** 有学习记录的天数（0-7） */
  activeDays: number
  /** 词卡练习正确率 */
  avgAccuracy: number
  /** 连续有效天数（周报时刻的快照） */
  streak: number
  /** 与上周相比的变化（正数=进步） */
  deltaVsPrev: number
  /** 一句话评语 */
  comment: string
}

const SEEN_KEY = 'wq:weekly-seen'

function weekIdOf(d = new Date()): string {
  // 本周一
  const monday = new Date(d)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return todayKey(monday)
}

export async function buildWeeklyReport(): Promise<WeeklyReport | null> {
  const days = Array.from({ length: 7 }, (_, i) => dateKeyOffset(-i))
  const prevDays = Array.from({ length: 7 }, (_, i) => dateKeyOffset(-7 - i))
  const [rows, prevRows, profile] = await Promise.all([
    db.dailyLogs.bulkGet(days),
    db.dailyLogs.bulkGet(prevDays),
    ensureProfile(),
  ])

  const sum = (list: typeof rows, key: 'newLearned' | 'reviewsDone' | 'listeningSeconds' | 'totalAnswered' | 'correctCount') =>
    list.reduce((a, r) => a + (r?.[key] ?? 0), 0)

  const newWords = sum(rows, 'newLearned')
  const reviews = sum(rows, 'reviewsDone')
  const answered = sum(rows, 'totalAnswered')
  const correct = sum(rows, 'correctCount')
  const listeningSeconds = sum(rows, 'listeningSeconds')
  const listeningMinutes = Math.round(listeningSeconds / 60)
  const activeDays = rows.filter((r) => r?.effectiveDay).length
  const avgAccuracy = answered > 0 ? correct / answered : 0

  const prevAnswered = sum(prevRows, 'totalAnswered')
  const prevCorrect = sum(prevRows, 'correctCount')
  const prevAcc = prevAnswered > 0 ? prevCorrect / prevAnswered : null
  const deltaVsPrev = prevAcc == null ? 0 : Math.round((avgAccuracy - prevAcc) * 100)

  // 只描述已观察到的练习记录，不从活动量推断考试准备程度。
  let comment: string
  if (answered === 0 && listeningSeconds === 0) {
    comment = '本周还没有词卡或听力练习记录，可以先完成一轮词卡练习。'
  } else if (answered === 0) {
    comment = '本周已记录听力练习，词卡练习尚无作答记录。'
  } else if (deltaVsPrev >= 5) {
    comment = '本周词卡练习正确率比上周高，可继续回看容易遗忘的词。'
  } else if (deltaVsPrev <= -5) {
    comment = '本周词卡练习正确率比上周低，可以先回看错词；题型和词汇难度也会影响结果。'
  } else if (activeDays >= 6) {
    comment = '几乎每天都在学，坚持本身就是胜利。'
  } else if (listeningSeconds === 0) {
    comment = '这周还没练过听力，可以先从一句短文开始。'
  } else {
    comment = '本周有词汇和听力练习记录，可以结合到期复习安排下一次学习。'
  }

  return {
    weekId: weekIdOf(),
    newWords,
    reviews,
    listeningMinutes,
    answered,
    correct,
    activeDays,
    avgAccuracy,
    streak: profile.streak,
    deltaVsPrev,
    comment,
  }
}

/** 本周的周报是否已经看过 */
export function weeklySeen(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')[weekIdOf()] === true
  } catch {
    return false
  }
}

export function markWeeklySeen() {
  try {
    const map = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
    // 只保留最近 8 周，防止无限增长
    const entries = Object.entries({ ...map, [weekIdOf()]: true })
    const trimmed = Object.fromEntries(entries.slice(-8))
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed))
  } catch {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ [weekIdOf()]: true }))
  }
}
