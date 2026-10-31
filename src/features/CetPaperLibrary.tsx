import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CET_PAPER_SOURCES, type CetPaperSource } from '../data/cetPaperSources'
import { createCetPaperStudy } from '../core/cetPapers'
import { CET_READY_PAPERS, loadReadyCetPaper } from '../core/cetReadyPapers'
import { db } from '../db/database'
import type { CetPaperStudy } from '../types/cetPaper'
import type { CetReadyPaper } from '../types/cetReadyPaper'
import { PixelButton } from '../ui/Pixel'
import { CetPaperWorkspace } from './CetPaperWorkspace'
import { CetReadyWorkspace } from './CetReadyWorkspace'

export function CetPaperLibrary({ level }: { level: 'cet4' | 'cet6' }) {
  const [year, setYear] = useState('all')
  const [active, setActive] = useState<{ source: CetPaperSource; study: CetPaperStudy; paper?: CetReadyPaper } | null>(null)
  const [creating, setCreating] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState<{ source: CetPaperSource; study?: CetPaperStudy }>()
  const createLock = useRef(false)
  const request = useRef<AbortController>()
  const rows = useLiveQuery(() => db.cetPapers.toArray(), [])
  const sources = useMemo(() => CET_PAPER_SOURCES.filter((source) => source.level === level && CET_READY_PAPERS.some((entry) => entry.sourceId === source.id))
    .sort((a, b) => b.year - a.year || b.month - a.month), [level])
  const years = [...new Set(sources.map((source) => source.year))]
  const visible = sources.filter((source) => year === 'all' || source.year === Number(year))
  const saved = (rows ?? []).flatMap((study) => {
    const source = CET_PAPER_SOURCES.find((entry) => entry.id === study.sourceId && entry.level === level && (year === 'all' || entry.year === Number(year)))
    return source ? [{ source, study }] : []
  }).sort((a, b) => b.study.updatedAt - a.study.updatedAt)
  useEffect(() => { setYear('all') }, [level])
  useEffect(() => () => request.current?.abort(), [])

  async function open(source: CetPaperSource, existing?: CetPaperStudy) {
    if (createLock.current) return
    if (existing && (!existing.paperRevision || existing.paperRevision !== CET_READY_PAPERS.find((entry) => entry.sourceId === source.id)?.revision)) {
      setActive({ source, study: existing }); return
    }
    createLock.current = true
    const controller = new AbortController(); request.current = controller
    setCreating(existing?.id ?? source.id); setError(''); setRetry(undefined)
    try {
      const paper = await loadReadyCetPaper(source.id, controller.signal)
      if (controller.signal.aborted) return
      const entry = CET_READY_PAPERS.find((item) => item.sourceId === source.id)!
      const study = existing ?? await createCetPaperStudy(source.id, '站内真题 · 高校整理第 1 套', paper.answerKey, entry.revision)
      if (!controller.signal.aborted) setActive({ source, study, paper })
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : '真题准备未完成，请检查网络或本机存储后重试'); setRetry({ source, study: existing }) }
    } finally {
      createLock.current = false
      if (!controller.signal.aborted) setCreating('')
    }
  }

  return <div className="cet-paper-library">
    <div className="cet-paper-intro readable">
      <h3 className="font-semibold text-bright">选一套，直接开始练</h3>
      <p>题目、选项和听力都在这里。边看材料边作答，提交后自动核对，也能接着订正和续写。</p>
      <p className="text-dim">当前{level === 'cet4' ? '四级' : '六级'}有 {sources.length} 套完整真题，每套 55 道客观题及写译任务，均为高校整理第 1 套。首次练习按需加载；复盘页可缓存本套题目与录音。</p>
    </div>
    <label className="cet-paper-filter readable text-dim">考试年份
      <select className="pixel-input" value={year} onChange={(event) => setYear(event.target.value)}>
        <option value="all">全部年份 · 最近优先</option>
        {years.map((value) => <option key={value} value={value}>{value} 年</option>)}
      </select>
    </label>
    {rows === undefined && <p className="readable py-4 text-dim" role="status">正在读取本机真题档案…</p>}
    {saved.length > 0 && <section className="cet-paper-saved" aria-labelledby="cet-paper-saved-title">
      <h3 id="cet-paper-saved-title" className="text-px12 text-gold">接着上次练</h3>
      <ul>{saved.map(({ source, study }) => <li key={study.id} className="cet-paper-saved-row">
        <div className="min-w-0 readable"><p className="text-bright">{source.title.replace('真题资料', '真题')}</p><p className="text-dim">{study.paperRevision ? '站内练习' : '原有自带资料档案'} · 已答 {study.answers.filter(Boolean).length}/55 · {study.latestSubmission ? '可继续订正' : '尚未核对'}</p></div>
        <PixelButton disabled={Boolean(creating)} onClick={() => void open(source, study)} aria-label={`继续${source.title}`} icon="arrow-right">{creating === study.id ? '读取中…' : '继续练习'}</PixelButton>
      </li>)}</ul>
    </section>}
    {error && <div className="readable" role="alert"><p className="text-fail">{error}</p>{retry && <PixelButton disabled={Boolean(creating)} onClick={() => void open(retry.source, retry.study)}>重试加载这套题</PixelButton>}</div>}
    <ol className="cet-paper-source-list" aria-label={`${level === 'cet4' ? '四级' : '六级'}站内真题`}>
      {visible.map((source) => <li key={source.id} className="cet-paper-source-row">
        <div className="cet-paper-source-heading">
          <div><h3 className="text-px12 text-bright">{source.title.replace('真题资料', '真题')}</h3><p className="readable mt-2 text-dim">55 题 · 听力录音 · 内置参考答案 · 写译草稿</p></div>
          <PixelButton variant="primary" onClick={() => void open(source)} disabled={rows === undefined || Boolean(creating)} aria-label={`新建${source.title}练习`} aria-busy={creating === source.id} icon="book">{creating === source.id ? '正在载入题目…' : '开始这套真题'}</PixelButton>
        </div>
        <details className="adventure-reference readable text-dim"><summary>资料来源与版本</summary><p>{source.provider}。题目、录音与参考答案随本站提供，套号沿用高校资料。高校整理版用于练习与核对。</p><p>来源：{source.sourceUrl}</p></details>
      </li>)}
    </ol>
    <p className="cet-paper-note readable text-dim">写作与翻译可在站内完成并对照参考修订；高校未提供的参考文本会明确标注。原有自带资料档案继续保留。</p>
    {active && (active.paper ? <CetReadyWorkspace key={active.study.id} paper={active.paper} initial={active.study} onClose={() => setActive(null)} /> : <CetPaperWorkspace key={active.study.id} source={active.source} initial={active.study} onClose={() => setActive(null)} />)}
  </div>
}
