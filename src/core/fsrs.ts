import {
  createEmptyCard,
  ConvertStepUnitToMinutes,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs'
import type { FsrsSnapshot, ReviewMode, WordState } from '../types/model'

/**
 * FSRS 调度封装（§5.1）。
 * 参数优化器是原生模块，浏览器跑不了 —— MVP 使用官方默认参数，
 * 个性化优化不承诺。学习步长保持官方默认（1m / 10m）。
 */
const params = generatorParameters({
  enable_fuzz: true,
  enable_short_term: true,
  maximum_interval: 365 * 3,
})

export const scheduler = fsrs(params)

export { Rating, State }
export type { Card }

/** 掌握阈值：进入 Review 且间隔 ≥ 21 天即视为「掌握」（§5.1） */
export const MASTERED_MIN_INTERVAL_DAYS = 21

export function emptySnapshot(now = Date.now()): FsrsSnapshot {
  const card = createEmptyCard(new Date(now))
  return toSnapshot(card)
}

export function toSnapshot(card: Card): FsrsSnapshot {
  return {
    due: new Date(card.due).getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review).getTime() : undefined,
  }
}

export function toCard(snap: FsrsSnapshot): Card {
  return {
    due: new Date(snap.due),
    stability: snap.stability,
    difficulty: snap.difficulty,
    elapsed_days: snap.elapsed_days,
    scheduled_days: snap.scheduled_days,
    reps: snap.reps,
    lapses: snap.lapses,
    learning_steps: snap.learning_steps ?? legacyLearningStep(snap),
    state: snap.state as State,
    last_review: snap.last_review ? new Date(snap.last_review) : undefined,
  }
}

/** 旧快照漏存步进：十分钟后的 Learning 卡已通过第一步，应在下一次 Good 时毕业。 */
function legacyLearningStep(snap: FsrsSnapshot): number {
  if (snap.state !== State.Learning || snap.last_review === undefined) return 0
  const delay = snap.due - snap.last_review
  const step = params.learning_steps.findIndex(
    (duration, index) => index > 0 && ConvertStepUnitToMinutes(duration) * 60000 === delay,
  )
  return Math.max(0, step)
}

/** 下一次评级后的卡片快照（不写库，纯函数，便于预览四档结果） */
export function preview(snap: FsrsSnapshot, now = Date.now()): Record<1 | 2 | 3 | 4, FsrsSnapshot> {
  const card = toCard(snap)
  const rec = scheduler.repeat(card, new Date(now))
  return {
    1: toSnapshot(rec[Rating.Again].card),
    2: toSnapshot(rec[Rating.Hard].card),
    3: toSnapshot(rec[Rating.Good].card),
    4: toSnapshot(rec[Rating.Easy].card),
  }
}

export function schedule(snap: FsrsSnapshot, rating: Grade, now = Date.now()): FsrsSnapshot {
  const card = toCard(snap)
  const rec = scheduler.repeat(card, new Date(now))
  return toSnapshot(rec[rating].card)
}

/** 由 FSRS 状态推导业务状态 */
export function deriveState(snap: FsrsSnapshot): WordState {
  if (snap.reps === 0) return 'new'
  if (snap.state === State.Review && snap.scheduled_days >= MASTERED_MIN_INTERVAL_DAYS) return 'mastered'
  if (snap.state === State.Review) return 'review'
  return 'learning'
}

export function isDue(snap: FsrsSnapshot, now = Date.now()): boolean {
  return snap.reps > 0 && snap.due <= now
}

/**
 * 自动评级：由作答正确性与用时推导，避免每张卡都让用户选四档（降低摩擦）。
 * - 答错 → Again
 * - 拼写有笔误但改对 / 用时明显偏长 → Hard
 * - 又快又对 → Easy
 * - 其余正确 → Good
 */
export function autoRating(opts: {
  correct: boolean
  elapsedMs: number
  nearMiss?: boolean
  mode: ReviewMode
}): Grade {
  const { correct, elapsedMs, nearMiss, mode } = opts
  if (!correct) return Rating.Again
  if (nearMiss) return Rating.Hard
  const fastThreshold = mode === 'spell' || mode === 'listen-spell' ? 9000 : 4500
  if (elapsedMs <= fastThreshold) return Rating.Easy
  return Rating.Good
}

/** 题型难度权重：拼写类算更深的提取练习，复习题量占比 > 50%（§5.1） */
export const MODE_WEIGHT: Record<ReviewMode, number> = {
  'new-card': 0,
  'choice-word': 1,
  'choice-meaning': 1,
  'listen-meaning': 1.2,
  spell: 1.6,
  'listen-spell': 2,
}

export const MODE_LABEL: Record<ReviewMode, string> = {
  'new-card': '新词',
  'choice-word': '看词选义',
  'choice-meaning': '看义选词',
  spell: '拼写',
  'listen-meaning': '听音辨义',
  'listen-spell': '听音拼写',
}
