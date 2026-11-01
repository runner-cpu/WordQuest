import { useEffect, useRef, useState } from 'react'
import { cacheCetPaper, CET_PAPER_AUDIO_CACHE, CET_PAPER_JSON_CACHE, CET_READY_PAPERS, cetPaperUrl, readyPaperQuestions } from '../core/cetReadyPapers'
import { cetPaperQuestionNumbers, cetPaperResult, cetPaperSubmissions, submitCetPaperStudy } from '../core/cetPapers'
import type { CetPaperScope, CetPaperStudy, CetPaperSubmission } from '../types/cetPaper'
import type { CetReadyPaper, CetReadyQuestion } from '../types/cetReadyPaper'
import { PixelButton } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { englishWordCount } from '../core/learningReport'
import { useCetPaperDraft } from './useCetPaperDraft'
import './cetPaperWorkspace.css'
import './cetReadyWorkspace.css'

const SECTIONS = [
  { id: 'listening', name: '听力', range: '1–25' }, { id: 'banked', name: '选词', range: '26–35' },
  { id: 'matching', name: '匹配', range: '36–45' }, { id: 'careful', name: '阅读', range: '46–55' },
  { id: 'writing', name: '写作', range: '30 分钟' }, { id: 'translation', name: '翻译', range: '30 分钟' },
] as const
type Section = typeof SECTIONS[number]['id'] | 'review'
const statusText = { saved: '已保存到本机', dirty: '稍后自动保存', saving: '正在保存…', error: '保存未完成，请重试' }

