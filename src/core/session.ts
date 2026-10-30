import { db, todayKey } from '../db/database'
import {
  Rating,
  autoRating,
  deriveState,
  emptySnapshot,
  schedule,
} from '../core/fsrs'
import { XP_RULES } from '../core/game'
import { bumpDaily, ensureProfile, patchProfile, recomputePower, uid } from '../core/profile'
import type { ReviewLog, ReviewMode, UserWordStat, Word } from '../types/model'
import { wordInBooks, wordsForBook } from './wordbook'
import { settleStreak } from './progress'
import type { BookId } from '../types/model'

export type QuestionKind = 'choice-word' | 'choice-meaning' | 'spell' | 'listen-meaning' | 'listen-spell'

export interface Question {
  word: Word
  kind: QuestionKind
  /** 四选一选项（已打乱） */
  options?: string[]
  /** 正确答案（选项文本或拼写目标） */
  answer: string
  /** 是否为到期复习（否则是新词首次接触） */
  isReview: boolean
  stat?: UserWordStat
}

const CHOICE_KINDS: QuestionKind[] = ['choice-word', 'choice-meaning', 'listen-meaning']

/** 由词条生成干扰项释义：从同难度邻近词里取，避免「一眼假」 */
function pickDistractors(target: Word, pool: Word[], n = 3): string[] {
  const targetDef = primaryMeaning(target)
  const out: string[] = []
  const seen = new Set([targetDef])
  // 优先取词频相邻的词，选项长度更接近，难度更真实
  const sorted = [...pool].sort(
    (a, b) => Math.abs(a.freqRank - target.freqRank) - Math.abs(b.freqRank - target.freqRank),
  )
  for (const w of sorted) {
    if (w.id === target.id) continue
    const d = primaryMeaning(w)
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
    if (out.length >= n) break
  }
  return out
}

