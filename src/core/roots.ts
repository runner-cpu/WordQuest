/** 词根词缀表（§5.1）—— 数据由 scripts/ingest-roots.mjs 生成 */

export interface RootEntry {
  id: string
  /** 展示形式，如 "-less" / "pre-" / "spect" */
  form: string
  meaning: string
  /** meaning 是否为中文（否则是英文原文） */
  meaningZh: boolean
  cls: string
  origin: string
  /** 本地词书里实际存在的例词 */
  examples: string[]
  synonyms: string
  antonyms: string
}

interface RootsPayload {
  total: number
  roots: RootEntry[]
  /** 单词 → 词根 id 列表 */
  index: Record<string, string[]>
}

let cache: RootsPayload | null = null
let loading: Promise<RootsPayload | null> | null = null

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './'
  return `${base.replace(/\/$/, '')}/data/${path}`
}

export async function loadRoots(): Promise<RootsPayload | null> {
  if (cache) return cache
  if (loading) return loading
  loading = (async () => {
    try {
      const res = await fetch(dataUrl('roots.json'))
      if (!res.ok) return null
      cache = (await res.json()) as RootsPayload
      return cache
    } catch {
      // 词根表是辅助内容，加载失败不应影响背单词主流程
      return null
    }
  })()
  return loading
}

/** 查一个单词能被哪些词根拆解（同步，需先 loadRoots） */
export function rootsForWord(wordId: string): RootEntry[] {
  if (!cache) return []
  const ids = cache.index[wordId.toLowerCase()]
  if (!ids || ids.length === 0) return []
  const byId = new Map(cache.roots.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((r): r is RootEntry => Boolean(r))
}

export function allRoots(): RootEntry[] {
  return cache?.roots ?? []
}

/** 按类别分组，用于词根表的分段展示 */
export function groupByClass(roots: RootEntry[]): { cls: string; items: RootEntry[] }[] {
  const order = ['词根', '前缀', '名词后缀', '形容词后缀', '动词后缀', '副词后缀', '形/名后缀']
  const map = new Map<string, RootEntry[]>()
  for (const r of roots) {
    const list = map.get(r.cls) ?? []
    list.push(r)
    map.set(r.cls, list)
  }
  return [...map.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([cls, items]) => ({ cls, items }))
}
