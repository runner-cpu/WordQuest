import { dateKeyOffset } from '../db/database'

/** Today can still be in progress; a missed completed day ends the streak. */
export function effectiveDayStreak(logs: readonly { date: string; effectiveDay: boolean }[], now: number): number {
  const active = new Set(logs.filter(log => log.effectiveDay).map(log => log.date))
  const date = new Date(now)
  const start = active.has(dateKeyOffset(0, date)) ? 0 : 1
  let count = 0
  // The set size bounds work without truncating a long-running learner's history.
  while (count < active.size && active.has(dateKeyOffset(-start - count, date))) count++
  return count
}

/** Prefer downloaded word metadata; migration caches preserve known bands until download. */
export function vocabularyFrequencyBands(
  wordIds: readonly string[],
  words: readonly ({ id: string; difficultyWeight: number } | undefined)[],
  cached: Readonly<Record<string, number>> = {},
) {
  const local = new Map(words.filter(word => word !== undefined).map(word => [word.id, word.difficultyWeight]))
  const bands = { easy: 0, mid: 0, hard: 0, unknown: 0 }
  for (const id of new Set(wordIds)) {
    const weight = local.get(id) ?? cached[id]
    if (weight === 1) bands.easy++
    else if (weight === 1.3) bands.mid++
    else if (weight === 1.6) bands.hard++
    else bands.unknown++
  }
  return bands
}
