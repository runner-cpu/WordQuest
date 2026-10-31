import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CET_PAPER_SOURCES, type CetPaperSource } from '../data/cetPaperSources'
import { cetPaperQuestionNumbers, cetPaperSubmissions, createCetPaperStudy } from '../core/cetPapers'
import { CET_READY_PAPERS, loadReadyCetPaper } from '../core/cetReadyPapers'
import { db } from '../db/database'
import type { CetPaperScope, CetPaperStudy } from '../types/cetPaper'
import type { CetReadyPaper } from '../types/cetReadyPaper'
import { PixelButton } from '../ui/Pixel'
import { CetPaperWorkspace } from './CetPaperWorkspace'
import { CetReadyWorkspace } from './CetReadyWorkspace'

export function CetPaperLibrary({ level, scope = 'reading' }: { level: 'cet4' | 'cet6'; scope?: CetPaperScope }) {
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
  const numbers = cetPaperQuestionNumbers(scope)
  const count = (study: CetPaperStudy) => numbers.filter((number) => study.answers[number - 1]).length
  const latestFor = (source: CetPaperSource) => saved.find(({ study }) => study.sourceId === source.id && study.paperRevision === CET_READY_PAPERS.find((entry) => entry.sourceId === source.id)?.revision)?.study
  const archives = saved.filter(({ source, study }) => study.id !== latestFor(source)?.id)
  const title = (source: CetPaperSource) => `${source.year} 年 ${source.month} 月 · 第 1 套`
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
      <p className="text-dim">{scope === 'listening' ? `共 ${sources.length} 套 · 每套 25 题 · 原卷录音与参考答案，打开即可听、即可答。` : scope === 'reading' ? '阅读、写作和翻译在这里练。阅读 30 题自动核对，写译可对照参考修订。' : '完整题目、录音与参考答案，打开即可作答。'}</p>
    </div>
    <label className="cet-paper-filter readable text-dim">考试年份
      <select className="pixel-input" value={year} onChange={(event) => setYear(event.target.value)}>
        <option value="all">全部年份 · 最近优先</option>
        {years.map((value) => <option key={value} value={value}>{value} 年</option>)}
      </select>
    </label>
    {rows === undefined && <p className="readable py-4 text-dim" role="status">正在读取本机真题档案…</p>}
    {error && <div className="readable" role="alert"><p className="text-fail">{error}</p>{retry && <PixelButton disabled={Boolean(creating)} onClick={() => void open(retry.source, retry.study)}>重试加载这套题</PixelButton>}</div>}
    <ol className="cet-paper-source-list" aria-label={`${level === 'cet4' ? '四级' : '六级'}站内真题`}>
      {visible.map((source) => { const study = latestFor(source); return <li key={source.id} className="cet-paper-source-row">
        <div className="cet-paper-source-heading">
          <div className="min-w-0"><h3 className="text-px12 text-bright">{title(source)}</h3><p className="readable mt-1 text-dim">{scope === 'listening' ? '听力 25 题' : scope === 'reading' ? '阅读 30 题 · 写作 · 翻译' : '55 题 · 写作 · 翻译'}{study && ` · 已答 ${count(study)}/${numbers.length}${cetPaperSubmissions(study, scope).latest ? ' · 可订正' : ''}`}</p></div>
          <PixelButton variant={study ? 'primary' : 'default'} onClick={() => void open(source, study)} disabled={rows === undefined || Boolean(creating)} aria-label={`${study ? '继续' : '开始'}${source.title}${scope === 'listening' ? '听力' : '阅读与写译'}`} aria-busy={creating === (study?.id ?? source.id)} icon={scope === 'listening' ? 'headphones' : 'book'}>{creating === (study?.id ?? source.id) ? '载入中…' : study ? '继续练习' : scope === 'listening' ? '开始听力' : '开始练习'}</PixelButton>
        </div>
        {study && <details className="cet-paper-round readable text-dim"><summary>练习记录</summary><p>本套题的听力和阅读共用草稿，核对结果分别保存。新一轮会另存档案。</p><PixelButton disabled={Boolean(creating)} onClick={() => void open(source)}>新开一轮练习</PixelButton></details>}
      </li> })}
    </ol>
    <details className="cet-paper-provenance readable text-dim"><summary>真题来源与历史档案{archives.length > 0 ? ` · ${archives.length} 份` : ''}</summary><p>南京大学公开整理版第 1 套，题目、录音和参考答案随本站提供。套号沿用高校资料；参考答案用于学习核对。首次使用按需加载，复盘页支持缓存离线使用。</p>{scope !== 'listening' && <p>写作和翻译可对照参考修订，高校未提供的参考文本会明确标注。</p>}
      {visible.map((source) => <p key={source.id}>{title(source)}<br /><span className="break-all">{source.sourceUrl}</span></p>)}
      {archives.length > 0 && <ul>{archives.map(({ source, study }) => <li key={study.id} className="cet-paper-saved-row"><div className="min-w-0"><p>{title(source)} · {study.paperRevision ? '历史练习' : '自带资料档案'}</p><p>已答 {count(study)}/{numbers.length} · {new Date(study.updatedAt).toLocaleDateString('zh-CN')}</p></div><PixelButton disabled={Boolean(creating)} onClick={() => void open(source, study)}>打开档案</PixelButton></li>)}</ul>}
    </details>
    {active && (active.paper ? <CetReadyWorkspace key={active.study.id} paper={active.paper} initial={active.study} scope={scope} onClose={() => setActive(null)} /> : <CetPaperWorkspace key={active.study.id} source={active.source} initial={active.study} onClose={() => setActive(null)} />)}
  </div>
}
