import { useEffect, useRef, useState } from 'react'
import { attachCetPaperFile, cetPaperResult, parseCetAnswerKey, saveCetPaperStudy, submitCetPaperStudy } from '../core/cetPapers'
import type { CetPaperSource } from '../data/cetPaperSources'
import { db } from '../db/database'
import type { CetPaperFileKind, CetPaperStudy, CetPaperSubmission } from '../types/cetPaper'
import { PixelButton } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import './cetPaperWorkspace.css'

type Draft = Pick<CetPaperStudy, 'variant' | 'answers' | 'answerKey' | 'writingDraft' | 'translationDraft' | 'notes'>
const TABS = [{ id: 'files', name: '原卷与录音' }, { id: 'answers', name: '答题卡' }, { id: 'writing', name: '写作与翻译' }, { id: 'review', name: '复盘' }] as const
type Tab = typeof TABS[number]['id']
const GROUPS = [{ name: '听力', start: 0, end: 25, letters: 4 }, { name: '选词填空', start: 25, end: 35, letters: 15 }, { name: '长篇匹配', start: 35, end: 45, letters: 26 }, { name: '仔细阅读', start: 45, end: 55, letters: 4 }]
const FILES: { kind: CetPaperFileKind; label: string; accept: string }[] = [
  { kind: 'paper', label: '原卷 PDF', accept: 'application/pdf,.pdf' },
  { kind: 'answers', label: '答案 PDF', accept: 'application/pdf,.pdf' },
  { kind: 'audio', label: '听力录音', accept: 'audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac,audio/flac,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac' },
]
const draftOf = (row: CetPaperStudy): Draft => ({ variant: row.variant, answers: [...row.answers], answerKey: [...row.answerKey], writingDraft: row.writingDraft, translationDraft: row.translationDraft, notes: row.notes })

