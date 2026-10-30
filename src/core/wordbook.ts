import { db } from '../db/database'
import type { BookId, Word } from '../types/model'
import { TASTER_BOOK_ID, TASTER_WORDS } from '../data/taster'
import { completeBookUnits, mergeWordMembership, removeWordBook, wordBookUnits, wordForBook, wordInBooks, wordUnit } from './wordMembership'

export { wordInBooks } from './wordMembership'

export interface BookIndex {
  bookId: BookId
  total: number
  unitSize: number
  units: { unitId: number; file: string; count: number }[]
}

export interface BookMeta {
  id: BookId
  name: string
  desc: string
  total: number
  /** 分组，用于词书页分段展示 */
  group: string
}

export const BOOKS: BookMeta[] = [
  { id: 'cet4-core', name: '四级核心词', desc: 'ECDICT 四级标签 · 高频选编 1200 词', total: 1200, group: '四六级' },
  { id: 'cet4-full', name: '四级全本', desc: 'ECDICT 四级标签词表 · 3837 词', total: 3837, group: '四六级' },
  { id: 'cet6-core', name: '六级核心词', desc: 'ECDICT 六级标签 · 增补高频选编 1500 词', total: 1500, group: '四六级' },
  { id: 'cet6-full', name: '六级全本', desc: 'ECDICT 六级标签词表 · 5396 词', total: 5396, group: '四六级' },
  { id: 'ky-core', name: '考研核心词', desc: 'ECDICT 考研标签 · 高频选编 1500 词', total: 1500, group: '进阶' },
  { id: 'ielts-core', name: '雅思核心词', desc: 'ECDICT 雅思标签 · 高频选编 1500 词', total: 1500, group: '进阶' },
]

export function bookName(id: BookId): string {
  return BOOKS.find((b) => b.id === id)?.name ?? id
}

const bookCache = new Map<BookId, BookIndex>()
const unitCache = new Map<string, Word[]>()

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './'
  // 带修订号：词表数据更新后绕过 Service Worker 的 CacheFirst 旧缓存
  return `${base.replace(/\/$/, '')}/data/${path}?rev=${BOOKS_REV}`
}

export async function loadBookIndex(bookId: BookId): Promise<BookIndex> {
  const cached = bookCache.get(bookId)
  if (cached) return cached
  const res = await fetch(dataUrl(`books/${bookId}/index.json`))
  if (!res.ok) throw new Error(`词书索引加载失败：${bookId}`)
  const idx = (await res.json()) as BookIndex
  bookCache.set(bookId, idx)
  return idx
}

export async function loadUnit(bookId: BookId, unitId: number): Promise<Word[]> {
  const key = `${bookId}:${unitId}`
  const cached = unitCache.get(key)
  if (cached) return cached
  const idx = await loadBookIndex(bookId)
  const unit = idx.units.find((u) => u.unitId === unitId)
  if (!unit) return []
  const res = await fetch(dataUrl(`books/${bookId}/${unit.file}`))
  if (!res.ok) throw new Error(`单元加载失败：${bookId}#${unitId}`)
  const payload = (await res.json()) as { unitId: number; words: Word[] }
  if (!Array.isArray(payload.words) || payload.words.length !== unit.count) {
    throw new Error(`单元数据不完整：${bookId}#${unitId}，请重新下载`)
  }
  unitCache.set(key, payload.words)
  return payload.words
}

/** 已导入本地的单元集合（存 profile 太碎，单独用 localStorage 记轻量索引） */
const IMPORTED_KEY = 'wq:imported-units'

export function importedUnits(): Record<string, number[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(IMPORTED_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, number[]> = {}
    for (const book of BOOKS) {
      const list = (parsed as Record<string, unknown>)[book.id]
      if (!Array.isArray(list)) continue
      map[book.id] = [...new Set(list.filter((id): id is number => Number.isInteger(id) && id > 0))]
        .sort((a, b) => a - b)
    }
    return map
  } catch {
    return {}
  }
}

export function isUnitImported(bookId: BookId, unitId: number): boolean {
  return (importedUnits()[bookId] ?? []).includes(unitId)
}

function markUnitImported(bookId: BookId, unitId: number) {
  const map = importedUnits()
  const list = new Set(map[bookId] ?? [])
  list.add(unitId)
  map[bookId] = [...list].sort((a, b) => a - b)
  localStorage.setItem(IMPORTED_KEY, JSON.stringify(map))
}

