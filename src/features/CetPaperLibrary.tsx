import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CET_PAPER_SOURCES, type CetPaperSource } from '../data/cetPaperSources'
import { createCetPaperStudy } from '../core/cetPapers'
import { db } from '../db/database'
import type { CetPaperStudy } from '../types/cetPaper'
import { PixelButton } from '../ui/Pixel'
import { CetPaperWorkspace } from './CetPaperWorkspace'

export function CetPaperLibrary({ level }: { level: 'cet4' | 'cet6' }) {
  const [year, setYear] = useState('all')
  const [active, setActive] = useState<{ source: CetPaperSource; study: CetPaperStudy } | null>(null)
  const [creating, setCreating] = useState('')
  const [error, setError] = useState('')
  const createLock = useRef(false)
  const rows = useLiveQuery(() => db.cetPapers.toArray(), [])
  const sources = useMemo(() => CET_PAPER_SOURCES.filter((source) => source.level === level)
    .sort((a, b) => b.year - a.year || b.month - a.month), [level])
  const years = [...new Set(sources.map((source) => source.year))]
  const visible = sources.filter((source) => year === 'all' || source.year === Number(year))
  const saved = (rows ?? []).flatMap((study) => {
    const source = visible.find((entry) => entry.id === study.sourceId)
    return source ? [{ source, study }] : []
  }).sort((a, b) => b.study.updatedAt - a.study.updatedAt)

  async function start(source: CetPaperSource) {
    if (createLock.current) return
    createLock.current = true
    setCreating(source.id); setError('')
    try {
      const study = await createCetPaperStudy(source.id, '来源第1套 · 请与原卷核对')
      setActive({ source, study })
    } catch {
      setError('真题学习档案暂未创建成功，请检查本机存储后重试。')
    } finally {
      createLock.current = false
      setCreating('')
    }
  }

  return <div className="cet-paper-library">
    <div className="cet-paper-intro readable">
      <h3 className="font-semibold text-bright">从近年的一套真题开始</h3>
      <p>按高校公开资料看原卷、听录音，再用答题卡和写译草稿留下自己的作答。做过的题可以接着订正。</p>
      <p className="text-dim">已收录 2023 年 6 月至 2026 年 6 月的资料入口，四、六级各 7 期，每期第 1 套。资料需联网打开；导入本机的 PDF 与录音可离线使用。</p>
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
        <div className="min-w-0 readable">
          <p className="text-bright">{source.title}</p>
          <p className="text-dim">{study.variant || '卷别待核对'} · 已选 {study.answers.filter(Boolean).length}/55 题 · {study.latestSubmission ? '已有核对记录' : '尚未核对'}</p>
        </div>
        <PixelButton onClick={() => setActive({ source, study })} aria-label={`继续${source.title}`} icon="arrow-right">继续练习</PixelButton>
      </li>)}</ul>
    </section>}
    {error && <p className="readable text-fail" role="alert">{error}</p>}
    <ol className="cet-paper-source-list" aria-label={`${level === 'cet4' ? '四级' : '六级'}近年真题资料`}>
      {visible.map((source) => <li key={source.id} className="cet-paper-source-row">
        <div className="cet-paper-source-heading">
          <div>
            <h3 className="text-px12 text-bright">{source.title}</h3>
            <p className="readable mt-2 text-dim">{source.provider}</p>
          </div>
          <PixelButton variant="primary" onClick={() => void start(source)} disabled={rows === undefined || Boolean(creating)} aria-label={`新建${source.title}练习`} aria-busy={creating === source.id} icon="book">{creating === source.id ? '正在准备…' : '开始这套真题'}</PixelButton>
        </div>
        <div className="cet-paper-source-links readable">
          <a href={source.sourceUrl} target="_blank" rel="noreferrer">高校资料页</a>
          {source.paperUrl && <a href={source.paperUrl} target="_blank" rel="noreferrer" aria-label={`原卷 PDF · ${source.title}`}>原卷 PDF</a>}
          {source.answersUrl && <a href={source.answersUrl} target="_blank" rel="noreferrer" aria-label={`答案解析 · ${source.title}`}>答案解析</a>}
          {source.audioUrl && <a href={source.audioUrl} target="_blank" rel="noreferrer" aria-label={`听力录音 · ${source.title}`}>听力录音</a>}
        </div>
        <details className="adventure-reference readable text-dim">
          <summary>资料版本与来源说明</summary>
          <p>{source.note}</p>
          <p className="mt-2">链接核对：{source.checkedAt}。同一月份不同整理者的套号可能不同，请同时核对题目与答案。</p>
        </details>
      </li>)}
    </ol>
    <p className="cet-paper-note readable text-dim">高校托管资料保留其整理版本与来源信息。整卷通过原站查看或本机文件练习；应用内的原创专项单独保留，便于短时加练。</p>
    {active && <CetPaperWorkspace key={active.study.id} source={active.source} initial={active.study} onClose={() => setActive(null)} />}
  </div>
}