export function CetPaperWorkspace({ source, initial, onClose }: { source: CetPaperSource; initial: CetPaperStudy; onClose: () => void }) {
  const [study, setStudy] = useState(initial)
  const studyRef = useRef(initial)
  const [draft, setDraft] = useState(() => draftOf(initial))
  const draftRef = useRef(draft)
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)
  const savedRevision = useRef(0)
  const editedAt = useRef(initial.updatedAt)
  const queue = useRef<Promise<CetPaperStudy>>(Promise.resolve(initial))
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const actionLock = useRef(false)
  const [tab, setTab] = useState<Tab>('files')
  const [keyText, setKeyText] = useState('')
  const keyTextRef = useRef('')
  const [keyErrors, setKeyErrors] = useState<string[]>([])
  const [urls, setUrls] = useState<Partial<Record<CetPaperFileKind, string>>>({})
  const [missingFiles, setMissingFiles] = useState<string[]>([])
  const [documentKind, setDocumentKind] = useState<'paper' | 'answers'>('paper')
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const closeRef = useRef<() => void>(() => undefined)

  function update(patch: Partial<Draft>) {
    draftRef.current = { ...draftRef.current, ...patch }
    setDraft(draftRef.current)
    revisionRef.current += 1
    editedAt.current = Math.max(Date.now(), editedAt.current + 1, studyRef.current.updatedAt + 1)
    setRevision(revisionRef.current)
    setSaveState('dirty')
  }

  function persist(): Promise<CetPaperStudy> {
    const target = revisionRef.current
    const patch = structuredClone(draftRef.current)
    const editTime = editedAt.current
    const work = queue.current.catch(() => studyRef.current).then(async () => {
      if (target <= savedRevision.current) return studyRef.current
      if (mounted.current) setSaveState('saving')
      const saved = await saveCetPaperStudy(initial.id, patch, Math.max(editTime, studyRef.current.updatedAt + 1))
      const matches = Object.entries(patch).every(([key, value]) => JSON.stringify(saved[key as keyof Draft]) === JSON.stringify(value))
      if (!matches) {
        studyRef.current = saved
        throw new Error('档案在另一处有更新，当前输入仍保留，请重新保存。')
      }
      studyRef.current = saved
      savedRevision.current = target
      if (mounted.current) {
        setStudy(saved)
        setSaveState(target === revisionRef.current ? 'saved' : 'dirty')
        setError('')
      }
      return saved
    })
    queue.current = work
    return work.catch((cause: unknown) => {
      if (mounted.current) {
        setSaveState('error')
        setError(cause instanceof Error ? cause.message : '保存失败，当前输入仍在，请重试保存。')
      }
      throw cause
    })
  }

  function applyPendingKey(): boolean {
    if (!keyTextRef.current.trim()) return true
    const parsed = parseCetAnswerKey(keyTextRef.current)
    setKeyErrors(parsed.errors)
    if (parsed.errors.length) { setTab('answers'); return false }
    update({ answerKey: parsed.answers })
    keyTextRef.current = ''
    setKeyText('')
    return true
  }

  async function action(run: () => Promise<void>) {
    if (actionLock.current) return
    if (!applyPendingKey()) return
    actionLock.current = true
    setBusy(true); setError('')
    try { await persist(); await run() }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '操作失败，输入仍保留，请重试。') }
    finally { actionLock.current = false; if (mounted.current) setBusy(false) }
  }

  closeRef.current = () => { void action(async () => { onClose() }) }

  useEffect(() => {
    mounted.current = true
    const element = dialog.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    element.showModal()
    element.querySelector<HTMLHeadingElement>('#cet-paper-title')?.focus()
    document.body.style.overflow = 'hidden'
    const protect = (event: BeforeUnloadEvent) => {
      if (revisionRef.current > savedRevision.current || keyTextRef.current.trim()) event.preventDefault()
    }
    window.addEventListener('beforeunload', protect)
    return () => {
      mounted.current = false
      element.close()
      document.body.style.overflow = previousOverflow
      window.removeEventListener('beforeunload', protect)
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    if (revision === 0) return
    const timer = window.setTimeout(() => { void persist().catch(() => undefined) }, 650)
    return () => window.clearTimeout(timer)
  }, [revision])

  useEffect(() => { body.current?.scrollTo({ top: 0 }) }, [tab])

  useEffect(() => {
    let cancelled = false
    const allocated: string[] = []
    setUrls({}); setMissingFiles([])
    void Promise.all(FILES.map(async ({ kind, label }) => {
      const file = study.files[kind]
      if (!file) return
      try {
        const media = await db.media.get(file.id)
        if (!media?.blob) throw new Error('missing')
        const url = URL.createObjectURL(media.blob)
        if (cancelled) { URL.revokeObjectURL(url); return }
        allocated.push(url)
        setUrls((previous) => ({ ...previous, [kind]: url }))
      } catch { if (!cancelled) setMissingFiles((previous) => [...previous, label]) }
    }))
    return () => { cancelled = true; allocated.forEach((url) => URL.revokeObjectURL(url)) }
  }, [study.files.paper?.id, study.files.answers?.id, study.files.audio?.id])

  async function upload(kind: CetPaperFileKind, file: File) {
    await action(async () => {
      const saved = await attachCetPaperFile(initial.id, kind, file)
      studyRef.current = saved; setStudy(saved)
      if (kind !== 'audio') setDocumentKind(kind)
    })
  }

  async function submit() {
    await action(async () => {
      const saved = await submitCetPaperStudy(initial.id)
      studyRef.current = saved; setStudy(saved)
      setTab('review')
    })
  }

  const selected = draft.answers.filter(Boolean).length
  const keyCount = draft.answerKey.filter(Boolean).length
  const compared = draft.answers.filter((answer, index) => answer && draft.answerKey[index]).length
  const documentUrl = urls[documentKind]
  return <dialog ref={dialog} className="cet-paper-dialog pixel-frame" aria-labelledby="cet-paper-title" onCancel={(event) => { event.preventDefault(); closeRef.current() }}>
    <div className="cet-paper-shell">
      <header className="cet-paper-header">
        <div className="min-w-0">
          <h2 id="cet-paper-title" tabIndex={-1} className="text-px24 text-bright">{source.year} 年 {source.month} 月{source.level === 'cet4' ? '四级' : '六级'}真题</h2>
          <p className="readable mt-2 text-dim">{source.provider}</p>
        </div>
        <PixelButton size="sm" variant="ghost" aria-label="保存并退出真题练习" disabled={busy} onClick={() => closeRef.current()}><Icon name="cross" size={16} /></PixelButton>
      </header>
      <div className="cet-paper-tabs" role="tablist" aria-label="真题练习步骤">
        {TABS.map((item) => <button key={item.id} id={`paper-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`paper-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => {
          const index = TABS.findIndex((entry) => entry.id === tab)
          const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
          if (next >= 0) { event.preventDefault(); setTab(TABS[next].id); document.getElementById(`paper-tab-${TABS[next].id}`)?.focus() }
        }}>{item.name}</button>)}
      </div>
      <div ref={body} className="cet-paper-body readable" id={`paper-panel-${tab}`} role="tabpanel" aria-labelledby={`paper-tab-${tab}`} tabIndex={0}>
        <label className="cet-paper-field text-dim">卷别备注<input className="pixel-input" value={draft.variant} maxLength={200} disabled={busy} onChange={(event) => update({ variant: event.target.value })} /></label>
        {urls.audio && <section className="cet-paper-audio" aria-label="本机听力录音"><h3 className="text-bright">{study.files.audio?.name}</h3><audio controls preload="metadata" src={urls.audio}>当前浏览器无法播放，请在新页打开录音。</audio><a href={urls.audio} target="_blank" rel="noreferrer">在新页打开本机录音</a></section>}
        {tab === 'files' && <>
          <h3 className="cet-paper-section-title text-bright">先核对原卷，再开始作答</h3>
          <p className="text-dim">打开高校资料中的原卷和录音，核对年月、级别及套号。也可导入本机文件，在这里看题、听录音并记录答案。</p>
          <nav className="cet-paper-source-links" aria-label="本套真题原站资料">
            <a href={source.sourceUrl} target="_blank" rel="noreferrer">高校资料页</a>
            {source.paperUrl && <a href={source.paperUrl} target="_blank" rel="noreferrer">打开原卷 PDF</a>}
            {source.answersUrl && <a href={source.answersUrl} target="_blank" rel="noreferrer">查看答案解析</a>}
            {source.audioUrl && <a href={source.audioUrl} target="_blank" rel="noreferrer">打开听力录音</a>}
          </nav>
          <details className="adventure-reference text-dim"><summary>资料版本与套号提醒</summary><p>{source.note}</p><p>题目与答案请逐项核对，不同整理者的同名套号可能不同。来源核对：{source.checkedAt}。</p></details>
          <div className="cet-paper-uploads">
            {FILES.map(({ kind, label, accept }) => <label key={kind} className="cet-paper-upload text-dim">
              <span className="text-bright">导入{label}</span>
              <input type="file" accept={accept} disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(kind, file) }} />
              <span>{study.files[kind]?.name ?? (kind === 'audio' ? '音频不超过 60 MB' : 'PDF 不超过 30 MB')}</span>
            </label>)}
          </div>
          {missingFiles.length > 0 && <p className="text-fail" role="alert">{missingFiles.join('、')}的本机文件未读到，请重新导入原文件。答题记录仍保留。</p>}
          {(study.files.paper || study.files.answers) && <section className="cet-paper-document" aria-label="本机 PDF 文档">
            <div className="cet-paper-document-tools">
              <label>预览文档<select className="pixel-input" value={documentKind} onChange={(event) => setDocumentKind(event.target.value as 'paper' | 'answers')}><option value="paper">原卷 PDF</option><option value="answers">答案 PDF</option></select></label>
              {documentUrl && <a href={documentUrl} target="_blank" rel="noreferrer">在新页打开本机 PDF</a>}
            </div>
            {documentUrl ? <><p className="text-dim">若下方预览空白，可用新页打开原文件。</p><iframe title={`本机${documentKind === 'paper' ? '原卷' : '答案'} PDF 预览`} src={documentUrl} /></> : <p className="text-dim">尚未导入所选文档，或正在读取本机文件。</p>}
          </section>}
          <p className="cet-paper-help text-dim">导入后文件只存于当前浏览器，可离线使用。尚未导入的原站资料需要联网；应用不会自动识别 PDF 题目或答案。</p>
          <PixelButton variant="primary" onClick={() => setTab('answers')}>原卷已准备好，去答题</PixelButton>
        </>}
        {tab === 'answers' && <>
          <div className="cet-paper-answer-progress"><h3 className="text-bright">我的答题卡</h3><p className="text-dim">已选 {selected}/55 题 · 参考答案覆盖 {keyCount}/55 题</p></div>
          <p className="text-dim">按原卷题号填选。可以先留空，作答会自动保存；导入的录音可在各页签继续播放。</p>
          <div className="cet-paper-answer-groups">{GROUPS.map((group) => <fieldset key={group.name} disabled={busy}>
            <legend className="text-bright">{group.name} · {group.start + 1}–{group.end}</legend>
            <div className="cet-paper-answer-grid">{Array.from({ length: group.end - group.start }, (_, offset) => {
              const index = group.start + offset
              return <label key={index}><span>{index + 1}</span><select className="pixel-input" aria-label={`第 ${index + 1} 题答案`} value={draft.answers[index]} onChange={(event) => update({ answers: draftRef.current.answers.map((value, i) => i === index ? event.target.value : value) })}>
                <option value="">未答</option>{Array.from({ length: group.letters }, (_, i) => String.fromCharCode(65 + i)).map((letter) => <option key={letter} value={letter}>{letter}</option>)}
              </select></label>
            })}</div>
          </fieldset>)}</div>
          <section className="cet-paper-key" aria-labelledby="paper-key-title">
            <h3 id="paper-key-title" className="text-bright">录入参考答案</h3>
            <p id="paper-key-hint" className="text-dim">请先完成自己的作答，再核对资料中的答案。按题号输入如「1.A 2:B 26 O」，也可从第 1 题开始连续输入字母。应用时替换现有参考答案，未提供的题号留空。</p>
            <label className="cet-paper-field">参考答案文本<textarea className="pixel-input" rows={4} value={keyText} aria-describedby="paper-key-hint" disabled={busy} placeholder="例如：1.A 2.B 3.C 26.O" onChange={(event) => { keyTextRef.current = event.target.value; setKeyText(event.target.value); setKeyErrors([]) }} /></label>
            {keyErrors.length > 0 && <div className="text-fail" role="alert"><p>参考答案尚未应用，请修改格式或清空文本后再返回。</p><ul>{keyErrors.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}
            <div className="cet-paper-inline-actions"><PixelButton disabled={busy || !keyText.trim()} onClick={() => applyPendingKey()}>应用参考答案</PixelButton><PixelButton disabled={busy || !keyText} variant="ghost" onClick={() => { keyTextRef.current = ''; setKeyText(''); setKeyErrors([]) }}>清空待应用文本</PixelButton></div>
            <p className="text-dim">当前可核对 {compared} 题。按你录入的参考答案比较，未录入的题不会记作已核对，也不换算考试分数。</p>
            <PixelButton variant="primary" disabled={busy || (compared === 0 && !keyText.trim())} onClick={() => void submit()}>{study.firstSubmission ? '保存本轮订正并核对' : '保存首次核对'}</PixelButton>
          </section>
        </>}
        {tab === 'writing' && <>
          <h3 className="cet-paper-section-title text-bright">把原卷上的任务，写成自己的表达</h3>
          <p className="text-dim">先在原卷核对题目要求与字数。完成后对照原站参考解析，检查内容、结构和表达，再回到草稿修订。</p>
          <label className="cet-paper-field cet-paper-output">写作草稿<textarea className="pixel-input" lang="en" rows={10} value={draft.writingDraft} disabled={busy} placeholder="按这套原卷的写作要求开始…" onChange={(event) => update({ writingDraft: event.target.value })} /><span className="text-dim">{draft.writingDraft.trim() ? draft.writingDraft.trim().split(/\s+/).length : 0} 个空白分隔词 · 仅供写作长度参考</span></label>
          <label className="cet-paper-field cet-paper-output">翻译草稿<textarea className="pixel-input" lang="en" rows={8} value={draft.translationDraft} disabled={busy} placeholder="读原卷中的中文段落，再写出自己的译文…" onChange={(event) => update({ translationDraft: event.target.value })} /></label>
          <p className="text-dim">草稿自动保存在本机。这里不自动评分，可在复盘中记下修改原因与想复用的表达。</p>
        </>}
        {tab === 'review' && <>
          <h3 className="cet-paper-section-title text-bright">把错题变成下次能用的线索</h3>
          <p className="text-dim">首次与最近核对分别保留当时的作答和参考答案。首次记录反映第一次核对，最近记录帮助查看订正；部分答案不代表整卷成绩。</p>
          {study.firstSubmission ? <div className="cet-paper-results"><Submission label="首次核对" submission={study.firstSubmission} /><Submission label="最近核对" submission={study.latestSubmission} /></div> : <p className="cet-paper-empty text-dim">还没有核对记录。可以先保存草稿，待录入参考答案后再核对。</p>}
          {study.latestSubmission && <ReviewQuestions submission={study.latestSubmission} />}
          <label className="cet-paper-field cet-paper-output">复盘笔记<textarea className="pixel-input" rows={7} value={draft.notes} disabled={busy} placeholder="哪一句是证据？为什么选错？写译修改了什么？下次准备怎样做？" onChange={(event) => update({ notes: event.target.value })} /></label>
          <div className="cet-paper-inline-actions"><PixelButton onClick={() => setTab('answers')}>回答题卡继续订正</PixelButton><PixelButton onClick={() => setTab('files')}>回看原卷与录音</PixelButton></div>
        </>}
      </div>
      <footer className="cet-paper-footer">
        <div className="readable cet-paper-save-status"><p role="status" aria-live="polite" className={saveState === 'error' ? 'text-fail' : 'text-dim'}>{saveState === 'saved' ? '已保存到本机' : saveState === 'saving' ? '正在保存…' : saveState === 'error' ? '保存未完成，请重试' : '有新编辑，稍后自动保存'}{keyText.trim() ? ' · 参考答案文本尚未应用' : ''}</p>{error && <p className="text-fail" role="alert">{error}</p>}</div>
        <PixelButton disabled={busy} onClick={() => void action(async () => undefined)}>保存</PixelButton>
        <PixelButton variant="primary" disabled={busy} onClick={() => closeRef.current()}>{busy ? '正在处理…' : '保存并返回'}</PixelButton>
      </footer>
    </div>
  </dialog>
}