function markCompleteUnits(bookId: BookId, unitIds: number[]) {
  const map = importedUnits()
  map[bookId] = [...unitIds].sort((a, b) => a - b)
  localStorage.setItem(IMPORTED_KEY, JSON.stringify(map))
}

/** 备份不会依赖另一台设备的 localStorage；从词条补回已下载书/单元清单。 */
async function downloadedUnitMap(): Promise<Record<string, number[]>> {
  const map = importedUnits()
  for (const word of await db.words.toArray()) {
    for (const [bookId, unitId] of Object.entries(wordBookUnits(word))) {
      if (!BOOKS.some((book) => book.id === bookId) || unitId === undefined) continue
      const list = map[bookId] ?? (map[bookId] = [])
      if (!list.includes(unitId)) list.push(unitId)
    }
  }
  return map
}

/** 词条与学习记录仍共用全局 id，词书归属由 bookUnits 单独表达。 */
async function putBookWords(words: readonly Word[]): Promise<void> {
  const existing = await db.words.bulkGet(words.map((word) => word.id))
  await db.words.bulkPut(words.map((word, i) => mergeWordMembership(existing[i], word)))
}

/** 按词书取词，并投影为该书的单元编号。兼容未迁移的旧词条。 */
export async function wordsForBook(bookId: BookId, limit?: number): Promise<Word[]> {
  let query = db.words.filter((word) => wordInBooks(word, [bookId]))
  if (limit !== undefined) query = query.limit(Math.max(0, limit))
  return (await query.toArray()).map((word) => wordForBook(word, bookId))
}

/** 一次读取统计全部词书，重叠词可以同时计入各自词书。 */
export async function importedBookCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>(BOOKS.map((book) => [book.id, 0]))
  for (const word of await db.words.toArray()) {
    for (const bookId of Object.keys(wordBookUnits(word))) {
      if (counts.has(bookId)) counts.set(bookId, (counts.get(bookId) ?? 0) + 1)
    }
  }
  return counts
}

/** 导入一个单元到 IndexedDB（离线可用） */
export async function importUnit(bookId: BookId, unitId: number): Promise<number> {
  const words = await loadUnit(bookId, unitId)
  if (words.length === 0) return 0
  await db.transaction('rw', db.words, () => putBookWords(words))
  markUnitImported(bookId, unitId)
  return words.length
}

/** 导入整本词书，onProgress 用于下载管理器进度条（§8.2） */
export async function importBook(
  bookId: BookId,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const idx = await loadBookIndex(bookId)
  let imported = 0
  for (let i = 0; i < idx.units.length; i++) {
    imported += await importUnit(bookId, idx.units[i].unitId)
    onProgress?.(i + 1, idx.units.length)
  }
  return imported
}

/** 只准备内置尝鲜包；不发起请求，冷启动离线也可马上学习。 */
export async function ensureLocalSeedBook(bookId: BookId = 'cet4-core'): Promise<void> {
  if (bookId !== TASTER_BOOK_ID) return
  const seedWords = TASTER_WORDS as Word[]
  await db.transaction('rw', db.words, async () => {
    const existing = await db.words.bulkGet(seedWords.map((word) => word.id))
    const missing = seedWords.filter((word, i) => !existing[i] || wordUnit(existing[i], bookId) !== word.unitId)
    if (missing.length > 0) await putBookWords(missing)
  })
  for (const unitId of new Set(TASTER_WORDS.map((word) => word.unitId))) markUnitImported(bookId, unitId)
}

/**
 * 确保目标词书已导入。
 *
 * 注意不能只看「库里有没有词」：用户先被默认导入四级，之后在引导里
 * 选了六级，若只判断总数就会跳过，导致六级用户拿到四级词书。
 */
export async function ensureSeedBook(
  bookId: BookId = 'cet4-core',
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  await ensureLocalSeedBook(bookId)

  // 只判断「有没有词」不够：下载中途关页面会留下半本词书，
  // 之后每次启动都跳过，词库永久缺一块。按单元完整性判断。
  const idx = await loadBookIndex(bookId)
  const completeUnits = completeBookUnits(await wordsForBook(bookId), bookId, idx.units)
  markCompleteUnits(bookId, completeUnits)
  const imported = new Set(completeUnits)
  const missing = idx.units.filter((u) => !imported.has(u.unitId))
  if (missing.length === 0) return

  for (let i = 0; i < missing.length; i++) {
    await importUnit(bookId, missing[i].unitId)
    onProgress?.(i + 1, missing.length)
  }
}

