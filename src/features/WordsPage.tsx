import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { BOOKS, bookProgress, importBook, importUnit, importedBookCounts, loadBookIndex, wordsForBook } from '../core/wordbook'
import { EmptyState, Mascot, Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { useUi } from '../state/ui'
import { useBattle } from '../state/battle'
import { speak } from '../core/audio'
import { rankFromPower } from '../core/game'
import { allRoots, groupByClass, loadRoots } from '../core/roots'
import { RootQuizPanel } from './RootQuizPanel'
import type { BookId, Word } from '../types/model'

type Tab = 'map' | 'books' | 'roots' | 'search' | 'hard'

/** 进度地图上一个单元的状态 */
interface MapNode {
  unitId: number
  total: number
  learned: number
  /** 是否已下载到本地 */
  imported: boolean
}

export function WordsPage() {
  const pushToast = useUi((s) => s.pushToast)
  const profile = useUi((s) => s.profile)
  const openBattle = useBattle((s) => s.open)
  const [busy, setBusy] = useState<BookId | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [rootQuery, setRootQuery] = useState('')
  const [rootsLoaded, setRootsLoaded] = useState(false)
  const [openRoot, setOpenRoot] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('books')

  /** 地图展示的词书：优先主学词书 */
  const mapBook: BookId = useMemo(() => {
    const study = profile?.studyBook as BookId | undefined
    if (study && BOOKS.some((b) => b.id === study)) return study
    return profile?.examType === 'cet6' ? 'cet6-core' : 'cet4-core'
  }, [profile?.studyBook, profile?.examType])

  const imported = useLiveQuery(importedBookCounts, [])

  const mapNodes = useLiveQuery<MapNode[] | null>(async () => {
    // 不在地图页时不观察 words/stats 表：否则每导入一个单元，其他标签页也在白算
    if (tab !== 'map') return null
    let idx
    try {
      idx = await loadBookIndex(mapBook)
    } catch {
      return null
    }
    const words = await wordsForBook(mapBook)
    const stats = await db.stats.toArray()
    const learnedSet = new Set(stats.filter((s) => s.fsrs.reps > 0).map((s) => s.wordId))
    const byUnit = new Map<number, { total: number; learned: number }>()
    for (const w of words) {
      const cur = byUnit.get(w.unitId) ?? { total: 0, learned: 0 }
      cur.total++
      if (learnedSet.has(w.id)) cur.learned++
      byUnit.set(w.unitId, cur)
    }
    return idx.units.map((u) => ({
      unitId: u.unitId,
      total: u.count,
      learned: byUnit.get(u.unitId)?.learned ?? 0,
      imported: (byUnit.get(u.unitId)?.total ?? 0) >= u.count,
    }))
  }, [mapBook, imported, tab])

  const bookStats = useLiveQuery(async () => {
    const out: Record<string, { learned: number; total: number }> = {}
    for (const b of BOOKS) {
      if (!(imported?.get(b.id) ?? 0)) continue
      out[b.id] = await bookProgress(b.id)
    }
    return out
  }, [imported])

  /** 防抖后的搜索词：id 即单词本身，走主键索引，不再每击键全表扫描 */
  const [searchQ, setSearchQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(query), 150)
    return () => clearTimeout(t)
  }, [query])

  const searchResults = useLiveQuery(async () => {
    const q = searchQ.trim().toLowerCase()
    if (q.length < 1) return []
    return db.words.where('id').startsWithIgnoreCase(q).limit(30).toArray()
  }, [searchQ])

  const hardWords = useLiveQuery(async () => {
    const stats = await db.stats.filter((s) => s.mistakeCount >= 2).toArray()
    stats.sort((a, b) => b.mistakeCount - a.mistakeCount)
    const words = await db.words.bulkGet(stats.map((s) => s.wordId))
    return words
      .map((w, i) => (w ? { word: w, mistakes: stats[i].mistakeCount } : null))
      .filter((x): x is { word: NonNullable<typeof x>['word']; mistakes: number } => Boolean(x))
      .slice(0, 60)
  }, [])

  async function download(bookId: BookId) {
    if (busy) return
    setBusy(bookId)
    setProgress({ done: 0, total: 1 })
    try {
      const n = await importBook(bookId, (done, total) => setProgress({ done, total }))
      pushToast(`已下载 ${n} 个单词，可离线使用`)
    } catch (e) {
      pushToast(`下载失败：${(e as Error).message}`)
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function practiceHard() {
    const stats = await db.stats.filter((s) => s.mistakeCount >= 2).toArray()
    const words = (await db.words.bulkGet(stats.map((s) => s.wordId))).filter(
      (w): w is NonNullable<typeof w> => Boolean(w),
    )
    if (words.length === 0) {
      pushToast('攻坚本还是空的')
      return
    }
    const pool = await db.words.limit(400).toArray()
    const knownIds = new Set(stats.map((x) => x.wordId))
    const knownWords = pool.filter((w) => knownIds.has(w.id))
    openBattle({ reviews: words.slice(0, 30), news: [], pool, knownWords })
  }

  /** 点击地图上的已下载单元 → 直接开打（该单元的到期复习 + 新词） */
  async function startUnit(unitId: number) {
    const words = (await wordsForBook(mapBook)).filter(
      (w) => w.unitId === unitId,
    )
    if (words.length === 0) {
      pushToast('这个单元还没下载')
      return
    }
    const stats = await db.stats.bulkGet(words.map((w) => w.id))
    const now = Date.now()
    const learned = new Set<string>()
    const due: Word[] = []
    words.forEach((w, i) => {
      const s = stats[i]
      if (s && s.fsrs.reps > 0) {
        learned.add(w.id)
        if (s.fsrs.due <= now) due.push(w)
      }
    })
    const news = words.filter((w) => !learned.has(w.id)).slice(0, 12)
    const reviews = due.slice(0, 24)
    if (reviews.length + news.length === 0) {
      pushToast('这一关已经全部学完，去「今日」复习吧')
      return
    }
    const pool = await wordsForBook(mapBook, 600)
    const poolStats = await db.stats.bulkGet(pool.map((w) => w.id))
    const knownWords = pool.filter((_, i) => (poolStats[i]?.fsrs.reps ?? 0) > 0)
    openBattle({ reviews, news, pool, knownWords })
  }

  function bookCard(b: (typeof BOOKS)[number]) {
    const count = imported?.get(b.id) ?? 0
    const isImported = count > 0
    const st = bookStats?.[b.id]
    return (
      <Panel key={b.id}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-px12 text-bright">{b.name}</div>
            <div className="text-px12 text-dim">{b.desc}</div>
            {isImported && st && (
              <div className="mt-2">
                <div className="mb-1 flex items-baseline gap-2 text-px12 text-dim tnum">
                  <span>
                    已学 {st.learned} / {st.total}
                  </span>
                  <span className="text-gold">{Math.round((st.learned / Math.max(1, st.total)) * 100)}%</span>
                </div>
                <PixelBar value={st.learned} max={st.total} label={`${b.name}进度`} />
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            {busy === b.id ? (
              <>
                <div className="text-px12 text-gold tnum">
                  {progress?.done ?? 0}/{progress?.total ?? 0}
                </div>
                <PixelBar
                  value={progress?.done ?? 0}
                  max={Math.max(1, progress?.total ?? 1)}
                  className="mt-1 !h-1.5 w-16"
                  label={`${b.name} 下载进度`}
                />
              </>
            ) : (
              <PixelButton
                size="sm"
                variant={isImported ? 'ghost' : 'primary'}
                onClick={() => void download(b.id)}
              >
                {isImported ? '重新下载' : '下载'}
              </PixelButton>
            )}
          </div>
        </div>
        {isImported && (
          <div className="mt-2 text-px12 text-dim tnum">
            已缓存 {count} 词 · 可离线学习
          </div>
        )}
      </Panel>
    )
  }

  useEffect(() => {
    void loadRoots().then(() => setRootsLoaded(true))
  }, [])

  /** 词根列表：支持按形式或释义过滤 */
  const rootGroups = useMemo(() => {
    if (!rootsLoaded) return []
    const q = rootQuery.trim().toLowerCase()
    const list = allRoots().filter(
      (r) => !q || r.form.toLowerCase().includes(q) || r.meaning.toLowerCase().includes(q),
    )
    return groupByClass(list)
  }, [rootsLoaded, rootQuery])

  return (
    <div className="space-y-3 p-3 pb-24 md:p-5 md:pb-8">
      <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="单词页视图">
        {(
          [
            ['map', '地图'],
            ['books', '词书'],
            ['roots', '词根'],
            ['search', '查词'],
            ['hard', '攻坚本'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`pixel-btn pixel-btn-sm ${tab === k ? 'pixel-btn-primary' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <Panel>
          <SectionHead right={BOOKS.find((b) => b.id === mapBook)?.name}>进度地图</SectionHead>
          {!mapNodes && <p className="text-center text-px12 text-dim">地图加载失败，请先在「词书」页下载</p>}
          {mapNodes && mapNodes.length === 0 && (
            <p className="text-center text-px12 text-dim">这本词书还没有单元数据</p>
          )}
          {mapNodes && mapNodes.length > 0 && (
            <>
              {(() => {
                const firstUndone = mapNodes.find((n) => n.learned < n.total)?.unitId ?? -1
                const mascotStage = rankFromPower(profile?.powerPeak ?? 0).rank.mascotStage
                return (
                  <>
                    <div className="relative mx-auto w-full max-w-sm py-3">
                      {/* 中央虚线小径：关卡左右交错，像一条登山路线 */}
                      <div
                        className="pointer-events-none absolute inset-y-6 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-edge/60"
                        aria-hidden
                      />
                      <ul className="relative space-y-3">
                        {mapNodes.map((n, i) => {
                          const done = n.learned >= n.total && n.total > 0
                          const current = n.unitId === firstUndone && !done
                          const boss = n.unitId % 5 === 0
                          const left = i % 2 === 0
                          const size = boss ? 'h-14 w-14' : 'h-12 w-12'
                          return (
                            <li
                              key={n.unitId}
                              className={`flex ${left ? 'justify-start pr-[56%]' : 'justify-end pl-[56%]'}`}
                            >
                              <button
                                onClick={() => {
                                  if (!n.imported) {
                                    void (async () => {
                                      try {
                                        await importUnit(mapBook, n.unitId)
                                        pushToast(`已下载第 ${n.unitId} 关`)
                                      } catch {
                                        pushToast('下载失败，请检查网络')
                                      }
                                    })()
                                  } else {
                                    void startUnit(n.unitId)
                                  }
                                }}
                                aria-label={`第 ${n.unitId} 关：已学 ${n.learned}/${n.total}，${
                                  n.imported ? '点击开始挑战' : '未下载，点击下载'
                                }`}
                                className="group relative flex w-16 flex-col items-center gap-1"
                              >
                                {current && (
                                  <span className="anim-bob absolute -top-7 left-1/2 -translate-x-1/2 text-gold">
                                    <Mascot stage={mascotStage} size={26} mood="happy" skin={profile?.mascot.skin} />
                                  </span>
                                )}
                                <span
                                  className={`${size} flex items-center justify-center border-2 text-px12 tnum ${
                                    done
                                      ? 'border-pass bg-[color-mix(in_srgb,var(--wq-pass)_18%,transparent)] text-pass'
                                      : current
                                        ? 'anim-ring border-gold bg-gold text-black'
                                        : n.imported
                                          ? 'border-edge bg-panel-2 text-bright group-hover:border-gold'
                                          : 'border-edge bg-panel-2 text-dim'
                                  }`}
                                >
                                  {!n.imported ? (
                                    <Icon name="lock" size={16} />
                                  ) : done ? (
                                    <Icon name="check" size={18} />
                                  ) : boss ? (
                                    <Icon name="trophy" size={18} />
                                  ) : (
                                    n.unitId
                                  )}
                                </span>
                                <span className={`text-px12 tnum ${current ? 'text-gold' : 'text-dim'}`}>
                                  {boss ? `BOSS ${n.unitId}` : `第 ${n.unitId} 关`}
                                </span>
                                <span className="text-px12 text-dim tnum">
                                  {n.learned}/{n.total}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                    <p className="readable mt-3 text-px12 text-dim">
                      点亮的关卡可以点进去开打（到期复习 + 本单元新词）。金色呼吸的
                      {mapNodes.find((n) => n.unitId === firstUndone)?.imported ? '是你现在的位置' : '是本单元下一个待下载关卡'}
                      ，每 5 关是一个 BOSS 关。
                    </p>
                  </>
                )
              })()}
            </>
          )}
        </Panel>
      )}

      {tab === 'books' && (
        <div className="space-y-3">
          {(() => {
            const studyBook: BookId = (profile?.studyBook as BookId) ?? (profile?.examType === 'cet6' ? 'cet6-core' : 'cet4-core')
            const groups: { title: string; ids: BookId[] }[] = [
              { title: '当前主学', ids: [studyBook] },
              {
                title: '已下载',
                ids: BOOKS.filter((b) => b.id !== studyBook && (imported?.get(b.id) ?? 0) > 0).map((b) => b.id),
              },
              {
                title: '可扩展',
                ids: BOOKS.filter((b) => b.id !== studyBook && (imported?.get(b.id) ?? 0) === 0).map((b) => b.id),
              },
            ]
            return groups
              .filter((g) => g.ids.length > 0)
              .map((g) => (
                <div key={g.title}>
                  <div className="mb-1 text-px12 text-dim">{g.title}</div>
                  <div className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
                    {g.ids.map((id) => {
                      const b = BOOKS.find((x) => x.id === id)
                      if (!b) return null
                      return bookCard(b)
                    })}
                  </div>
                </div>
              ))
          })()}
        </div>
      )}
      {tab === 'roots' && (
        <div className="space-y-3">
          <Panel>
            <SectionHead right="认一次管一片">词根练习</SectionHead>
            <RootQuizPanel />
          </Panel>

          <div>
            <div className="mb-1 text-px12 text-dim">词根表浏览</div>
          </div>

          <div>
            <label htmlFor="root-search" className="mb-1 block text-px12 text-dim">
              按词根或释义搜索
            </label>
            <input
              id="root-search"
              value={rootQuery}
              onChange={(e) => setRootQuery(e.target.value)}
              placeholder="例如 spect、看、-less"
              className="pixel-input readable w-full px-3 py-2 !text-[16px]"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {!rootsLoaded && <p className="text-center text-px12 text-dim">正在载入词根表</p>}
          {rootsLoaded && rootGroups.length === 0 && (
            <EmptyState icon="book" title="没有匹配的词根" hint="试试更短的关键词，或只输入一个字母。" />
          )}
          {rootGroups.map((group) => (
            <Panel key={group.cls}>
              <SectionHead right={`${group.items.length} 条`}>{group.cls}</SectionHead>
              <ul className="space-y-1">
                {group.items.map((r) => {
                  const open = openRoot === r.id
                  return (
                    <li key={r.id} className="border-b border-edge/50 last:border-0">
                      <button
                        className="flex w-full items-baseline gap-2 py-2 text-left text-px12"
                        onClick={() => setOpenRoot(open ? null : r.id)}
                        aria-expanded={open}
                      >
                        <span className="min-w-0 max-w-[55%] break-words text-gold">{r.form}</span>
                        <span
                          className={`min-w-0 flex-1 truncate ${r.meaningZh ? 'text-bright' : 'text-dim'}`}
                          title={r.meaningZh ? undefined : '原表为英文释义'}
                        >
                          {r.meaning}
                        </span>
                        <span className="shrink-0 text-dim tnum">{r.examples.length}</span>
                      </button>
                      {open && (
                        <div className="pb-2">
                          <p className="readable mb-2 break-words text-[16px] leading-relaxed text-bright">{r.meaning}</p>
                          {r.origin && <div className="mb-1 text-px12 text-dim">语源：{r.origin}</div>}
                          {r.examples.length > 0 ? (
                            <>
                              <div className="mb-1 text-px12 text-dim">词书中包含该词根的单词</div>
                              <div className="flex flex-wrap gap-1">
                                {r.examples.map((ex) => (
                                  <span
                                    key={ex}
                                    className="max-w-full break-words border-2 border-edge px-2 py-1 text-px12 text-bright"
                                  >
                                    {ex}
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-px12 text-dim">本地词书里没有包含该词根的单词</div>
                          )}
                          {(r.synonyms || r.antonyms) && (
                            <div className="mt-1 text-px12 text-dim">
                              {r.synonyms && <div>同义：{r.synonyms}</div>}
                              {r.antonyms && <div>反义：{r.antonyms}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-2">
          <div>
            <label htmlFor="word-search" className="mb-1 block text-px12 text-dim">
              输入单词前缀
            </label>
            <input
              id="word-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如 aban"
              className="pixel-input readable w-full px-3 py-2 !text-[16px]"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {searchResults?.length === 0 && query.trim() && (
            <EmptyState icon="book" title="没有匹配的单词" hint="试试更短的前缀，或先在「词书」下载更多词库。" />
          )}
          {!query.trim() && (
            <EmptyState icon="book" title="在已下载的词书里查词" hint="查词只覆盖本地已缓存的词条，离线也能用。" />
          )}
          <div className="space-y-2">
            {searchResults?.map((w) => (
              <Panel key={w.id} className="!p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-px12 text-bright">
                      {w.word}
                      {w.phonetic && <span className="ml-2 text-dim">/{w.phonetic}/</span>}
                    </div>
                    <div className="readable mt-1 line-clamp-2 whitespace-pre-line text-px12 text-dim">
                      {w.definition}
                    </div>
                  </div>
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    ariaLabel={`朗读 ${w.word}`}
                    onClick={() => void speak(w.word)}
                    className="shrink-0"
                  >
                    <Icon name="speaker" size={16} />
                  </PixelButton>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}

      {tab === 'hard' && (
        <div className="space-y-2">
          <Panel>
            <SectionHead right={`${hardWords?.length ?? 0} 词`}>错词攻坚本</SectionHead>
            <p className="readable mb-2 text-px12 text-dim">
              同一个词错 2 次自动进入这里，独立队列，可专项突击。
            </p>
            <PixelButton
              className="w-full"
              variant="primary"
              onClick={() => void practiceHard()}
              disabled={(hardWords?.length ?? 0) === 0}
            >
              开始攻坚（{Math.min(30, hardWords?.length ?? 0)} 词）
            </PixelButton>
          </Panel>
          {hardWords?.length === 0 && (
            <EmptyState icon="medal" title="还没有错词" hint="保持下去。错 2 次的词会自动出现在这里。" />
          )}
          {hardWords?.map(({ word, mistakes }) => (
            <Panel key={word.id} className="!p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-px12 text-bright">{word.word}</div>
                  <div className="readable line-clamp-1 text-px12 text-dim">{word.definition.split('\n')[0]}</div>
                </div>
                <span className="shrink-0 text-px12 text-fail tnum">错 {mistakes} 次</span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
