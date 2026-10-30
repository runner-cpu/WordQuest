import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ADVENTURE_SCENES, type AdventureScene } from '../data/adventures'
import { db } from '../db/database'
import { finishAdventure, type AdventureResult } from '../core/adventure'
import { checkAchievements } from '../core/progress'
import { ensureProfile } from '../core/profile'
import { COIN_RULES } from '../core/game'
import { useUi } from '../state/ui'
import { Icon } from '../ui/icons'
import { Panel, PixelBar, PixelButton } from '../ui/Pixel'
import { ADVENTURE_EXPRESSIONS, getSceneExpressions } from '../data/adventureExpressions'
import { ExpressionPractice, expressionDate } from './ExpressionPractice'

const CHAPTERS = [...new Set(ADVENTURE_SCENES.map((scene) => scene.chapter))]
const SCENE_IDS = new Set(ADVENTURE_SCENES.map((scene) => scene.id))
const LEVEL_NAMES = { A2: '轻松起步', B1: '更进一步', B2: '表达挑战' }
const SKILLS = { meaning: '读懂词义', inference: '理解言外之意', expression: '选一句得体的回应' }
const STAR_PIXELS = [[7, 1, 2, 2], [6, 3, 4, 2], [1, 5, 14, 2], [3, 7, 10, 2], [5, 9, 6, 2], [4, 11, 3, 2], [9, 11, 3, 2], [3, 13, 2, 2], [11, 13, 2, 2]]

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <span className="inline-flex gap-1" role="img" aria-label={`${value} 颗星，满星 3 颗`}>
    {[1, 2, 3].map((star) => <svg key={star} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" className={star <= value ? 'text-gold' : 'text-dim'} aria-hidden>
      {STAR_PIXELS.map(([x, y, width, height], index) => <rect key={index} x={x} y={y} width={width} height={height} fill="currentColor" opacity={star <= value ? 1 : 0.3} />)}
    </svg>)}
  </span>
}

