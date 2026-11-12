import type { FamiliarWords, Profile, ReviewLog } from '../types/model'

export const DEFAULT_DAILY_NEW_TARGET = 10

/** 题型与正确性来自日志；选择题和接受的一处笔误不证明准确产出。 */
export function countProductionCorrect(logs: readonly ReviewLog[]): number {
  return logs.filter((log) => log.correct && !log.nearMiss &&
    (log.mode === 'spell' || log.mode === 'listen-spell')).length
}

export function isFamiliar(profile: Pick<Profile, 'familiarWords'> | null | undefined, wordId: string): boolean {
  return profile?.familiarWords?.[wordId]?.excluded === true
}

/** 按词合并最新设置；同一时刻的恢复优先，不让陈旧备份复活排除标记。 */
export function mergeFamiliarWords(local: FamiliarWords | undefined, incoming: unknown): FamiliarWords {
  const merged = new Map<string, FamiliarWords[string]>()
  for (const source of [local, incoming]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    for (const [wordId, value] of Object.entries(source)) {
      if (!wordId || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const flag = value as Record<string, unknown>
      if (typeof flag.excluded !== 'boolean' || typeof flag.updatedAt !== 'number' ||
        !Number.isFinite(flag.updatedAt) || flag.updatedAt < 0) continue
      const current = merged.get(wordId)
      if (!current || flag.updatedAt > current.updatedAt ||
        (flag.updatedAt === current.updatedAt && !flag.excluded)) {
        merged.set(wordId, { excluded: flag.excluded, updatedAt: flag.updatedAt })
      }
    }
  }
  return Object.fromEntries(merged)
}
