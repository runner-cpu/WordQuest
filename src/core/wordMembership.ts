import type { BookId, Word } from '../types/model'

/** 老词条仍按 bookId/unitId 读取；显式空表表示已从词书中移除。 */
export function wordBookUnits(word: Word): Partial<Record<BookId, number>> {
  return word.bookUnits ?? { [word.bookId]: word.unitId }
}

export function wordUnit(word: Word, bookId: string): number | undefined {
  return wordBookUnits(word)[bookId as BookId]
}

export function wordInBooks(word: Word, bookIds: readonly string[]): boolean {
  return bookIds.some((bookId) => wordUnit(word, bookId) !== undefined)
}

/** 在一本书中展示/练习时，使用该书自己的单元编号。id 始终保持全局唯一。 */
export function wordForBook(word: Word, bookId: BookId): Word {
  return { ...word, bookId, unitId: wordUnit(word, bookId) ?? word.unitId }
}

/** 下载重叠词只合并归属，不另建学习卡片。 */
export function mergeWordMembership(existing: Word | undefined, incoming: Word): Word {
  return {
    ...existing,
    ...incoming,
    bookId: existing?.bookId ?? incoming.bookId,
    unitId: existing?.unitId ?? incoming.unitId,
    bookUnits: {
      ...(existing ? wordBookUnits(existing) : {}),
      ...wordBookUnits(incoming),
    },
  }
}

/** 修订词表时保留词条本身，让旧复习日志、攻坚本仍能找到对应单词。 */
export function removeWordBook(word: Word, bookId: BookId): Word {
  const bookUnits = { ...wordBookUnits(word) }
  delete bookUnits[bookId]
  return { ...word, bookUnits }
}

/** 完整性由实际词条判断，备份恢复后无需依赖设备自己的下载标记。 */
export function completeBookUnits(
  words: readonly Word[],
  bookId: BookId,
  units: readonly { unitId: number; count: number }[],
): number[] {
  const counts = new Map<number, number>()
  for (const word of words) {
    const unitId = wordUnit(word, bookId)
    if (unitId !== undefined) counts.set(unitId, (counts.get(unitId) ?? 0) + 1)
  }
  return units.filter((unit) => (counts.get(unit.unitId) ?? 0) >= unit.count).map((unit) => unit.unitId)
}
