import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CET_PRACTICES, type CetLevel, type CetPractice, type CetReading } from '../data/cetPractice'
import { db } from '../db/database'
import { cetPhaseAdvice, readingResult, recommendCetPractice } from '../core/cetPlan'
import { daysUntil, examDateInfo } from '../core/exam'
import { submitCetReading } from '../core/cetPractice'
import { useUi } from '../state/ui'
import { useStudyClock } from '../state/useStudyClock'
import { Panel, PixelButton } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import type { CetPracticeRecord } from '../types/model'
import { CetOutputExercise } from './CetOutputExercise'
import { CetPaperLibrary } from './CetPaperLibrary'

const KINDS = [{ id: 'reading', name: '阅读', weight: '35%', time: '40 分钟' }, { id: 'writing', name: '写作', weight: '15%', time: '30 分钟' }, { id: 'translation', name: '翻译', weight: '15%', time: '30 分钟' }, { id: 'listening', name: '听力', weight: '35%', time: '25 / 30 分钟' }] as const
type Kind = typeof KINDS[number]['id']
const levelName = (level: CetLevel) => level === 'cet6' ? '六级' : '四级'

export function CetPrepHub() {
  const profile = useUi((state) => state.profile)
  const setTab = useUi((state) => state.setTab)
  const todaySection = useUi((state) => state.todaySection)
  const clearTodaySection = useUi((state) => state.clearTodaySection)
  const target = profile?.examType ?? 'cet4'
  const [level, setLevel] = useState<CetLevel>(target)
  const [kind, setKind] = useState<Kind>('reading')
  const [mode, setMode] = useState<'papers' | 'original'>('papers')
  const [active, setActive] = useState<CetPractice | null>(null)
  const rows = useLiveQuery(() => db.cetPractice.toArray(), [])
  const now = useStudyClock()
  const days = daysUntil(profile?.examDate, new Date(now))
  const dateInfo = examDateInfo(profile?.examDate)
  const tasks = CET_PRACTICES.filter((item) => item.examType === level)
  const records = rows ?? []
  const recommendation = recommendCetPractice(tasks, records)
  const completed = tasks.filter((task) => records.find((row) => row.id === task.id)?.completedAt).length
  useEffect(() => setLevel(target), [target])
  useEffect(() => {
    if (todaySection !== 'cet-prep') return
    // 等待备考台实际挂载，并让首页的滚动复位先完成。
    const frame = requestAnimationFrame(() => {
      document.getElementById('cet-prep')?.scrollIntoView({ block: 'start' })
      document.getElementById('cet-prep-title')?.focus({ preventScroll: true })
      clearTodaySection()
    })
    return () => cancelAnimationFrame(frame)
  }, [todaySection, clearTodaySection])

  function status(task: CetPractice) {
    const row = records.find((item) => item.id === task.id)
    if (task.kind === 'reading' && row?.completedAt) {
      const result = readingResult(task, row)
      return result.pending.length ? `首次 ${result.firstCorrect}/3 · 待订正 ${result.pending.length} 题` : `首次 ${result.firstCorrect}/3 · 最新 3/3`
    }
    if (row?.submittedAt && row.updatedAt > row.submittedAt) return '有修订草稿 · 继续自查'
    if (row?.completedAt) return '已完成自评 · 可再修订'
    return row?.draft.trim() ? '草稿已保存 · 接着写' : '尚未练习'
  }

  return <Panel as="section" className="cet-hub !p-4 md:!p-5">
    <div className="cet-hub-heading">
      <div>
        <h2 id="cet-prep-title" tabIndex={-1} className="text-px24 text-bright">四六级备考台</h2>
        <p className="readable mt-2 text-dim">背过的词，也要放进篇章和自己的表达里。</p>
      </div>
      <div className="text-px12 text-dim">目标 {levelName(target)} · {profile?.examDate ?? '日期未设置'}<span className="mt-1 block">{dateInfo.label}</span></div>
    </div>
    <p className="readable mt-4 text-dim">{cetPhaseAdvice(days)}</p>
    <div className="cet-levels" role="group" aria-label="专项练习级别">
      <span className="text-px12 text-dim">练习级别</span>
      {(['cet4', 'cet6'] as const).map((item) => <PixelButton key={item} size="sm" variant={level === item ? 'primary' : 'default'} aria-pressed={level === item} onClick={() => setLevel(item)}>{levelName(item)}</PixelButton>)}
      {mode === 'original' && <span className="text-px12 text-dim">{rows === undefined ? '正在读取档案…' : `已完成 ${completed}/6 项原创练习`}</span>}
    </div>
    {level !== target && <p className="readable mb-3 text-px12 text-dim">正在浏览{levelName(level)}练习。你的备考目标仍为{levelName(target)}，可在设置中修改。</p>}
    <div className="cet-paper-modes" role="group" aria-label="选择备考资料">
      <PixelButton variant={mode === 'papers' ? 'primary' : 'default'} aria-pressed={mode === 'papers'} onClick={() => setMode('papers')}>阅读与写译真题</PixelButton>
      <PixelButton variant={mode === 'original' ? 'primary' : 'default'} aria-pressed={mode === 'original'} onClick={() => setMode('original')}>原创专项</PixelButton>
      <PixelButton variant="ghost" icon="headphones" onClick={() => setTab('listening')}>听力真题</PixelButton>
    </div>
    {mode === 'papers' ? <CetPaperLibrary level={level} scope="reading" /> : <>
    <div className="cet-skills" role="group" aria-label="选择四六级专项">
      {KINDS.map((item) => <button key={item.id} type="button" aria-pressed={kind === item.id} className={`cet-skill ${kind === item.id ? 'cet-selected' : ''}`} onClick={() => setKind(item.id)}>
        <span>{item.name}<span className="ml-2 text-dim">{item.weight}</span></span>
        <span className="readable text-dim">{item.id === 'listening' ? (level === 'cet4' ? '考试 25 分钟' : '考试 30 分钟') : `考试 ${item.time}`}</span>
      </button>)}
    </div>
    {kind === 'listening' ? <div className="cet-listening readable">
      <h3 className="text-bright">{levelName(level)}听力怎么练</h3>
      <p className="text-dim">{level === 'cet4' ? '考试包括短篇新闻、长对话和听力篇章。' : '考试包括长对话、听力篇章和讲话、报道、讲座。'}先听关键信息，再回听证据，最后脱离原文重听。</p>
      <p className="text-dim">听力页提供近年真题原卷录音、25 道题及参考答案，也可以展开原创录音做短练。</p>
      <PixelButton icon="headphones" onClick={() => setTab('listening')}>进入听力页</PixelButton>
      {level !== target && <p className="text-px12 text-dim">听力页默认跟随已设置的{levelName(target)}目标，可在页内切换级别。</p>}
    </div> : <>
      <div className="cet-practice-list" aria-label={`${levelName(level)}${KINDS.find((item) => item.id === kind)?.name}练习`}>
        {tasks.filter((item) => item.kind === kind).map((task) => <div key={task.id} className="cet-practice-row">
          <div className="min-w-0">
            <h3 className="text-px12 text-bright">{task.title}</h3>
            <p className="readable mt-2 text-dim">{task.focus}</p>
            <p className="mt-2 text-px12 text-dim">{task.minutes} 分钟建议 · {status(task)}</p>
          </div>
          <PixelButton onClick={() => setActive(task)} disabled={rows === undefined} aria-label={`练习${task.title}`} icon="arrow-right">{records.find((row) => row.id === task.id)?.completedAt ? '查看与复盘' : '开始练习'}</PixelButton>
        </div>)}
      </div>
      {recommendation && rows !== undefined && <div className="cet-recommendation">
        <div><p className="text-px12 text-gold">本次推荐 · {recommendation.reason}</p><p className="readable mt-2 text-bright">{recommendation.task.title}</p></div>
        <PixelButton variant="primary" onClick={() => setActive(recommendation.task)} icon="target">{recommendation.task.kind === 'reading' && readingResult(recommendation.task, records.find((row) => row.id === recommendation.task.id)).pending.length ? '去订正' : '接着练这一项'}</PixelButton>
      </div>}
    </>}
    </>}
    <details className="adventure-reference cet-scope readable">
      <summary>考试结构与本应用练习范围</summary>
      <p>笔试中听力、阅读各占 35%，写作、翻译各占 15%。四级总时长 125 分钟，六级 130 分钟；各分项时间见上方。</p>
      <p>阅读还包括选词填空（5%）、长篇匹配（10%）、仔细阅读（20%）。本站内置近年高校整理真题，首页练阅读与写译，听力页练录音和 25 题。原创专项另作加练。</p>
      <p>真题内置参考答案，共享一份作答草稿，听力与阅读分别保留首次和最近核对；写译草稿和笔记自动保存。原创写译保留自查流程。记录不换算考试分数、CEFR 等级或过级概率。</p>
      <a className="text-gold underline" href="https://cet.neea.edu.cn/html1/report/16123/177-1.htm" target="_blank" rel="noreferrer">查看教育部教育考试院笔试说明</a>
      <p className="text-px12 text-dim">考试结构核对日期：2026-10-30。</p>
    </details>
    {active && <CetPracticeDialog key={active.id} task={active} initial={records.find((row) => row.id === active.id)} onClose={() => setActive(null)} />}
  </Panel>
}

