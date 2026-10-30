import { ADVENTURE_EXPRESSIONS } from '../data/adventureExpressions'
import { db, todayKey } from '../db/database'
import type { ExpressionProgress } from '../types/model'
import { bumpDaily, ensureProfile, patchProfile } from './profile'
import { settleStreak } from './progress'

const INTERVAL_DAYS = [1, 3, 7, 14, 30]

/** 容忍排版与句末标点差异，保留句内内容以便精确匹配。 */
export function normalizeExpressionAnswer(answer: string): string {
  if (typeof answer !== 'string' || [...answer].length > 160) throw new Error('请填写不超过 160 字的表达')
  return answer.normalize('NFKC').toLowerCase().replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ').trim().replace(/[.!?。！？]+$/u, '').trim()
}

export function matchExpressionAnswer(answer: string, acceptedAnswers: readonly string[]): boolean {
  const normalized = normalizeExpressionAnswer(answer)
  return normalized.length > 0 && acceptedAnswers.some((accepted) => normalizeExpressionAnswer(accepted) === normalized)
}

export interface ExpressionAttemptResult {
  correct: boolean
  independent: boolean
  scheduled: boolean
  xp: number
  coins: number
  progress: ExpressionProgress
}

function dueOnCalendarDay(now: number, days: number): number {
  const due = new Date(now)
  due.setHours(0, 0, 0, 0)
  due.setDate(due.getDate() + days)
  return due.getTime()
}

/** 一次真实尝试只在首次或到期日推进调度，重复练习保留当日奖励凭据。 */
export async function finishExpressionAttempt(
  id: string,
  answer: string,
  usedHint: boolean,
  elapsedMs: number,
): Promise<ExpressionAttemptResult> {
  const expression = ADVENTURE_EXPRESSIONS.find((item) => item.id === id)
  if (!expression) throw new Error('未找到这道表达练习')
  if (typeof usedHint !== 'boolean' || !Number.isFinite(elapsedMs)) throw new Error('练习信息无效，请重新进入')
  const normalized = normalizeExpressionAnswer(answer)
  if (!normalized && !usedHint) throw new Error('请先填写你的表达，或选择查看参考')
  const correct = matchExpressionAnswer(answer, expression.acceptedAnswers)
  const independent = correct && !usedHint
  const studySeconds = Math.max(0, Math.min(300, Math.round(elapsedMs / 1000)))

  return db.transaction('rw', [db.expressions, db.profile, db.dailyLogs], async () => {
    const previous = await db.expressions.get(id)
    const now = Date.now()
    const today = todayKey(new Date(now))
    const scheduled = !previous || (previous.dueAt <= now && previous.lastScheduledDate !== today)
    const stage = scheduled ? independent ? Math.min((previous?.stage ?? 0) + 1, 5) : 0 : previous.stage
    const independentDays = new Set(previous?.independentDays ?? [])
    const rewardedDates = new Set(previous?.rewardedDates ?? [])
    const reward = scheduled && independent && !rewardedDates.has(today)
    if (scheduled && independent) independentDays.add(today)
    if (reward) rewardedDates.add(today)
    const xp = reward ? 3 : 0
    const coins = reward ? 1 : 0
    const progress: ExpressionProgress = {
      id,
      sceneId: expression.sceneId,
      attempts: (previous?.attempts ?? 0) + 1,
      firstPracticedAt: previous?.firstPracticedAt ?? now,
      lastPracticedAt: now,
      dueAt: scheduled ? dueOnCalendarDay(now, independent ? INTERVAL_DAYS[stage - 1] : 1) : previous.dueAt,
      stage,
      lastScheduledDate: scheduled ? today : previous.lastScheduledDate,
      independentDays: [...independentDays],
      rewardedDates: [...rewardedDates],
      lastOutcome: independent ? 'independent' : correct ? 'assisted' : 'retry',
    }
    const profile = await ensureProfile()
    await db.expressions.put(progress)
    await bumpDaily({ studySeconds, xp, coinsEarned: coins }, today)
    await patchProfile({ xp: profile.xp + xp, coins: profile.coins + coins })
    await settleStreak()
    return { correct, independent, scheduled, xp, coins, progress }
  })
}
