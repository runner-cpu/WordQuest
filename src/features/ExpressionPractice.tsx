import { useEffect, useRef, useState } from 'react'
import { ADVENTURE_EXPRESSIONS, type AdventureExpression } from '../data/adventureExpressions'
import { ADVENTURE_SCENES } from '../data/adventures'
import { finishExpressionAttempt, normalizeExpressionAnswer } from '../core/expression'
import { checkAchievements } from '../core/progress'
import { ensureProfile } from '../core/profile'
import { useUi } from '../state/ui'
import { Icon } from '../ui/icons'
import { Mascot, PixelBar, PixelButton } from '../ui/Pixel'

type SavedAttempt = Awaited<ReturnType<typeof finishExpressionAttempt>>
type SessionEntry = { exercise: AdventureExpression; result: SavedAttempt }

export function expressionDate(time: number) {
  return new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/** A short, protected-focus writing session; each submitted phrase is saved before advancing. */
export function ExpressionPractice({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [exercises] = useState(() => ids.map((id) => ADVENTURE_EXPRESSIONS.find((item) => item.id === id)).filter((item): item is AdventureExpression => Boolean(item)))
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState(false)
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [exitPrompt, setExitPrompt] = useState(false)
  const [unlocked, setUnlocked] = useState<string[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const saving = useRef(false)
  const activeTime = useRef({ accumulated: 0, since: document.hidden ? 0 : performance.now() })
  const setProfile = useUi((state) => state.setProfile)
  const exercise = exercises[index]
  const saved = entries[index]?.result
  const complete = index >= exercises.length
  const scene = ADVENTURE_SCENES.find((item) => item.id === exercise?.sceneId)
  const filledAnswer = exercise && saved?.correct
    ? exercise.acceptedAnswers.find((accepted) => normalizeExpressionAnswer(accepted) === normalizeExpressionAnswer(answer)) ?? exercise.referenceAnswer
    : exercise?.referenceAnswer
  const independentCount = entries.filter((entry) => entry.result.independent).length
  const xp = entries.reduce((sum, entry) => sum + entry.result.xp, 0)
  const coins = entries.reduce((sum, entry) => sum + entry.result.coins, 0)

  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    const track = () => {
      const now = performance.now()
      const clock = activeTime.current
      if (clock.since) clock.accumulated += now - clock.since
      clock.since = document.hidden ? 0 : now
    }
    document.addEventListener('visibilitychange', track)
    return () => {
      document.removeEventListener('visibilitychange', track)
      element.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
    if (saved || complete || exitPrompt) heading.current?.focus()
    else input.current?.focus()
  }, [index, saved, complete, exitPrompt])

  function requestClose() {
    if (saving.current) return
    if (!complete && !saved && answer.trim()) setExitPrompt(true)
    else onClose()
  }

  async function submit(reveal = false) {
    if (saving.current || saved || !exercise || (!reveal && !answer.trim())) return
    saving.current = true
    setBusy(true)
    setError('')
    // Revealing a reference remains assisted if a failed save is retried.
    if (reveal) setHint(true)
    try {
      const clock = activeTime.current
      const elapsed = clock.accumulated + (clock.since ? performance.now() - clock.since : 0)
      const result = await finishExpressionAttempt(exercise.id, reveal ? '' : answer, hint || reveal, elapsed)
      if (reveal) setAnswer('')
      setEntries((previous) => [...previous, { exercise, result }])
      try {
        const newly = await checkAchievements()
        setUnlocked((previous) => [...previous, ...newly.map((item) => item.name)])
      } catch { setError('这句已经保存，成就将在下次学习时重新检查。') }
      try { setProfile(await ensureProfile()) } catch { setError('这句已经保存，账户显示将在刷新后更新。') }
    } catch {
      setError('这句暂时没有保存成功。输入内容已保留，请重试。')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function next() {
    setAnswer('')
    setHint(false)
    setError('')
    activeTime.current = { accumulated: 0, since: document.hidden ? 0 : performance.now() }
    setIndex((value) => value + 1)
  }

  return <dialog ref={dialog} className="adventure-dialog expression-dialog pixel-frame" aria-labelledby="expression-title" onCancel={(event) => { event.preventDefault(); requestClose() }}>
    <div className="adventure-dialog-shell">
      <header className="flex items-center justify-between gap-3 border-b-2 border-edge p-4">
        <span className="text-px12 text-dim">表达工坊 · {complete ? '已装进口袋' : `第 ${index + 1}/${exercises.length} 句`}</span>
        <PixelButton size="sm" variant="ghost" aria-label="退出表达练习" onClick={requestClose} disabled={busy}><Icon name="cross" size={16} /></PixelButton>
      </header>
      <div ref={body} className="adventure-dialog-body p-4 md:p-6">
        {exitPrompt ? <div className="space-y-4 py-6">
          <h2 id="expression-title" ref={heading} tabIndex={-1} className="text-px24 text-bright">这句话还没写完</h2>
          <p className="readable text-dim">退出会舍弃当前输入。前面已提交的表达和奖励都已保存。</p>
          <div className="flex flex-wrap gap-3"><PixelButton variant="primary" onClick={() => setExitPrompt(false)}>继续写这句</PixelButton><PixelButton onClick={onClose}>保存已练进度并退出</PixelButton></div>
        </div> : complete ? <>
          <div className="adventure-result">
            <Mascot stage="幼年体" mood="happy" size={64} />
            <h2 id="expression-title" ref={heading} tabIndex={-1} className="text-px24 text-bright">把英语装进口袋</h2>
            <p className="readable text-bright">练过 {entries.length} 句，其中 {independentCount} 句这次独立想起。</p>
            <div className="flex gap-4 text-px12 text-gold"><span>+{xp} XP</span><span>+{coins} 金币</span></div>
            <p className="readable text-dim">今天到这里就很好。下一次回想的时间已经安排好。</p>
          </div>
          <ol className="expression-pocket readable" aria-label="本轮带走的表达">{entries.map(({ exercise: item, result }) => <li key={item.id}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-px12"><span className={result.independent ? 'text-pass' : 'text-dim'}>{result.independent ? '独立想起' : '借助参考学习'}</span><span className="text-dim">{expressionDate(result.progress.dueAt)} 再回想</span></div>
            <p lang="en">{item.before}<strong className="text-gold">{item.referenceAnswer}</strong>{item.after}</p>
          </li>)}</ol>
          {unlocked.length > 0 && <p className="readable mt-5 text-pass" role="status"><Icon name="medal" size={16} className="mr-2 inline" />新成就：{unlocked.join('、')}，奖励已存入账户。</p>}
        </> : <>
          <h2 id="expression-title" ref={heading} tabIndex={-1} className="text-px24 text-bright">换个情境，你会怎么说？</h2>
          <p className="readable mt-2 text-dim">来自「{scene?.title}」的表达 · {scene?.level}</p>
          <div className="my-5"><PixelBar value={index} max={exercises.length} label="本轮表达练习进度" color="var(--wq-pass)" /></div>
          <p id="expression-prompt" className="expression-prompt readable text-bright">{exercise.prompt}</p>
          <p id="expression-sentence" className="expression-sentence readable" lang="en">{exercise.before}<span className="expression-gap" aria-label="填写短语的位置">{saved ? filledAnswer : '…'}</span>{exercise.after}</p>
          {!saved ? <form id="expression-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <label htmlFor="expression-answer" className="readable mb-2 block text-bright">补上缺少的英文短语</label>
            <input ref={input} id="expression-answer" className="pixel-input expression-input readable" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={160} disabled={busy} autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" aria-describedby="expression-prompt expression-sentence expression-input-help" placeholder="想一想，再写下来" lang="en" />
            <p id="expression-input-help" className="readable mt-2 text-px12 text-dim">输入 1–5 个英文词即可，大小写和句末标点不影响结果。</p>
            <div className="mt-4 flex flex-wrap gap-3"><PixelButton size="sm" disabled={busy || hint} aria-expanded={hint} aria-controls="expression-hint" onClick={() => setHint(true)} icon="spark">{hint ? '提示已打开' : '给我一点提示'}</PixelButton></div>
            {hint && <div id="expression-hint" className="expression-hint readable mt-3"><p className="text-bright">{exercise.hint}</p><p className="mt-2 text-px12 text-dim">借助提示也在学习，下次再试着独立想起。</p></div>}
          </form> : <div className="expression-feedback readable" role="status">
            <h3 className={`font-semibold ${saved.independent ? 'text-pass' : 'text-bright'}`}>{saved.independent ? '这句话，你自己想起来了！' : saved.correct ? '借助线索，也向前一步' : '收下这个说法，下次再试'}</h3>
            {!saved.correct && answer.trim() && <p className="mt-2 text-dim">你的填写：<span lang="en">{answer}</span>。先看看本题的参考说法与解析。</p>}
            <p className="expression-reference mt-3 text-bright"><span className="text-px12 text-dim">参考说法：</span><span lang="en">{exercise.referenceAnswer}</span></p>
            <p className="mt-2 text-dim">{exercise.explanation}</p>
            {exercise.acceptedAnswers.length > 1 && <details className="adventure-reference mt-2"><summary className="text-px12 text-dim">本题也接受这些说法</summary><p lang="en">{exercise.acceptedAnswers.join(' / ')}</p></details>}
            <p className="mt-3 text-px12 text-pass">已保存 · {expressionDate(saved.progress.dueAt)} 再回想{saved.xp > 0 ? ` · +${saved.xp} XP · +${saved.coins} 金币` : ''}</p>
            {!saved.scheduled && <p className="mt-2 text-px12 text-dim">这是一次自由练习；下次回想时间保持原来的安排。</p>}
          </div>}
        </>}
        {error && <p className="readable mt-4 text-fail" role="alert">{error}</p>}
      </div>
      {!exitPrompt && <footer className="expression-actions border-t-2 border-edge bg-panel p-4">
        {complete ? <PixelButton variant="primary" icon="check" onClick={onClose}>带着收获，返回地图</PixelButton> : saved ? <PixelButton variant="primary" icon="arrow-right" onClick={next} disabled={busy}>{index + 1 === exercises.length ? '收下本轮表达' : '再练下一句'}</PixelButton> : <>
          <PixelButton className="expression-reveal" variant="ghost" disabled={busy} onClick={() => void submit(true)}>想不起，看看参考</PixelButton>
          <PixelButton type="submit" form="expression-form" variant="primary" icon="check" disabled={busy || !answer.trim()} aria-busy={busy}>{busy ? '正在保存…' : error ? '重试并保存' : '检查我的表达'}</PixelButton>
        </>}
      </footer>}
    </div>
  </dialog>
}
