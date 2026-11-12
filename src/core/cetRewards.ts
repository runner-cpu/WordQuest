import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import type { CetRewardKind, CetRewardProgress, CetRewardQuestionProgress } from '../types/model'

export const CET_REWARD_VALUES = {
  firstCorrect: { xp: 2, coins: 1 },
  correction: { xp: 3, coins: 1 },
  evidence: { xp: 1, coins: 1 },
} as const

export interface CetRewardAmount { count: number; xp: number; coins: number }
export interface CetPaperRewards {
  firstCorrect: CetRewardAmount
  correction: CetRewardAmount
  evidence: CetRewardAmount
  xp: number
  coins: number
}

export const CET_REWARD_KINDS: readonly CetRewardKind[] = ['firstCorrect', 'correction', 'evidence']
export function cetRewardQuestionKey(sourceId: string, paperRevision: string, number: number): string {
  return `${sourceId}:${paperRevision}:${number}`
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const state = (value: unknown) => value === 'correct' || value === 'wrong'

/** 备份保留合法旧版本凭据；实际领奖另行校验当前内置版本及答案键。 */
export function isCetRewardProgress(value: unknown): value is CetRewardProgress {
  return record(value) && Object.entries(value).every(([key, item]) => {
    if (!record(item) || typeof item.sourceId !== 'string' || !CET_PAPER_SOURCES.some(source => source.id === item.sourceId) ||
      typeof item.paperRevision !== 'string' || !/^[a-f0-9]{16}$/.test(item.paperRevision) ||
      !Number.isInteger(item.number) || Number(item.number) < 1 || Number(item.number) > 55 ||
      key !== cetRewardQuestionKey(item.sourceId, item.paperRevision, Number(item.number)) ||
      !state(item.first) || !state(item.last) || !timestamp(item.firstSubmittedAt) || !timestamp(item.lastSubmittedAt) ||
      item.firstSubmittedAt > item.lastSubmittedAt || !record(item.paid)) return false
    return Object.entries(item.paid).every(([kind, at]) => CET_REWARD_KINDS.includes(kind as CetRewardKind) && timestamp(at))
  })
}

function mergeQuestion(local: CetRewardQuestionProgress, incoming: CetRewardQuestionProgress): CetRewardQuestionProgress {
  const first = incoming.firstSubmittedAt < local.firstSubmittedAt ||
    (incoming.firstSubmittedAt === local.firstSubmittedAt && incoming.first === 'wrong') ? incoming : local
  const last = incoming.lastSubmittedAt > local.lastSubmittedAt ||
    (incoming.lastSubmittedAt === local.lastSubmittedAt && incoming.last === 'wrong') ? incoming : local
  const paid: CetRewardQuestionProgress['paid'] = {}
  for (const kind of CET_REWARD_KINDS) {
    const values = [local.paid[kind], incoming.paid[kind]].filter((at): at is number => at !== undefined)
    if (values.length) {
      const actual = values.filter(at => at > 0)
      paid[kind] = actual.length ? Math.min(...actual) : 0
    }
  }
  return { ...first, last: last.last, lastSubmittedAt: last.lastSubmittedAt, paid }
}

/** 首次状态取最早，最新状态取最近，奖励 kind 取并集；设置恢复不能清空凭据。 */
export function mergeCetRewardProgress(local?: CetRewardProgress, incoming?: CetRewardProgress): CetRewardProgress {
  if ((local !== undefined && !isCetRewardProgress(local)) || (incoming !== undefined && !isCetRewardProgress(incoming))) {
    throw new Error('真题奖励记录无效')
  }
  const merged: CetRewardProgress = structuredClone(local ?? {})
  for (const [key, item] of Object.entries(incoming ?? {})) merged[key] = merged[key] ? mergeQuestion(merged[key], item) : structuredClone(item)
  return merged
}

export function emptyCetPaperRewards(): CetPaperRewards {
  return { firstCorrect: { count: 0, xp: 0, coins: 0 }, correction: { count: 0, xp: 0, coins: 0 }, evidence: { count: 0, xp: 0, coins: 0 }, xp: 0, coins: 0 }
}

export function addCetPaperReward(rewards: CetPaperRewards, kind: CetRewardKind): void {
  const value = CET_REWARD_VALUES[kind]
  rewards[kind].count++
  rewards[kind].xp += value.xp
  rewards[kind].coins += value.coins
  rewards.xp += value.xp
  rewards.coins += value.coins
}