function CetPracticeDialog({ task, initial, onClose }: { task: CetPractice; initial?: CetPracticeRecord; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeRequest = useRef<() => void>(onClose)
  useEffect(() => {
    const element = dialog.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element.showModal()
    element.querySelector<HTMLHeadingElement>('#cet-task-title')?.focus()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; opener?.focus() }
  }, [])
  return <dialog ref={dialog} className="adventure-dialog cet-dialog pixel-frame" aria-labelledby="cet-task-title" onCancel={(event) => { event.preventDefault(); closeRequest.current() }}>
    <div className="adventure-dialog-shell">
      <header className="flex items-center justify-between gap-3 border-b-2 border-edge p-4">
        <span className="text-px12 text-dim">{levelName(task.examType)} · {KINDS.find((item) => item.id === task.kind)?.name}专项</span>
        <PixelButton size="sm" variant="ghost" aria-label="退出专项练习" onClick={() => closeRequest.current()}><Icon name="cross" size={16} /></PixelButton>
      </header>
      {task.kind === 'reading' ? <CetReadingExercise task={task} initial={initial} onClose={onClose} closeRequest={closeRequest} /> : <CetOutputExercise task={task} initial={initial} onClose={onClose} closeRequest={closeRequest} />}
    </div>
  </dialog>
}