export function CetReadyWorkspace({ paper, initial, onClose, scope = 'all' }: { paper: CetReadyPaper; initial: CetPaperStudy; onClose: () => void; scope?: CetPaperScope }) {
  const sections = SECTIONS.filter((item) => scope === 'all' || (scope === 'listening' ? item.id === 'listening' : item.id !== 'listening'))
  const firstSection = sections[0].id
  const { study, draft, choose, update, action, saveState, error, busy, conflict, resolveConflict } = useCetPaperDraft(initial)
  const [section, setSection] = useState<Section>(firstSection)
  const [group, setGroup] = useState(0)
  const [reading, setReading] = useState(0)
  const [matching, setMatching] = useState(36)
  const [showSolutions, setShowSolutions] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [offline, setOffline] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')
  const [showSubmit, setShowSubmit] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'unanswered'>('all')
  const download = useRef<AbortController>()
  const audio = useRef<HTMLAudioElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const close = useRef<() => void>(() => undefined)
  const numbers = cetPaperQuestionNumbers(scope)
  const selected = numbers.filter((number) => draft.answers[number - 1]).length
  const questions = readyPaperQuestions(paper).filter((question) => numbers.includes(question.number))
  const submissions = cetPaperSubmissions(study, scope)
  const latestSubmission = submissions.latest
  const latestResult = cetPaperResult(latestSubmission, scope)
  const visibleQuestions = questions.filter(q => reviewFilter === 'all' || (reviewFilter === 'wrong' ? latestResult.wrong.includes(q.number) : !latestSubmission?.answers[q.number - 1]))
  const nextUnanswered = numbers.find(number => !draft.answers[number - 1])
  const scopeName = scope === 'listening' ? '听力' : scope === 'reading' ? '阅读与写译' : '本套练习'
  const audioUrl = cetPaperUrl(paper.assets.audio.path, paper.assets.audio.sha256)
  close.current = () => { void action(async () => { onClose() }) }

  useEffect(() => {
    const element = dialog.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element.showModal(); element.querySelector<HTMLHeadingElement>('h2')?.focus()
    document.body.style.overflow = 'hidden'
    let cancelled = false
    const entry = CET_READY_PAPERS.find((e) => e.sourceId === paper.sourceId)!
    if ('caches' in globalThis) void Promise.all([
      caches.open(CET_PAPER_AUDIO_CACHE).then((cache) => cache.match(audioUrl)),
      caches.open(CET_PAPER_JSON_CACHE).then((cache) => cache.match(cetPaperUrl(entry.path, entry.revision))),
    ]).then(([response, json]) => {
      if (!cancelled && response?.status === 200 && Number(response.headers.get('Content-Length')) === paper.assets.audio.bytes && json?.status === 200) setOffline('ready')
    }).catch(() => undefined)
    const player = audio.current
    return () => { cancelled = true; player?.pause(); download.current?.abort(); element.close(); document.body.style.overflow = overflow; opener?.focus() }
  }, [])

  useEffect(() => { body.current?.scrollTo({ top: 0 }); setShowSubmit(false) }, [section, group, reading])

  function jump(number: number) {
    if (number <= 25) { setSection('listening'); setGroup(paper.listening.findIndex((g) => g.questions.some((q) => q.number === number))) }
    else if (number <= 35) setSection('banked')
    else if (number <= 45) { setSection('matching'); setMatching(number) }
    else { setSection('careful'); setReading(number < 51 ? 0 : 1) }
    requestAnimationFrame(() => {
      const target = dialog.current?.querySelector<HTMLElement>(`#ready-q-${number}`)
      target?.scrollIntoView({ block: 'nearest' })
      target?.querySelector<HTMLElement>('input:checked, select, input')?.focus({ preventScroll: true })
    })
  }

  async function downloadPaper() {
    if (offline === 'loading') return
    const controller = new AbortController(); download.current = controller
    setOffline('loading'); setDownloadError(''); setDownloadProgress(0)
    try {
      await cacheCetPaper(paper, (progress) => { if (!controller.signal.aborted) setDownloadProgress(progress) }, controller.signal)
      if (!controller.signal.aborted) setOffline('ready')
    } catch (cause) {
      if (!controller.signal.aborted) { setOffline('error'); setDownloadError(cause instanceof Error ? cause.message : '缓存未完成，请重试') }
    }
  }

  function seekGroup() {
    const player = audio.current
    const start = paper.listening[group].startSeconds
    if (!player || start === undefined) return
    try { player.currentTime = start; void player.play().catch(() => setAudioError('点击播放器的播放键即可开始听力')) }
    catch { setAudioError('录音正在载入，请稍后再次播放本段') }
  }

  const qProps = { answers: draft.answers, disabled: busy, choose, solutions: showSolutions }
  const activeListening = paper.listening[group]
  const activeReading = paper.careful[reading]
  return <dialog ref={dialog} className="cet-paper-dialog cet-ready-dialog pixel-frame" data-scope={scope} aria-labelledby="ready-paper-title" onCancel={(event) => { event.preventDefault(); close.current() }}>
    <div className="cet-paper-shell">
      <header className="cet-paper-header cet-ready-header">
        <div className="min-w-0"><h2 id="ready-paper-title" tabIndex={-1} className="text-px24 text-bright">{paper.year} 年 {paper.month} 月{paper.level === 'cet4' ? '四级' : '六级'} · {scopeName}</h2><p className="readable text-dim">第 1 套 · 已答 {selected}/{numbers.length} · {paper.provider}</p></div>
        <PixelButton size="sm" variant="ghost" disabled={busy} aria-label="保存并退出真题练习" onClick={() => close.current()}><Icon name="cross" size={16} /></PixelButton>
      </header>
      {sections.length > 1 && <nav className="cet-ready-sections" aria-label="真题题型">
        {sections.map((item) => <button type="button" key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><span>{item.name}</span><span className="readable">{item.range}</span></button>)}
      </nav>}
      {scope !== 'reading' && <div className={`cet-ready-player readable ${section !== 'listening' ? 'cet-ready-player-secondary' : ''}`}>
        <span className="text-dim">本套听力</span>
        <audio ref={audio} controls preload="metadata" src={audioUrl} onError={() => setAudioError('录音加载未完成，请检查网络并重试')} onCanPlay={() => setAudioError('')} aria-label="本套真题听力播放器" />
        {audioError && <div role="alert" className="cet-ready-audio-error text-fail">{audioError}<button type="button" onClick={() => { setAudioError(''); audio.current?.load() }}>重试录音</button></div>}
      </div>}
      <div ref={body} className="cet-ready-body readable" aria-label="真题材料与作答">
        {section === 'listening' && <section className="cet-ready-listening">
          <div className="cet-ready-tools"><label className="text-dim">听力材料<select className="pixel-input" value={group} onChange={(event) => setGroup(Number(event.target.value))}>{paper.listening.map((g, i) => <option key={i} value={i}>{g.title} · {g.questions[0].number}–{g.questions[g.questions.length - 1].number}</option>)}</select></label>
            {activeListening.startSeconds !== undefined && <PixelButton onClick={seekGroup} icon="speaker">{activeListening.startSeconds === 0 ? '从头播放' : '播放本段'}</PixelButton>}
          </div>
          <p className="text-dim cet-ready-hint">听录音，直接选择下方选项。可用播放器重听和拖动进度。</p>
          {activeListening.questions.map((q) => <Question key={q.number} question={q} {...qProps} />)}
          <div className="cet-ready-tools"><PixelButton disabled={group === 0} onClick={() => setGroup(group - 1)}>上一段</PixelButton><PixelButton disabled={group === paper.listening.length - 1} onClick={() => setGroup(group + 1)}>下一段</PixelButton></div>
        </section>}
        {section === 'banked' && <div className="cet-ready-split">
          <section className="cet-ready-material" aria-label="选词填空文章"><h3>选词填空 · 26–35</h3><p className="text-dim">每个单词限用一次。点击空格可定位到对应答题框。</p><div lang="en" className="cet-ready-passage">{paper.banked.passage.split(/(__(?:2[6-9]|3[0-5])__)/g).map((part, i) => /^__/.test(part) ? <button className="cet-ready-blank" type="button" key={i} onClick={() => { const number = Number(part.replace(/_/g, '')); document.getElementById(`ready-blank-${number}`)?.focus() }}>{part.replace(/_/g, '')} {draft.answers[Number(part.replace(/_/g, '')) - 1] || '___'}</button> : part)}</div></section>
          <section className="cet-ready-questions" aria-label="选词填空答题区"><h3>选择填入的单词</h3><div className="cet-ready-wordbank" lang="en">{paper.banked.options.map((o) => <span key={o.key}><b>{o.key}</b> {o.text}</span>)}</div>
            {paper.banked.questions.map((q) => <div key={q.number} id={`ready-q-${q.number}`} className="cet-ready-blank-row"><label htmlFor={`ready-blank-${q.number}`}>第 {q.number} 空</label><select id={`ready-blank-${q.number}`} className="pixel-input" value={draft.answers[q.number - 1]} disabled={busy} onChange={(event) => choose(q.number, event.target.value)}><option value="">请选择单词</option>{q.options.map((o) => <option key={o.key} value={o.key}>{o.key}. {o.text}{draft.answers.some((v, i) => i !== q.number - 1 && i >= 25 && i < 35 && v === o.key) ? '（已用于其他空）' : ''}</option>)}</select>{showSolutions && <p className="text-gold">参考：{q.answer} · {q.explanation || q.options.find((o) => o.key === q.answer)?.text}</p>}</div>)}
          </section>
        </div>}
        {section === 'matching' && <div className="cet-ready-split">
          <section className="cet-ready-material" aria-label="长篇匹配文章"><h3>长篇匹配 · 36–45</h3><p className="text-dim">同一段落可以匹配多道题。右侧选择题目对应的段落。</p>{paper.matching.paragraphs.map((p) => <p key={p.key} lang="en" className="cet-ready-paragraph"><b>{p.key}</b> {p.text}</p>)}</section>
          <section className="cet-ready-questions" aria-label="长篇匹配答题区"><div className="cet-ready-question-nav">{paper.matching.questions.map((q) => <button type="button" key={q.number} aria-current={matching === q.number ? 'step' : undefined} aria-label={`第 ${q.number} 题${draft.answers[q.number - 1] ? '已答' : '未答'}`} onClick={() => setMatching(q.number)}>{q.number}{draft.answers[q.number - 1] && <span> {draft.answers[q.number - 1]}</span>}</button>)}</div><Question question={paper.matching.questions[matching - 36]} compact {...qProps} /></section>
        </div>}
        {section === 'careful' && <div className="cet-ready-split">
          <section className="cet-ready-material cet-ready-reading" aria-label="仔细阅读文章"><div className="cet-ready-tools">{paper.careful.map((_, i) => <button key={i} type="button" className="cet-ready-switch" aria-pressed={reading === i} onClick={() => setReading(i)}>文章 {i + 1} · {i ? '51–55' : '46–50'}</button>)}</div><h3>{activeReading.title || `Passage ${reading + 1}`}</h3><div lang="en" className="cet-ready-passage">{activeReading.passage}</div></section>
          <section className="cet-ready-questions" aria-label="仔细阅读答题区">{activeReading.questions.map((q) => <Question key={q.number} question={q} {...qProps} />)}</section>
        </div>}
        {(section === 'writing' || section === 'translation') && <div className="cet-ready-split">
          <section className="cet-ready-material" aria-label="写译题目"><h3>{section === 'writing' ? '写作任务' : '翻译原文'}</h3><div lang={section === 'writing' ? 'en' : 'zh-CN'} className="cet-ready-passage">{paper[section].prompt}</div><details className="cet-ready-reference"><summary>{section === 'writing' ? '查看参考范文与思路' : '查看参考译文'}</summary><p lang="en" className="cet-ready-passage">{paper[section].reference || '高校资料未提供本题参考文本。可从内容、结构、词汇和语法四个方面检查自己的表达。'}</p></details></section>
          <section className="cet-ready-questions"><div className="cet-paper-field"><label htmlFor="ready-output-draft">{section === 'writing' ? '我的写作草稿' : '我的翻译草稿'}</label><textarea id="ready-output-draft" className="pixel-input cet-ready-editor" lang="en" value={section === 'writing' ? draft.writingDraft : draft.translationDraft} disabled={busy} onChange={(event) => update(section === 'writing' ? { writingDraft: event.target.value } : { translationDraft: event.target.value })} placeholder="在这里完成，草稿会自动保存…" /></div><p className="text-dim">{englishWordCount(section === 'writing' ? draft.writingDraft : draft.translationDraft)} 个英文词 · 以题干中的字数要求为准</p><details className="cet-ready-reference"><summary>完成后逐项自查</summary><ul className="list-disc pl-5"><li>是否覆盖题干要求的全部要点？</li><li>每段是否有明确主旨，前后衔接是否自然？</li><li>检查时态、主谓一致、冠词和单复数。</li><li>对照参考稿，记录一处修改及其原因。</li></ul><p className="text-dim">参考稿只是表达示例。本应用不自动评分，建议请教师或同伴反馈。</p></details></section>
        </div>}
        {section === 'review' && <section className="cet-ready-review">
          <h3>{scopeName}复盘</h3>
          <p className="text-dim">核对已作答的客观题；未答题单列。以下为高校整理版参考结果，不换算 710 分。</p>
          <div className="cet-paper-results"><Result name="首次核对" submission={submissions.first} scope={scope} /><Result name="最近核对" submission={latestSubmission} scope={scope} /></div>
          <p className="text-dim">订正后的结果用于复盘；首次表现单独保留。先回到原文或录音找到证据，再显示答案。</p>
          <div className="cet-ready-tools" role="group" aria-label="答题与订正导航">
            <PixelButton disabled={!nextUnanswered} onClick={() => { if (nextUnanswered) jump(nextUnanswered) }}>继续未答题{nextUnanswered ? ` · ${nextUnanswered}` : ''}</PixelButton>
            <PixelButton disabled={!latestResult.wrong.length} onClick={() => { setShowSolutions(false); if (latestResult.wrong[0]) jump(latestResult.wrong[0]) }}>先订正第一个错题</PixelButton>
          </div>
          {latestSubmission && <div className="cet-ready-tools" role="group" aria-label="筛选复盘题目">{([{ id: 'all', label: `全部 ${questions.length}` }, { id: 'wrong', label: `待订正 ${latestResult.wrong.length}` }, { id: 'unanswered', label: `未答 ${latestResult.unanswered}` }] as const).map(item => <PixelButton key={item.id} aria-pressed={reviewFilter === item.id} variant={reviewFilter === item.id ? 'primary' : 'default'} onClick={() => setReviewFilter(item.id)}>{item.label}</PixelButton>)}</div>}
          {latestSubmission && visibleQuestions.length === 0 && <p role="status" className="text-dim">{reviewFilter === 'wrong' ? '这轮已核对的题目没有待订正项。可以补答未答题，或回看证据句。' : '这轮没有未答题，可以检查错题与笔记。'}</p>}
          {latestSubmission && <><label className="cet-ready-solutions"><input type="checkbox" checked={showSolutions} onChange={(event) => setShowSolutions(event.target.checked)} /> 订正时显示参考答案</label><h4>点击题号回到题目</h4><div className="cet-ready-overview">{visibleQuestions.map((q) => { const answer = latestSubmission.answers[q.number - 1]; const state = !answer ? '未答' : answer === latestSubmission.answerKey[q.number - 1] ? '正确' : '待订正'; return <button type="button" key={q.number} data-result={state} aria-label={`第 ${q.number} 题，${state}`} onClick={() => jump(q.number)}>{q.number}<span>{state}</span></button> })}</div></>}
          <label className="cet-paper-field">复盘笔记<textarea className="pixel-input" rows={5} value={draft.notes} disabled={busy} onChange={(event) => update({ notes: event.target.value })} placeholder="记录证据句、听漏的表达，以及写译中想改进的地方…" /></label>
          <details className="cet-ready-reference"><summary>本套资料与离线使用</summary><p>{paper.provider} · 整理版第 1 套 · 核对日期 {paper.checkedAt}。套号沿用高校资料，参考答案和范文用于学习核对。</p><p>题目与录音均由本站提供。缓存后可在此设备离线练习；浏览器清理缓存后需重新下载。</p><PixelButton disabled={offline === 'loading' || offline === 'ready'} onClick={() => void downloadPaper()}>{offline === 'loading' ? `缓存中 ${downloadProgress}%` : offline === 'ready' ? '本套题目与录音已缓存' : `缓存本套题目与录音 · ${(paper.assets.audio.bytes / 1024 / 1024).toFixed(1)} MB`}</PixelButton>{downloadError && <p role="alert" className="text-fail">{downloadError}</p>}</details>
        </section>}
      </div>
      {showSubmit && <div className="cet-ready-submit readable" role="region" aria-label="确认核对"><p>{scopeName}已答 {selected} 题，未答 {numbers.length - selected} 题。核对后可继续补答和订正，首次记录会保留。</p><div className="cet-ready-tools"><PixelButton disabled={busy} variant="primary" onClick={() => { void action(async () => { const saved = await submitCetPaperStudy(study.id, scope); setSection('review'); setShowSubmit(false); return saved }) }}>确认核对 {selected} 题</PixelButton><PixelButton disabled={busy} onClick={() => setShowSubmit(false)}>继续作答</PixelButton></div></div>}
      <footer className="cet-paper-footer cet-ready-footer">
        <div className="readable cet-paper-save-status"><p role="status" className={saveState === 'error' ? 'text-fail' : 'text-dim'}>{statusText[saveState]} · {selected}/{numbers.length}</p>{error && <p role="alert" className="text-fail">{error}</p>}</div>
        {conflict ? <div className="cet-ready-tools" role="group" aria-label="处理草稿冲突"><PixelButton disabled={busy} onClick={() => resolveConflict(true)}>保留本页修改并保存</PixelButton><PixelButton disabled={busy} onClick={() => resolveConflict(false)}>放弃本页修改，载入另一页</PixelButton></div> : saveState === 'error' && <PixelButton disabled={busy} onClick={() => void action(async () => undefined)}>重试保存</PixelButton>}
        <PixelButton disabled={busy} onClick={() => setSection(section === 'review' ? firstSection : 'review')}>{section === 'review' ? '继续答题' : '复盘与缓存'}</PixelButton>
        <PixelButton variant="primary" disabled={busy || selected === 0} onClick={() => setShowSubmit(!showSubmit)}>{busy ? '正在保存…' : submissions.first ? '核对订正' : '提交核对'}</PixelButton>
      </footer>
    </div>
  </dialog>
}