export function AdventureHub() {
  const progress = useLiveQuery(async () => (await db.adventures.toArray()).filter((row) => SCENE_IDS.has(row.sceneId)), [])
  const [expressionRefresh, setExpressionRefresh] = useState(0)
  const expressionSnapshot = useLiveQuery(async () => {
    try { return { rows: await db.expressions.toArray(), error: '' } }
    catch { return { rows: [], error: '表达记录暂时没能读取，请重试。' } }
  }, [expressionRefresh])
  const expressions = expressionSnapshot?.rows
  const expressionsReady = expressionSnapshot !== undefined && !expressionSnapshot.error
  const [chapter, setChapter] = useState(CHAPTERS[0])
  const [activeScene, setActiveScene] = useState<AdventureScene | null>(null)
  const [expressionIds, setExpressionIds] = useState<string[] | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [])
  const expressionMap = new Map(expressions?.map((row) => [row.id, row]))
  const knownExpressions = ADVENTURE_EXPRESSIONS.map((item) => expressionMap.get(item.id)).filter((item) => item !== undefined)
  const due = knownExpressions.filter((item) => item.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
  const recalled = knownExpressions.filter((item) => item.independentDays.length > 0).length
  const retained = knownExpressions.filter((item) => item.independentDays.length >= 2).length
  const nextDue = knownExpressions.filter((item) => item.dueAt > now).sort((a, b) => a.dueAt - b.dueAt)[0]
  const preferredScene = ADVENTURE_SCENES.find((scene) => progress?.some((row) => row.sceneId === scene.id && row.bestScore >= 2) && getSceneExpressions(scene.id).some((item) => !expressionMap.has(item.id)))
    ?? ADVENTURE_SCENES.find((scene) => getSceneExpressions(scene.id).some((item) => !expressionMap.has(item.id)))
    ?? ADVENTURE_SCENES[0]
  function practiceScene(sceneId: string) {
    setActiveScene(null)
    setExpressionIds(getSceneExpressions(sceneId).map((item) => item.id))
  }
  const collected = progress?.filter((row) => row.bestScore >= 2).length ?? 0
  const stars = progress?.reduce((sum, row) => sum + row.bestScore, 0) ?? 0
  const recommended = ADVENTURE_SCENES.find((scene) => (progress?.find((row) => row.sceneId === scene.id)?.bestScore ?? 0) < 3) ?? ADVENTURE_SCENES[0]
  const scenes = ADVENTURE_SCENES.filter((scene) => scene.chapter === chapter)

  return <>
    <Panel className="adventure-hub !p-4 md:!p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-px24 text-bright"><Icon name="sword" size={24} />英语情景冒险</h2>
          <p className="readable mt-2 text-px12 text-dim">换个方式学：走进一个故事，用英语解决一件小事。</p>
        </div>
        <div className="adventure-passport text-px12">
          <Icon name="medal" size={24} /><span>冒险护照<br /><b className="text-bright tnum">{collected}/9 枚印章</b><span className="ml-2 text-dim tnum">{stars}/27 星</span></span>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="选择冒险章节">
        {CHAPTERS.map((name, index) => <PixelButton key={name} size="sm" variant={chapter === name ? 'primary' : 'default'} aria-pressed={chapter === name} onClick={() => setChapter(name)}>{`0${index + 1}`} · {name}</PixelButton>)}
      </div>
      <ol className="adventure-route" aria-label={`${chapter}的三个情景`}>
        {scenes.map((scene, index) => {
          const best = progress?.find((row) => row.sceneId === scene.id)?.bestScore ?? 0
          return <li key={scene.id}>
            <button type="button" className={`adventure-stop ${best >= 2 ? 'adventure-stamped' : ''}`} disabled={progress === undefined} onClick={() => setActiveScene(scene)} aria-label={`${scene.title}，${scene.level}，${best} 星，进入情景`}>
              <span className="adventure-node" aria-hidden>{best >= 2 ? <Icon name="check" size={24} /> : `0${index + 1}`}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="mb-1 block text-px12 text-dim">{scene.level} · {LEVEL_NAMES[scene.level]}</span>
                <span className="block text-px12 text-bright">{scene.title}</span>
                <span className="readable mt-1 block text-px12 text-dim">{scene.goal}</span>
                <span className="mt-3 flex items-center justify-between gap-2"><Stars value={best} /><span className="text-px12 text-dim">{best >= 2 ? '已盖章' : '去探索'} <span aria-hidden>→</span></span></span>
              </span>
            </button>
            <div className="adventure-expression-link">
              <span className="text-px12 text-dim">表达 {getSceneExpressions(scene.id).filter((item) => (expressionMap.get(item.id)?.independentDays.length ?? 0) > 0).length}/2</span>
              <PixelButton size="sm" variant="ghost" disabled={!expressionsReady} aria-label={`练习${scene.title}的两个表达`} onClick={() => practiceScene(scene.id)}>去练两句 <Icon name="arrow-right" size={16} /></PixelButton>
            </div>
          </li>
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-edge pt-3">
        <p className="readable text-px12 text-dim">每场 3 道题 · 约 3 分钟 · 答对 2 题收集印章<br />所有情景自由探索，重玩可以补齐星星。</p>
        <PixelButton icon="arrow-right" disabled={progress === undefined} onClick={() => { setChapter(recommended.chapter); setActiveScene(recommended) }}>{stars === 27 ? '重访喜欢的故事' : `推荐：${recommended.title}`}</PixelButton>
      </div>
      <section className="expression-workshop mt-5" aria-labelledby="expression-workshop-title">
        <div className="expression-workshop-intro">
          <h3 id="expression-workshop-title" className="flex items-center gap-2 text-px24 text-bright"><Icon name="spark" size={24} />表达工坊</h3>
          {expressionSnapshot?.error && <div className="readable mt-3 text-fail" role="alert">{expressionSnapshot.error}<PixelButton className="ml-2" size="sm" onClick={() => setExpressionRefresh((value) => value + 1)}>重新读取</PixelButton></div>}
          <p className="readable mt-2 text-dim">故事读懂了，换个情境自己说一句。</p>
          <p className="readable mt-2 text-px12 text-dim">每站 2 句短语填空。想不起时有提示，练完会安排下次回想。</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-px12"><span className="text-pass">独立想起 {recalled}/18 句</span><span className="text-dim">跨日记住 {retained}/18 句</span></div>
          <div className="mt-2"><PixelBar value={recalled} max={18} label="独立想起的表达收集进度" color="var(--wq-pass)" /></div>
        </div>
        <div className="expression-workshop-next">
          <p className="text-px12 text-bright">{due.length > 0 ? `今天有 ${due.length} 句等你回想` : nextDue ? `下一次回想：${expressionDate(nextDue.dueAt)}` : '先从熟悉的故事练两句'}</p>
          <p className="readable mt-2 text-px12 text-dim">{due.length > 5 ? '每轮最多 5 句，慢慢练就好。' : due.length > 0 ? '试着不看提示，看看还记得多少。' : nextDue ? '也可以自由练习其他故事里的表达。' : `推荐「${preferredScene.title}」的常用表达。`}</p>
          <PixelButton className="mt-4" icon={due.length > 0 ? 'clock' : 'arrow-right'} variant="primary" disabled={!expressionsReady || progress === undefined} onClick={() => due.length > 0 ? setExpressionIds(due.slice(0, 5).map((item) => item.id)) : practiceScene(preferredScene.id)}>{due.length > 0 ? `回想这 ${Math.min(due.length, 5)} 句` : '开始两句表达'}</PixelButton>
          <p className="readable mt-3 text-px12 text-dim">首次与到期练习独立答对，每句 +3 XP、+1 金币。</p>
        </div>
      </section>
    </Panel>
    {activeScene && <AdventureSession key={activeScene.id} scene={activeScene} onClose={() => setActiveScene(null)} onNext={(scene) => { setChapter(scene.chapter); setActiveScene(scene) }} onPractice={() => practiceScene(activeScene.id)} />}
    {expressionIds && <ExpressionPractice key={expressionIds.join(',')} ids={expressionIds} onClose={() => { setExpressionIds(null); setNow(Date.now()) }} />}
  </>
}

function AdventureSession({ scene, onClose, onNext, onPractice }: { scene: AdventureScene; onClose: () => void; onNext: (scene: AdventureScene) => void; onPractice: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const saving = useRef(false)
  const activeTime = useRef({ accumulated: 0, since: document.hidden ? 0 : performance.now() })
  const [stage, setStage] = useState(-1)
  const [answers, setAnswers] = useState<number[]>([])
  const [showTranslation, setShowTranslation] = useState(false)
  const [exitPrompt, setExitPrompt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AdventureResult | null>(null)
  const [unlocked, setUnlocked] = useState<string[]>([])
  const setProfile = useUi((state) => state.setProfile)
  const question = scene.questions[stage]
  const picked = answers[stage]
  const checked = picked !== undefined
  const nextScene = ADVENTURE_SCENES[ADVENTURE_SCENES.findIndex((item) => item.id === scene.id) + 1]

  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    const track = () => {
      const now = performance.now()
      if (activeTime.current.since) activeTime.current.accumulated += now - activeTime.current.since
      activeTime.current.since = document.hidden ? 0 : now
    }
    document.addEventListener('visibilitychange', track)
    return () => { document.removeEventListener('visibilitychange', track); element.close(); document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => { heading.current?.focus(); body.current?.scrollTo({ top: 0 }) }, [stage, result, exitPrompt])

  function requestClose() {
    if (saving.current) return
    if (answers.length > 0 && !result) setExitPrompt(true)
    else onClose()
  }

  async function finish() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const clock = activeTime.current
      const elapsed = clock.accumulated + (clock.since ? performance.now() - clock.since : 0)
      const saved = await finishAdventure(scene.id, scene.questions.map((item, index) => ({ questionId: item.id, optionIndex: answers[index] })), elapsed)
      setResult(saved)
      // Completion is durable before optional achievement feedback is calculated.
      try {
        const newly = await checkAchievements()
        setUnlocked(newly.map((item) => item.name))
      } catch { setError('情景结果已保存，成就会在下次学习时重新检查。') }
      try { setProfile(await ensureProfile()) } catch { setError('情景结果已保存，账户显示将在刷新后更新。') }
    } catch { setError('暂时无法保存，请重试。你的本轮答案仍在这里。') }
    finally { saving.current = false; setBusy(false) }
  }

  function restart() {
    setStage(-1); setAnswers([]); setResult(null); setUnlocked([]); setError(''); setShowTranslation(false)
    activeTime.current = { accumulated: 0, since: document.hidden ? 0 : performance.now() }
  }

  const dialogue = <div className="adventure-dialogue readable">
    {scene.dialogue.map((line, index) => <div key={index} className="adventure-line">
      <span className="adventure-speaker">{line.speaker}</span>
      <div><p lang="en">{line.en}</p>{showTranslation && <p className="mt-1 text-dim" lang="zh-CN">{line.zh}</p>}</div>
    </div>)}
  </div>

  return <dialog ref={dialog} className="adventure-dialog pixel-frame" aria-labelledby="adventure-title" onCancel={(event) => { event.preventDefault(); requestClose() }}>
    <div className="adventure-dialog-shell">
      <header className="flex items-center justify-between gap-3 border-b-2 border-edge p-4">
        <span className="text-px12 text-dim">{scene.chapter} · {scene.level} · {result ? '本次冒险完成' : stage < 0 ? '读一段故事' : `挑战 ${stage + 1}/3`}</span>
        <PixelButton size="sm" variant="ghost" aria-label="退出情景" onClick={requestClose} disabled={busy}><Icon name="cross" size={16} /></PixelButton>
      </header>
      <div ref={body} className="adventure-dialog-body p-4 md:p-6">
        {exitPrompt ? <div className="space-y-4 py-8" role="alert">
          <h2 ref={heading} tabIndex={-1} id="adventure-title" className="text-px24 text-bright">先休息一下？</h2>
          <p className="readable text-dim">本轮尚未交卷，退出后需要从故事重新开始。之前收集的星星和印章会保留。</p>
          <div className="flex flex-wrap gap-3"><PixelButton variant="primary" onClick={() => setExitPrompt(false)}>继续这次冒险</PixelButton><PixelButton onClick={onClose}>返回地图</PixelButton></div>
        </div> : result ? <>
          <div className="adventure-result">
            <Icon name={result.score >= 2 ? 'medal' : 'book'} size={48} />
            <h2 ref={heading} tabIndex={-1} id="adventure-title" className="text-px24 text-bright">{result.score === 3 ? '满星！这段英语你读懂了' : result.score >= 2 ? '新故事，已收入冒险护照' : '线索已经找到，再试一次'}</h2>
            <Stars value={result.stars} size={24} />
            <p className="readable text-dim">{scene.title} · 答对 {result.score}/{result.total} 题</p>
            <div className="flex flex-wrap justify-center gap-4 text-px12 text-gold"><span>+{result.xp} XP</span><span>+{result.coins} 金币</span><span className="text-pass">{result.progress.bestScore >= 2 ? '印章已收集' : '答对 2 题即可盖章'}</span></div>
            <p className="readable text-px12 text-dim">{result.newCorrect > 0 ? `本次首次答对 ${result.newCorrect} 道题，奖励已保存。` : '这几题的首次奖励已领取，重玩仍可刷新最佳成绩。'}</p>
          </div>
          {unlocked.length > 0 && <div className="mb-5 border-2 border-pass p-3 text-px12 text-pass" role="status"><Icon name="trophy" size={16} className="mr-2 inline" />成就解锁：{unlocked.join('、')}（+{unlocked.length * COIN_RULES.achievement} 金币）</div>}
          <div className="adventure-vocabulary readable"><h3 className="mb-3 font-semibold text-bright">带走这 4 个表达</h3><dl className="grid gap-3 sm:grid-cols-2">{scene.vocabulary.map((item) => <div key={item.word}><dt className="font-semibold text-bright" lang="en">{item.word}</dt><dd className="text-dim">{item.meaning}</dd></div>)}</dl></div>
          <details className="adventure-reference mt-4 readable"><summary>回看 3 道题和解析</summary><ol className="mt-4 space-y-5">{scene.questions.map((item, index) => <li key={item.id}><p className="font-semibold text-bright">{index + 1}. {item.prompt}</p><p className={answers[index] === item.answer ? 'text-pass' : 'text-fail'}>{answers[index] === item.answer ? '已答对' : `你选了：${item.options[answers[index]]}`}</p><p className="text-bright">正确回应：<span lang="en">{item.options[item.answer]}</span></p><p className="mt-1 text-dim">{item.explanation}</p></li>)}</ol></details>
        </> : <>
          <h2 ref={heading} tabIndex={-1} id="adventure-title" className="text-px24 text-bright">{stage < 0 ? scene.title : question.prompt}</h2>
          {stage < 0 ? <>
            <p className="readable mt-2 text-dim">{scene.intro}</p>
            <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-px12"><span className="flex items-center gap-2 text-gold"><Icon name="target" size={16} />{scene.goal}</span><PixelButton size="sm" aria-pressed={showTranslation} onClick={() => setShowTranslation(!showTranslation)}>{showTranslation ? '收起中文提示' : '需要中文提示'}</PixelButton></div>
            {dialogue}
            <p className="readable mt-4 text-px12 text-dim">先读故事再挑战。答题时随时可以回看原文，没有倒计时。每题首次答对获得 3 XP 和 1 金币，重玩只补发尚未领取的题目奖励。</p>
          </> : <>
            <div className="my-4"><p className="mb-2 text-px12 text-dim">{SKILLS[question.skill]}</p><PixelBar value={stage + 1} max={3} label="情景挑战进度" color="var(--wq-gold)" /></div>
            <div className="space-y-3" role="group" aria-label="选择你的回应">
              {question.options.map((option, index) => <button key={index} type="button" disabled={checked} className={`adventure-option readable ${checked && index === question.answer ? 'adventure-correct' : checked && picked === index ? 'adventure-incorrect' : ''}`} onClick={() => setAnswers((previous) => previous[stage] === undefined ? [...previous, index] : previous)}>
                <span className="adventure-option-letter" aria-hidden>{'ABCD'[index]}</span><span className="flex-1" lang="en">{option}</span>{checked && (index === question.answer ? <span className="adventure-answer-label">正确答案 <Icon name="check" size={16} /></span> : picked === index ? <span className="adventure-answer-label">你的选择 <Icon name="cross" size={16} /></span> : null)}
              </button>)}
            </div>
            {checked && <div className={`adventure-feedback mt-4 readable ${picked === question.answer ? 'border-pass' : 'border-fail'}`} role="status"><p className={`mb-2 font-semibold ${picked === question.answer ? 'text-pass' : 'text-bright'}`}>{picked === question.answer ? '读懂了，继续前进！' : '看看这条线索，下次就会了。'}</p><p>{question.explanation}</p></div>}
            <details className="adventure-reference mt-5"><summary className="text-px12 text-dim">回看故事与中文提示</summary><div className="my-3"><PixelButton size="sm" aria-pressed={showTranslation} onClick={() => setShowTranslation(!showTranslation)}>{showTranslation ? '收起中文提示' : '显示中文提示'}</PixelButton></div>{dialogue}</details>
          </>}
        </>}
        {error && <p className="readable mt-4 text-fail" role="alert">{error}</p>}
      </div>
      {!exitPrompt && <footer className="flex flex-wrap justify-end gap-3 border-t-2 border-edge bg-panel p-4">
        {result ? <><PixelButton disabled={busy} variant="primary" icon="spark" onClick={onPractice}>换个情境，练两句</PixelButton>{nextScene && <PixelButton disabled={busy} icon="arrow-right" onClick={() => onNext(nextScene)}>下个故事</PixelButton>}<PixelButton disabled={busy} onClick={restart}>重玩故事</PixelButton><PixelButton disabled={busy} onClick={onClose}>返回地图</PixelButton></> : stage < 0 ? <PixelButton variant="primary" icon="sword" onClick={() => setStage(0)}>准备好了，开始挑战</PixelButton> : <PixelButton variant="primary" icon="arrow-right" disabled={!checked || busy} aria-busy={busy} onClick={() => stage < 2 ? setStage(stage + 1) : void finish()}>{busy ? '正在保存…' : stage < 2 ? '下一道挑战' : error ? '重新保存结果' : '收下本次冒险'}</PixelButton>}
      </footer>}
    </div>
  </dialog>
}