function Submission({ label, submission }: { label: string; submission?: CetPaperSubmission }) {
  const result = cetPaperResult(submission)
  const coverage = submission?.answerKey.filter(Boolean).length ?? 0
  return <section><h4 className="text-bright">{label}</h4><p><strong className="text-gold">{result.correct}/{result.compared}</strong> 题正确</p><p className="text-dim">仅比较已选且有参考答案的题 · 参考答案覆盖 {coverage}/55 题 · 未答 {result.unanswered} 题</p></section>
}

function ReviewQuestions({ submission }: { submission: CetPaperSubmission }) {
  const result = cetPaperResult(submission)
  const withoutKey = submission.answers.flatMap((answer, index) => answer && !submission.answerKey[index] ? [index + 1] : [])
  return <section className="cet-paper-question-review">
    <h4 className="text-bright">最近一轮的核对线索</h4>
    <p className="text-dim">{result.wrong.length ? `待订正题号：${result.wrong.join('、')}` : '当前参与比较的题均一致；可继续补齐未答题和参考答案。'}</p>
    {withoutKey.length > 0 && <p className="text-dim">已答但缺少参考答案：{withoutKey.join('、')}。这些题尚未核对。</p>}
    <details className="adventure-reference"><summary>查看本轮逐题记录</summary><div className="cet-paper-review-table"><table><thead><tr><th>题号</th><th>我的选择</th><th>参考答案</th><th>核对情况</th></tr></thead><tbody>{submission.answers.map((answer, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{answer || '未答'}</td><td>{submission.answerKey[index] || '未录入'}</td><td>{!answer || !submission.answerKey[index] ? '尚未比较' : answer === submission.answerKey[index] ? '一致' : '待订正'}</td></tr>)}</tbody></table></div></details>
  </section>
}
