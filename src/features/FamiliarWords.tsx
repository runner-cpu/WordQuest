import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { wordsForBook, bookName } from '../core/wordbook'
import { setFamiliarWord } from '../core/profile'
import { isFamiliar } from '../core/vocabProgress'
import { useUi } from '../state/ui'
import { EmptyState, Panel, PixelButton, SectionHead } from '../ui/Pixel'
import type { BookId } from '../types/model'

/** A reversible self-check, separate from reviewed or mastered vocabulary. */
export function FamiliarWords({ bookId, onClose }: { bookId: BookId; onClose: () => void }) {
  const profile = useUi((state) => state.profile)
  const setProfile = useUi((state) => state.setProfile)
  const [query, setQuery] = useState('')
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [limit, setLimit] = useState(24)
  const [saving, setSaving] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const saveLock = useRef(false)
  const view = useRef<HTMLDivElement>(null)
  const words = useLiveQuery(() => wordsForBook(bookId), [bookId])
  const marked = useMemo(() => words?.filter((word) => isFamiliar(profile ?? undefined, word.id)).length ?? 0, [words, profile])
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (words ?? []).filter((word) => (!onlyMarked || isFamiliar(profile ?? undefined, word.id)) && (!term || word.word.toLowerCase().includes(term) || word.definition.includes(term)))
  }, [words, query, onlyMarked, profile])
  useEffect(() => { view.current?.scrollIntoView({ block: 'start' }); view.current?.focus({ preventScroll: true }) }, [])

  async function mark(wordId: string, word: string, excluded: boolean) {
    if (saveLock.current) return
    saveLock.current = true
    setSaving(wordId); setFeedback(null)
    try {
      setProfile(await setFamiliarWord(wordId, excluded))
      setFeedback({ text: excluded ? `${word} 已标为熟词，暂停新学和复习。` : `${word} 已恢复练习，原有记录已保留。`, error: false })
    } catch {
      setFeedback({ text: '熟词标记未能保存，请检查本机存储后重试。', error: true })
    } finally { saveLock.current = false; setSaving(null) }
  }

  return <div ref={view} tabIndex={-1}><Panel className="!border-gold">
    <SectionHead right={`${marked} 词已暂停`}>熟词快速标记</SectionHead>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-px12 text-bright">{bookName(bookId)}</p>
      <PixelButton size="sm" onClick={onClose}>收起熟词标记</PixelButton>
    </div>
    <p className="readable mb-3 text-[16px] leading-relaxed text-dim">先看英文，自行回想词义，需要时展开释义核对。标为熟词后会暂停该词的新学和复习，已有记录保留，随时可以恢复。熟词自查不计为掌握，不代表能力认证。</p>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="熟词筛选">
      <PixelButton size="sm" aria-pressed={!onlyMarked} variant={!onlyMarked ? 'primary' : 'default'} onClick={() => { setOnlyMarked(false); setLimit(24) }}>全部词条</PixelButton>
      <PixelButton size="sm" aria-pressed={onlyMarked} variant={onlyMarked ? 'primary' : 'default'} onClick={() => { setOnlyMarked(true); setLimit(24) }}>已标熟词</PixelButton>
    </div>
    <label className="mb-1 block text-px12 text-dim" htmlFor="familiar-search">熟词检索</label>
    <input id="familiar-search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24) }} className="pixel-input readable mb-3 min-h-11 w-full px-3 py-2 !text-[16px]" placeholder="输入英文或中文释义" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
    {feedback && <p className={`readable mb-3 text-[16px] leading-relaxed ${feedback.error ? 'text-fail' : 'text-pass'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    {words === undefined ? <p className="readable text-dim" role="status">正在读取本机词书…</p> : visible.length === 0 ? <EmptyState icon="book" title={onlyMarked ? '没有已标记的熟词' : '没有匹配词条'} hint="只显示本机已下载的词条，可更换筛选或检索词。" /> : <>
      <ul className="divide-y-2 divide-edge">{visible.slice(0, limit).map((word) => {
        const excluded = isFamiliar(profile ?? undefined, word.id)
        return <li key={word.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="readable min-w-0 break-words text-[18px] text-bright">{word.word}</span>
            <PixelButton size="sm" disabled={saving !== null} aria-busy={saving === word.id} aria-label={`${excluded ? '恢复练习' : '标为熟词'} ${word.word}`} onClick={() => void mark(word.id, word.word, !excluded)}>{saving === word.id ? '正在保存…' : excluded ? '恢复练习' : '标为熟词'}</PixelButton>
          </div>
          <details className="mt-1 text-px12 text-dim"><summary className="min-h-11 cursor-pointer py-3 text-gold">查看释义并自查</summary><p className="readable whitespace-pre-line text-[16px] leading-relaxed text-bright">{word.definition}</p></details>
        </li>
      })}</ul>
      <p className="my-3 text-px12 text-dim tnum">显示 {Math.min(limit, visible.length)}/{visible.length} 词</p>
      {visible.length > limit && <PixelButton className="w-full" onClick={() => setLimit((value) => value + 24)}>再看 24 词</PixelButton>}
    </>}
  </Panel></div>
}
