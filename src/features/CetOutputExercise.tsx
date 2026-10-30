import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { completeCetOutput, countCetEnglishWords, saveCetDraft } from '../core/cetPractice'
import type { CetOutput } from '../data/cetPractice'
import type { CetPracticeRecord } from '../types/model'
import { Icon } from '../ui/icons'
import { PixelButton } from '../ui/Pixel'

type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'failed'
type Operation = 'idle' | 'saving' | 'completing' | 'closing'
type DraftSnapshot = { text: string; editedAt: number; revision: number }

export function CetOutputExercise({ task, initial, onClose, closeRequest }: {
  task: CetOutput
  initial?: CetPracticeRecord
  onClose: () => void
  closeRequest: MutableRefObject<() => void>
}) {
  const [draft, setDraft] = useState(() => initial?.draft ?? '')
  const [record, setRecord] = useState(initial)
  const [referenceVisible, setReferenceVisible] = useState(() => initial?.submittedAt !== undefined)
  const [checks, setChecks] = useState<boolean[]>(() => initial?.submittedText === initial?.draft && initial?.checks
    ? [...initial.checks] : [false, false, false])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initial ? 'saved' : 'unsaved')
  const [operation, setOperation] = useState<Operation>('idle')
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const referenceHeading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const timer = useRef<number | undefined>(undefined)
  const operationRef = useRef<Operation>('idle')
  const dirty = useRef(false)
  const savedRecord = useRef(initial)
  const clock = useRef(initial?.updatedAt ?? Date.now())
  const current = useRef<DraftSnapshot>({ text: initial?.draft ?? '', editedAt: clock.current, revision: 0 })
  const currentChecks = useRef(checks)
  const wordCount = countCetEnglishWords(draft)
  const minimumWords = task.kind === 'writing' ? 20 : 10
  const allChecked = checks.length === 3 && checks.every(Boolean)
  const busy = operation !== 'idle'
  const inputLocked = operation === 'closing' || operation === 'completing'
  const currentComplete = record?.submittedText === draft && record?.submittedAt !== undefined && allChecked
  const canComplete = referenceVisible && allChecked && wordCount >= minimumWords && !currentComplete
  const statusText = saveStatus === 'saving' ? '正在保存到本机…'
    : saveStatus === 'failed' ? '保存失败，输入已保留'
      : saveStatus === 'saved' ? '已存本机' : '草稿未保存'

  const clearAutosave = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  useEffect(() => {
    mounted.current = true
    const focus = window.requestAnimationFrame(() => heading.current?.focus())
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!dirty.current && operationRef.current === 'idle') return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => {
      mounted.current = false
      window.cancelAnimationFrame(focus)
      clearAutosave()
      window.removeEventListener('beforeunload', protectDraft)
    }
  }, [clearAutosave])

  /** A save acknowledges only its own revision; typing may continue during autosave. */
  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!dirty.current && savedRecord.current) {
      if (mounted.current) { setSaveStatus('saved'); setError('') }
      return true
    }
    const snapshot = { ...current.current }
    if (mounted.current) { setSaveStatus('saving'); setError('') }
    try {
      const result = await saveCetDraft(task.id, snapshot.text, snapshot.editedAt)
      clock.current = Math.max(clock.current, result.updatedAt)
      savedRecord.current = result
      if (mounted.current) setRecord(result)
      if (result.draft !== snapshot.text) {
        // A later local write won the timestamp comparison. Keep this editor's text for an explicit retry.
        current.current.editedAt = Math.max(Date.now(), current.current.editedAt + 1, result.updatedAt + 1)
        clock.current = current.current.editedAt
        throw new Error('本机已有较新的草稿。当前输入仍在这里，请点“重试保存”保存当前稿件。')
      }
      if (current.current.revision === snapshot.revision) dirty.current = false
      if (mounted.current) setSaveStatus(dirty.current ? 'unsaved' : 'saved')
      return true
    } catch (cause) {
      if (mounted.current) {
        setSaveStatus('failed')
        setError(cause instanceof Error && cause.message.startsWith('本机已有')
          ? cause.message : '草稿暂时没有保存成功。输入内容已保留，请重试保存。')
      }
      return false
    }
  }, [task.id])

  const saveNow = useCallback(async () => {
    if (operationRef.current !== 'idle') return
    clearAutosave()
    operationRef.current = 'saving'
    setOperation('saving')
    try { await persistDraft() }
    finally {
      operationRef.current = 'idle'
      if (mounted.current) setOperation('idle')
    }
  }, [clearAutosave, persistDraft])

  const saveAndClose = useCallback(async () => {
    if (operationRef.current !== 'idle') return
    clearAutosave()
    operationRef.current = 'closing'
    setOperation('closing')
    try {
      if ((!dirty.current || await persistDraft()) && !dirty.current && mounted.current) onClose()
    } finally {
      operationRef.current = 'idle'
      if (mounted.current) setOperation('idle')
    }
  }, [clearAutosave, onClose, persistDraft])

  useEffect(() => {
    const request = () => { void saveAndClose() }
    closeRequest.current = request
    return () => { if (closeRequest.current === request) closeRequest.current = () => {} }
  }, [closeRequest, saveAndClose])

  useEffect(() => {
    if (!dirty.current || operation !== 'idle' || saveStatus === 'failed') return
    const pending = window.setTimeout(() => { timer.current = undefined; void saveNow() }, 650)
    timer.current = pending
    return () => {
      window.clearTimeout(pending)
      if (timer.current === pending) timer.current = undefined
    }
  }, [draft, operation, saveStatus, saveNow])

  function editDraft(text: string) {
    if (operationRef.current === 'closing' || operationRef.current === 'completing' || text === current.current.text) return
    const editedAt = Math.max(Date.now(), clock.current + 1, current.current.editedAt + 1)
    clock.current = editedAt
    current.current = { text, editedAt, revision: current.current.revision + 1 }
    dirty.current = true
    currentChecks.current = [false, false, false]
    setChecks(currentChecks.current)
    setDraft(text)
    setError('')
    if (operationRef.current === 'idle') setSaveStatus('unsaved')
  }

  function revealReference() {
    if (operationRef.current !== 'idle' || countCetEnglishWords(current.current.text) === 0) return
    setReferenceVisible(true)
    window.requestAnimationFrame(() => referenceHeading.current?.focus())
  }

  async function complete() {
    if (operationRef.current !== 'idle' || !referenceVisible || currentChecks.current.length !== 3 || !currentChecks.current.every(Boolean) ||
      countCetEnglishWords(current.current.text) < minimumWords || currentComplete) return
    clearAutosave()
    operationRef.current = 'completing'
    setOperation('completing')
    setSaveStatus('saving')
    setError('')
    try {
      const result = await completeCetOutput(task.id, current.current.text, [...currentChecks.current])
      clock.current = Math.max(clock.current, result.updatedAt)
      savedRecord.current = result
      dirty.current = false
      if (mounted.current) { setRecord(result); setSaveStatus('saved') }
    } catch {
      if (mounted.current) {
        setSaveStatus('failed')
        setError('本次自查暂时没有保存成功。稿件与勾选已保留，请重试完成自查。')
      }
    } finally {
      operationRef.current = 'idle'
      if (mounted.current) setOperation('idle')
    }
  }

  return <>
    <div className="adventure-dialog-body p-4 md:p-6">
      <h2 id="cet-task-title" ref={heading} tabIndex={-1} className="text-px24 text-bright">{task.title}</h2>
      <p className="readable mt-2 text-dim">{task.focus}</p>
      <p className="readable mt-2 text-px12 text-dim">先写自己的初稿，再对照参考修订。草稿和自查只存本机，不改变账户积分。</p>

      <section className="cet-prompt readable mt-5" aria-labelledby="cet-output-prompt-title">
        <h3 id="cet-output-prompt-title" className="mb-3 font-semibold text-bright">{task.kind === 'writing' ? '写作任务' : '翻译任务'}</h3>
        <p lang={task.kind === 'writing' ? 'en' : 'zh-CN'} className="whitespace-pre-wrap text-[17px] leading-relaxed text-bright">{task.prompt}</p>
        {task.sourceText && <div className="mt-4 border-t border-edge pt-4"><h4 className="mb-2 font-semibold text-bright">中文原文</h4><p lang="zh-CN" className="text-[17px] leading-relaxed text-bright">{task.sourceText}</p></div>}
        <details className="mt-4">
          <summary className="cursor-pointer text-dim">需要一点思路？展开行文提示</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-dim">{task.outline.map((line, index) => <li key={index}>{line}</li>)}</ol>
        </details>
      </section>

      <section className="mt-6" aria-labelledby="cet-draft-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label id="cet-draft-title" htmlFor="cet-output-draft" className="readable font-semibold text-bright">我的英文{task.kind === 'writing' ? '初稿' : '译文'}</label>
          <output htmlFor="cet-output-draft" className="readable text-dim tnum" aria-label={`当前英文词数：${wordCount}`}>{wordCount} 个英文词</output>
        </div>
        <textarea id="cet-output-draft" className="cet-draft pixel-input readable w-full text-[17px] leading-relaxed" value={draft}
          onChange={(event) => editDraft(event.target.value)} disabled={inputLocked} rows={12} lang="en" spellCheck
          aria-describedby="cet-word-guidance cet-draft-help" placeholder={task.kind === 'writing' ? 'Start with your own idea, then add a reason or example.' : 'Write your own English translation here.'} />
        <p id="cet-word-guidance" className="readable mt-2 text-px12 text-dim">{task.kind === 'translation'
          ? `本题英文参考长度为 ${task.wordRange[0]}–${task.wordRange[1]} 词，仅供安排篇幅，不是官方词数要求或合格线。`
          : wordCount > task.wordRange[1]
            ? `题目目标 ${task.wordRange[0]}–${task.wordRange[1]} 词。当前超过范围，建议精简重复内容；仍可完成本次自查。`
            : wordCount < task.wordRange[0]
              ? `题目目标 ${task.wordRange[0]}–${task.wordRange[1]} 词。可以继续补充论点、理由或例子，再检查篇幅。`
              : `当前在题目目标 ${task.wordRange[0]}–${task.wordRange[1]} 词范围内，请继续检查内容与语言。`}</p>
        <p id="cet-draft-help" className="readable mt-2 text-px12 text-dim">停笔约半秒后自动保存，也可随时点“保存草稿”。修改文字后，请重新完成三项自查。</p>
      </section>

      {record?.submittedText !== undefined && <details className="cet-reference readable mt-5">
        <summary className="cursor-pointer font-semibold text-bright">展开上次完成稿，对照这次修改</summary>
        <p className="mt-2 text-px12 text-dim">{new Date(record.submittedAt!).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 保存 · {countCetEnglishWords(record.submittedText)} 个英文词 · 自查完成记录</p>
        <p lang="en" className="mt-3 whitespace-pre-wrap text-[17px] leading-relaxed text-bright">{record.submittedText}</p>
      </details>}

      {referenceVisible ? <>
        <section className="cet-reference readable mt-6" aria-labelledby="cet-reference-title">
          <h3 id="cet-reference-title" ref={referenceHeading} tabIndex={-1} className="font-semibold text-bright">对照一种参考写法</h3>
          <p className="mt-2 text-px12 text-dim">参考可以帮助你学习与修订，译法或论证路径不唯一。这里不提供自动评分。</p>
          <p lang="en" className="mt-4 whitespace-pre-wrap text-[17px] leading-relaxed text-bright">{task.reference}</p>
          <h4 className="mt-5 font-semibold text-bright">修订时留意</h4>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-dim">{task.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </section>
        <fieldset className="cet-checklist readable mt-6" disabled={inputLocked} aria-describedby="cet-checklist-help">
          <legend className="font-semibold text-bright">逐项检查当前稿件</legend>
          <p id="cet-checklist-help" className="mt-2 text-px12 text-dim">勾选代表你已核对这一项，是自评记录，不是考试分数。</p>
          <div className="mt-3 space-y-3">{task.checklist.map((item, index) => <label key={index} className="flex cursor-pointer items-start gap-3 text-bright">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--wq-pass)]" checked={checks[index]} onChange={(event) => {
              const next = [...currentChecks.current]
              next[index] = event.target.checked
              currentChecks.current = next
              setChecks(next)
            }} />
            <span>{item}</span>
          </label>)}</div>
          {!currentComplete && <p className="mt-3 text-px12 text-dim">{wordCount < minimumWords
            ? `请先写下至少 ${minimumWords} 个英文词，再勾选三项完成自查。这只是本次练习的保存门槛。`
            : `已勾选 ${checks.filter(Boolean).length}/3 项；完成三项后，可保存这次自查。`}</p>}
        </fieldset>
      </> : <p className="readable mt-5 text-px12 text-dim">先写下自己的英文，再点“完成初稿，看参考”。可以从一段开始，参考打开后仍可继续修改。</p>}

      {currentComplete && <p className="readable mt-5 text-pass" role="status"><Icon name="check" size={16} className="mr-2 inline" />当前稿件与三项自查已存本机。你可以继续修订，修改后再做一次自查。</p>}
      {error && <p className="readable mt-4 text-fail" role="alert">{error}</p>}
    </div>
    <footer className="cet-actions border-t-2 border-edge bg-panel p-4">
      <p className={`readable mb-3 flex items-center gap-2 text-px12 ${saveStatus === 'failed' ? 'text-fail' : saveStatus === 'saved' ? 'text-pass' : 'text-dim'}`} role="status" aria-live="polite">
        <Icon name={saveStatus === 'saved' ? 'check' : saveStatus === 'failed' ? 'warning' : 'clock'} size={16} />{statusText}
      </p>
      <div className="flex flex-wrap gap-3">
        <PixelButton size="sm" disabled={busy || (saveStatus === 'saved' && !dirty.current)} onClick={() => void saveNow()}>{saveStatus === 'failed' ? '重试保存草稿' : '保存草稿'}</PixelButton>
        <PixelButton size="sm" variant="ghost" disabled={busy} onClick={() => void saveAndClose()}>{operation === 'closing' ? '正在保存并返回…' : '保存并返回'}</PixelButton>
        {referenceVisible
          ? <PixelButton variant="primary" icon="check" disabled={busy || !canComplete} aria-busy={operation === 'completing'} onClick={() => void complete()}>{operation === 'completing' ? '正在保存自查…' : currentComplete ? '当前稿已完成自查' : '完成自查，保存本次练习'}</PixelButton>
          : <PixelButton variant="primary" icon="book" disabled={busy || wordCount === 0} onClick={revealReference}>完成初稿，看参考</PixelButton>}
      </div>
    </footer>
  </>
}