function CetReadingExercise({ task, initial, onClose, closeRequest }: { task: CetReading; initial?: CetPracticeRecord; onClose: () => void; closeRequest: MutableRefObject<() => void> }) {
  const [row, setRow] = useState(initial)
  const [answers, setAnswers] = useState<number[]>(initial?.latestAnswers ?? task.questions.map(() => -1))
  const [review, setReview] = useState(Boolean(initial?.completedAt))
  const [retry, setRetry] = useState(false)
  const [exitPrompt, setExitPrompt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const title = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const result = readingResult(task, row)
  const indices = retry ? result.pending : task.questions.map((_, i) => i)
  const dirty = !review && answers.some((answer, i) => answer !== (row?.latestAnswers?.[i] ?? -1))
  useEffect(() => {
    closeRequest.current = () => { if (!lock.current) { if (dirty) setExitPrompt(true); else onClose() } }
  }, [closeRequest, dirty, onClose])
  useEffect(() => { title.current?.focus(); body.current?.scrollTo({ top: 0 }) }, [review, exitPrompt])
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])

  async function submit() {
    if (lock.current || answers.some((answer) => answer < 0)) return
    lock.current = true; setBusy(true); setError('')
    try { setRow(await submitCetReading(task.id, answers)); setReview(true); setRetry(false) }
    catch { setError('这次交卷没有保存成功，所选答案仍在，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }

  return <>
    <div ref={body} className="adventure-dialog-body p-4 md:p-6">
      <h2 id="cet-task-title" ref={title} tabIndex={-1} className="text-px24 text-bright">{exitPrompt ? '这篇阅读还没交卷' : task.title}</h2>
      {exitPrompt ? <div className="readable mt-5 space-y-4"><p>已交卷的记录会保留。退出将舍弃本轮尚未交卷的选项。</p><div className="cet-actions"><PixelButton variant="primary" onClick={() => setExitPrompt(false)}>继续完成</PixelButton><PixelButton onClick={onClose}>舍弃本轮并退出</PixelButton></div></div> : <>
        <p className="readable mt-3 text-dim">{task.focus} · 建议 {task.minutes} 分钟。练习不设强制倒计时，交卷后找出每题证据。</p>
        {review && <div className="cet-reading-result readable" role="status"><span>首次作答 <strong className="text-gold">{result.firstCorrect}/{task.questions.length}</strong></span><span>{result.pending.length ? `还有 ${result.pending.length} 题待订正` : '最新一轮全部正确 · 可以回读证据'}</span><p className="text-dim">首次记录保留；订正反映回看解析后的练习，不替代首次成绩。</p></div>}
        {retry && <p className="readable mt-4 text-gold">只练上次答错的 {indices.length} 题。请回到原文，重新判断。</p>}
        <div className="cet-reading-layout">
          <article className="cet-passage readable" aria-label="阅读原文" lang="en">{task.passage.map((paragraph, i) => <p key={i}><span className="cet-paragraph-index" aria-label={`第${i + 1}段`}>{String.fromCharCode(65 + i)}</span>{paragraph}</p>)}</article>
          {review ? <ol className="cet-reading-review readable" aria-label="逐题证据与订正">{task.questions.map((q, i) => <li key={q.id}>
            <p className="text-px12 text-dim">第 {i + 1} 题 · {q.skill}</p><h3 lang="en" className="mt-2 text-bright">{q.prompt}</h3>
            <p className="mt-3 text-dim" lang="en">首次选择：{String.fromCharCode(65 + (row?.firstAnswers?.[i] ?? 0))}. {q.options[row?.firstAnswers?.[i] ?? 0]}</p>
            <p className="mt-2 text-pass" lang="en">参考答案：{String.fromCharCode(65 + q.answer)}. {q.options[q.answer]}</p>
            <p className="mt-2 text-px12 text-dim">{row?.latestAnswers?.[i] === q.answer ? '最新作答正确' : '仍待订正'}</p>
            <blockquote lang="en" className="cet-evidence">{q.evidence}</blockquote><p className="text-dim">{q.explanation}</p>
          </li>)}</ol> : <form id="cet-reading-form" onSubmit={(event) => { event.preventDefault(); void submit() }} className="cet-reading-questions readable">
            {indices.map((i) => { const q = task.questions[i]; return <fieldset key={q.id} disabled={busy}><legend><span className="mb-2 block text-px12 text-dim">第 {i + 1} 题 · {q.skill}</span><span lang="en">{q.prompt}</span></legend><div className="mt-3 space-y-2">{q.options.map((option, j) => <label key={j} className={`cet-choice ${answers[i] === j ? 'cet-choice-selected' : ''}`}><input type="radio" name={q.id} value={j} checked={answers[i] === j} onChange={() => setAnswers((previous) => previous.map((value, k) => k === i ? j : value))} /><span lang="en">{String.fromCharCode(65 + j)}. {option}</span></label>)}</div></fieldset> })}
          </form>}
        </div>
      </>}
      {error && <p className="readable mt-4 text-fail" role="alert">{error}</p>}
    </div>
    {!exitPrompt && <footer className="cet-actions border-t-2 border-edge p-4">
      <p className="readable mr-auto text-px12 text-dim">{review ? '已保存到本机专项档案' : `已选 ${answers.filter((answer) => answer >= 0).length}/${task.questions.length} 题 · 交卷后保存`}</p>
      {review ? <>{result.pending.length > 0 && <PixelButton variant="primary" onClick={() => { setRetry(true); setReview(false) }}>只练这 {result.pending.length} 道错题</PixelButton>}<PixelButton onClick={onClose}>回备考台</PixelButton></> : <PixelButton form="cet-reading-form" type="submit" variant="primary" disabled={busy || answers.some((answer) => answer < 0)} aria-busy={busy}>{busy ? '正在保存…' : retry ? '保存本轮订正' : '交卷并找证据'}</PixelButton>}
    </footer>}
  </>
}