/**
 * 词书内容修订号。
 *
 * 词表数据被修正过（v2：cet6-core 曾把 300 个四级高频词排在书首，导致
 * 「六级核心全是简单词」）后递增，启动时自动替换本机旧分片。
 * v3：分片请求带修订号，绕开 Service Worker 的 CacheFirst 旧缓存。
 * v4：按所有已下载分片重建多词书归属，修复全本覆盖核心词书的问题。
 */
const BOOKS_REV_KEY = 'wq:books-rev'
const BOOKS_REV = '4'

/**
 * 已下载词书随数据修订自动刷新。
 *
 * 新版分片取齐后，在事务内替换该书归属。单词与学习历史仍保留，
 * 离线或下载失败时不改已有数据。
 */
export async function syncBookRevision(): Promise<BookId[]> {
  if (localStorage.getItem(BOOKS_REV_KEY) === BOOKS_REV) return []
  const map = await downloadedUnitMap()
  const downloaded = (Object.entries(map) as [BookId, number[]][]).filter(
    ([, unitIds]) => unitIds && unitIds.length > 0,
  )
  const refreshed: BookId[] = []
  for (const [bookId, unitIds] of downloaded) {
    try {
      const batches: Word[][] = []
      for (const unitId of unitIds) batches.push(await loadUnit(bookId, unitId))
      await db.transaction('rw', db.words, async () => {
        const oldWords = await db.words.filter((word) => wordInBooks(word, [bookId])).toArray()
        await db.words.bulkPut(oldWords.map((word) => removeWordBook(word, bookId)))
        for (const words of batches) await putBookWords(words)
      })
      refreshed.push(bookId)
    } catch {
      // 离线或分片下载失败：保留旧数据，下次启动再试
      continue
    }
  }
  // 全部书都刷新成功（或本来就没下载任何词书）才记修订号，否则下次重试
  if (refreshed.length === downloaded.length) localStorage.setItem(BOOKS_REV_KEY, BOOKS_REV)
  return refreshed
}

/**
 * 修复所有「下载了一半」的词书。
 *
 * 用户可能在下载途中关掉页面，留下的半本词书会让后续学习一直缺词。
 * 这里按 index 里的单元清单逐个核对，缺哪个补哪个。
 */
export async function repairIncompleteBooks(
  onProgress?: (bookId: BookId, done: number, total: number) => void,
): Promise<BookId[]> {
  const map = await downloadedUnitMap()
  const repaired: BookId[] = []
  for (const [bookId, unitIds] of Object.entries(map) as [BookId, number[]][]) {
    if (!unitIds || unitIds.length === 0) continue
    let idx: BookIndex
    try {
      idx = await loadBookIndex(bookId)
    } catch {
      continue
    }
    const completeUnits = completeBookUnits(await wordsForBook(bookId), bookId, idx.units)
    markCompleteUnits(bookId, completeUnits)
    const have = new Set(completeUnits)
    const missing = idx.units.filter((u) => !have.has(u.unitId))
    if (missing.length === 0) continue
    // 补齐缺失单元
    let done = 0
    for (const unit of missing) {
      await importUnit(bookId, unit.unitId)
      done++
      onProgress?.(bookId, done, missing.length)
    }
    repaired.push(bookId)
  }
  return repaired
}

/**
 * 词书进度 —— 纯读，可安全用于 useLiveQuery。
 * 总量取自已缓存的 index 或静态元数据，避免在渲染期发网络请求。
 */
export async function bookProgress(bookId: BookId): Promise<{ learned: number; total: number }> {
  const total = bookCache.get(bookId)?.total ?? BOOKS.find((b) => b.id === bookId)?.total ?? 0
  const words = await wordsForBook(bookId)
  const ids = new Set(words.map((w) => w.id))
  const stats = await db.stats.toArray()
  const learned = stats.filter((s) => ids.has(s.wordId) && s.fsrs.reps > 0).length
  return { learned, total }
}