function Question({ question: q, answers, choose, disabled, solutions, compact = false }: { question: CetReadyQuestion; answers: string[]; choose: (number: number, answer: string) => void; disabled: boolean; solutions: boolean; compact?: boolean }) {
  return <fieldset id={`ready-q-${q.number}`} className="cet-ready-question" disabled={disabled}><legend><span className="text-gold">{q.number}.</span> <span lang="en">{q.prompt || '听录音选择正确答案'}</span></legend><div className={compact ? 'cet-ready-options cet-ready-options-compact' : 'cet-ready-options'}>{q.options.map((o) => <label key={o.key} data-selected={answers[q.number - 1] === o.key} data-correct={solutions && o.key === q.answer}><input type="radio" name={`ready-q-${q.number}`} value={o.key} checked={answers[q.number - 1] === o.key} onChange={() => choose(q.number, o.key)} /><b>{o.key}</b><span lang={compact ? 'zh-CN' : 'en'}>{o.text}</span></label>)}</div><button type="button" className="cet-ready-clear text-dim" disabled={disabled || !answers[q.number - 1]} onClick={() => choose(q.number, '')}>清除本题选择</button>{solutions && <div className="cet-ready-solution"><p className="text-dim">你的选择：{answers[q.number - 1] || '未答'}{answers[q.number - 1] ? ` · ${q.options.find(o => o.key === answers[q.number - 1])?.text ?? ''}` : ''}</p><p className="text-gold">参考答案：{q.answer} · {q.options.find(o => o.key === q.answer)?.text}</p><p className="text-dim">{q.explanation || '这套整理版尚未附逐题解析，请结合原文或录音复核证据，并记下错因。'}</p></div>}</fieldset>
}

function Result({ name, submission, scope }: { name: string; submission?: CetPaperSubmission; scope: CetPaperScope }) {
  const result = cetPaperResult(submission, scope)
  return <section><h4>{name}</h4>{submission ? <><p><strong className="text-gold">{result.correct}/{result.compared}</strong> 题正确</p><p className="text-dim">待订正 {result.wrong.length} · 未答 {result.unanswered}</p></> : <p className="text-dim">提交后在这里保留记录</p>}</section>
}