export function primaryMeaning(w: Word): string {
  return (w.definition || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? ''
}

/** Fisher–Yates，随机源用 crypto 而非 Math.random */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  const rand = new Uint32Array(1)
  for (let i = a.length - 1; i > 0; i--) {
    crypto.getRandomValues(rand)
    const j = rand[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 生成题目。
 *
 * knownWords：用户真实学过的词（含学习中），用于生成干扰项。
 * 认脸而不是认词是选择题最大的隐患——刷了几轮后用户靠「这个词没见过」
 * 就能排除干扰项。混入学过的词后，干扰项与正确答案一样「眼熟」，
 * 必须真的记住词义才能作对。
 */
export function buildQuestion(
  word: Word,
  kind: QuestionKind,
  pool: Word[],
  isReview: boolean,
  stat?: UserWordStat,
  knownWords?: Word[],
): Question {
  const meaning = primaryMeaning(word)
  if (CHOICE_KINDS.includes(kind)) {
    if (kind === 'choice-word') {
      // 看词选义：选项是释义
      const opts = shuffle([meaning, ...pickDistractors(word, pool, 3)])
      return { word, kind, options: opts, answer: meaning, isReview, stat }
    }
    // 看义/听音选词：干扰项优先从学过的词里取（需要真会），不足再从同频段补
    const near = pickOptionWords(word, pool, 3, knownWords)
    const opts = shuffle([word.word, ...near])
    return { word, kind, options: opts, answer: word.word, isReview, stat }
  }
  return { word, kind, answer: word.word, isReview, stat }
}

/**
 * 选 n 个干扰项单词。
 * 策略：学过的词（按词频接近排序）占 2/3，同频段未学的词占 1/3。
 * 全用学过的词会让熟练用户每次都见到同一批干扰项，混入新词保持新鲜感。
 */
function pickOptionWords(word: Word, pool: Word[], n: number, knownWords?: Word[]): string[] {
  const candidates = pool.filter((w) => w.id !== word.id)
  const nearSorted = [...candidates].sort(
    (a, b) => Math.abs(a.freqRank - word.freqRank) - Math.abs(b.freqRank - word.freqRank),
  )

  const known = (knownWords ?? []).filter((w) => w.id !== word.id)
  const knownSet = new Set(known.map((w) => w.id))
  const knownSorted = shuffle(known)
  const freshSorted = shuffle(nearSorted.filter((w) => !knownSet.has(w.id)))

  const wantKnown = Math.min(knownSorted.length, Math.ceil((n * 2) / 3))
  const wantFresh = n - wantKnown

  const out: string[] = []
  const seen = new Set([word.word.toLowerCase()])
  for (const w of [...knownSorted.slice(0, wantKnown), ...freshSorted.slice(0, wantFresh)]) {
    if (seen.has(w.word.toLowerCase())) continue
    seen.add(w.word.toLowerCase())
    out.push(w.word)
    if (out.length >= n) break
  }
  // 兜底：学过的词太少时用同频段补满
  for (const w of nearSorted) {
    if (out.length >= n) break
    if (seen.has(w.word.toLowerCase())) continue
    seen.add(w.word.toLowerCase())
    out.push(w.word)
  }
  return out.slice(0, n)
}

export interface SessionPlan {
  reviews: Word[]
  news: Word[]
}

/** 取今日队列：到期复习永远优先于新词（§5.1），最饥渴的（过期最久）排最前 */
export async function planSession(bookIds: string[], newLimit: number): Promise<SessionPlan> {
  const now = Date.now()
  const allStats = await db.stats.toArray()

  const dueStats = allStats
    .filter((s) => s.fsrs.due <= now && s.fsrs.reps > 0)
    .sort((a, b) => a.fsrs.due - b.fsrs.due)
  const dueWords = (await db.words.bulkGet(dueStats.map((s) => s.wordId))).filter(
    (w): w is Word => Boolean(w),
  )
  const reviews = dueWords.filter((word) => wordInBooks(word, bookIds))

  const learned = new Set(allStats.filter((stat) => stat.fsrs.reps > 0).map((s) => s.wordId))
  const news: Word[] = []
  const daily = await db.dailyLogs.get(todayKey())
  const remaining = Math.max(0, Math.floor(newLimit - (daily?.newLearned ?? 0)))
  if (remaining === 0) return { reviews, news }
  for (const bookId of bookIds) {
    const candidates = (await wordsForBook(bookId as BookId)).sort((a, b) => a.freqRank - b.freqRank)
    for (const w of candidates) {
      if (learned.has(w.id)) continue
      news.push(w)
      learned.add(w.id)
      if (news.length >= remaining) break
    }
    if (news.length >= remaining) break
  }
  return { reviews, news }
}

export interface AnswerInput {
  question: Question
  rating: Rating | 1 | 2 | 3 | 4
  elapsedMs: number
  correct: boolean
  nearMiss?: boolean
  /** 手动指定评级（用户显式选择四档时） */
  manual?: boolean
}

/** 提交一次作答：写 review_log（append-only）+ 更新派生状态 + 计分 */
export async function submitAnswer(input: AnswerInput): Promise<{
  stat: UserWordStat
  rating: number
  xp: number
  coins: number
  nextDue: number
  /** 本次写入的日志 id，供「改评级」定位 */
  logId: string
}> {
  const { question, elapsedMs, correct, nearMiss, manual } = input

  // 计分必须与作答记录同一事务：中途关页面不会出现「日志写了、经验没加」。
  // 先取得事务再读取卡片与余额，避免覆盖另一标签刚写入的复习或奖励。
  const result = await db.transaction(
    'rw',
    [db.stats, db.reviewLogs, db.dailyLogs, db.profile, db.words],
    async () => {
      const profile = await ensureProfile()
      const now = Date.now()
      const existing = await db.stats.get(question.word.id)
      const baseSnap = existing?.fsrs ?? emptySnapshot(now)
      const isFirstEver = !existing || existing.fsrs.reps === 0
      const rating = manual
        ? (input.rating as number)
        : autoRating({ correct, elapsedMs, nearMiss, mode: question.kind as ReviewMode })
      const nextSnap = schedule(baseSnap, rating as 1 | 2 | 3 | 4, now)
      const nextState = deriveState(nextSnap)
      const stat: UserWordStat = {
        wordId: question.word.id,
        fsrs: nextSnap,
        state: nextState,
        mistakeCount: (existing?.mistakeCount ?? 0) + (correct ? 0 : 1),
        correctCount: (existing?.correctCount ?? 0) + (correct ? 1 : 0),
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastReviewedAt: now,
      }
      const log: ReviewLog = {
        id: uid(), wordId: question.word.id, rating, reviewedAt: now,
        deviceId: profile.deviceId, elapsedMs, mode: question.kind as ReviewMode, correct,
      }
      await db.stats.put(stat)
      await db.reviewLogs.add(log)

      // 计分：经验只由真实掌握事件产生，学习时长不给经验（§2.2）
      let xp = 0
      let coins = 0
      if (correct) {
        if (isFirstEver) {
          xp += XP_RULES.newWord
        } else if (rating === Rating.Hard) {
          xp += XP_RULES.reviewHard
        } else {
          xp += XP_RULES.reviewCorrect
        }
        coins += 1
      }

      await bumpDaily({
        // 「新词」只统计首次接触且答对的词——答错不算学会，避免虚高（§2.2 反空洞）
        newLearned: isFirstEver && correct ? 1 : 0,
        reviewsDone: isFirstEver ? 0 : 1,
        xp,
        coinsEarned: coins,
        correctCount: correct ? 1 : 0,
        totalAnswered: 1,
        studySeconds: Math.min(120, Math.round(elapsedMs / 1000)),
      })

      const newXp = profile.xp + xp
      await patchProfile({ xp: newXp, coins: profile.coins + coins })

      if ((nextState === 'mastered') !== (existing?.state === 'mastered')) {
        await recomputePower()
      }
      return { stat, rating, xp, coins, nextDue: nextSnap.due, logId: log.id }
    },
  )

  // 答完第一题即视为今日已学习 → 立即结算打卡，避免依赖页面刷新
  await settleStreak()

  return result
}

/**
 * 修正刚提交那题的评级（用户在反馈卡点「手动调整评级」时）。
 *
 * 关键：不能重新走一遍 submitAnswer —— 那会写第二条日志、重复加经验、
 * 并把 FSRS 又推进一次。正确做法是改写刚才那条日志的 rating，然后
 * 用该词的全部日志重放，得到新的状态。日志仍是 append-only 语义的
 * 唯一真相来源，只是允许修正最新一条（同一秒内的用户自纠）。
 */
export async function overrideRating(
  wordId: string,
  logId: string,
  rating: 1 | 2 | 3 | 4,
): Promise<{ nextDue: number } | null> {
  const log = await db.reviewLogs.get(logId)
  if (!log || log.wordId !== wordId) return null

  await db.reviewLogs.update(logId, { rating })

  // 重放该词的全部日志
  const logs = await db.reviewLogs.where('wordId').equals(wordId).sortBy('reviewedAt')
  let snap = emptySnapshot(logs[0].reviewedAt)
  let correctCount = 0
  let mistakeCount = 0
  for (const l of logs) {
    snap = schedule(snap, (l.rating as 1 | 2 | 3 | 4) ?? 3, l.reviewedAt)
    if (l.correct) correctCount++
    else mistakeCount++
  }

  const existing = await db.stats.get(wordId)
  const stat: UserWordStat = {
    wordId,
    fsrs: snap,
    state: deriveState(snap),
    mistakeCount,
    correctCount,
    firstSeenAt: logs[0].reviewedAt,
    lastReviewedAt: logs[logs.length - 1].reviewedAt,
  }
  await db.stats.put(stat)

  // 评级改动可能让词跨过「掌握」阈值，重算战力
  if ((existing?.state === 'mastered') !== (stat.state === 'mastered')) {
    await recomputePower()
  }

  return { nextDue: snap.due }
}

/** 今日进度概览：只用计数查询，别把全表词条物化进内存 */
export async function todayProgress() {
  const date = todayKey()
  const now = Date.now()
  const [daily, dueCount, masteredCount, learnedCount] = await Promise.all([
    db.dailyLogs.get(date),
    db.stats
      .where('fsrs.due')
      .belowOrEqual(now)
      .filter((s) => s.fsrs.reps > 0)
      .count(),
    db.stats.where('state').equals('mastered').count(),
    db.stats.filter((s) => s.fsrs.reps > 0).count(),
  ])
  return {
    newLearned: daily?.newLearned ?? 0,
    reviewsDone: daily?.reviewsDone ?? 0,
    dueCount,
    masteredCount,
    learnedCount,
    xp: daily?.xp ?? 0,
    accuracy: daily && daily.totalAnswered > 0 ? daily.correctCount / daily.totalAnswered : null,
  }
}
