import { useEffect, useRef, useState } from 'react'
import { awardRewards } from '../core/profile'
import { Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { isMuted, setMuted, speakLong, speechErrorMessage, stopSpeaking } from '../core/audio'
import { originalAudioPath } from '../core/originalAudio'
import { checkAchievements } from '../core/progress'
import type { ExamPack } from '../core/examImport'

/**
 * 听力理解练习播放器。
 * 同一段材料的多道题共用一个 group，换段时朗读新材料。
 * 练习可重听、调速并逐题查看解析，结果为本次练习正确率。
 */
export function ExamPlayer({
  pack,
  onExit,
  onAchievement,
}: {
  pack: ExamPack
  onExit: () => void
  onAchievement: (name: string) => void
}) {
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState<(number | null)[]>(() => pack.items.map(() => null))
  const [round, setRound] = useState(0)
  const [pendingRewards, setPendingRewards] = useState(0)
  const [rewardError, setRewardError] = useState<string | null>(null)
  const [rate, setRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speakError, setSpeakError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const startedRef = useRef(Date.now())
  const submitLock = useRef(false)
  const advanceLock = useRef(false)
  const pendingRewardCount = useRef(0)
  const playback = useRef(0)

  const item = pack.items[idx]
  const score = answers.reduce((total, answer, index) => ({
    ok: total.ok + (answer !== null && answer === pack.items[index]?.answer ? 1 : 0),
    total: total.total + (answer !== null ? 1 : 0),
  }), { ok: 0, total: 0 })

  async function playStem(text: string) {
    if (playing || starting) { playback.current++; stopSpeaking(); setPlaying(false); setStarting(false); return }
    const attempt = ++playback.current
    setSpeakError(null)
    setStarting(true)
    const res = await speakLong(text, {
      rate,
      src: originalAudioPath(text),
      onStart: () => { if (attempt === playback.current) setPlaying(true) },
      onEnd: () => { if (attempt === playback.current) setPlaying(false) },
      onError: (reason) => { if (attempt === playback.current) { setPlaying(false); setSpeakError(speechErrorMessage(reason)) } },
    })
    if (attempt !== playback.current) return
    setStarting(false)
    if (!res.ok && res.reason !== 'cancelled') {
      setPlaying(false)
      setSpeakError(speechErrorMessage(res.reason))
    }
  }

  /** 同段材料保留播放进度；换段、完成或退出时停止。 */
  useEffect(() => {
    playback.current++
    setPlaying(false); setStarting(false)
    return () => { playback.current++; stopSpeaking() }
  }, [item?.group, round, done])

  useEffect(() => {
    setChecked(false)
    setPicked(null)
    setSpeakError(null)
    submitLock.current = false
    advanceLock.current = false
    startedRef.current = Date.now()
  }, [idx, round])

  function judge() {
    if (picked == null || !item || checked || submitLock.current || answers[idx] !== null) return
    submitLock.current = true
    const ok = picked === item.answer
    setChecked(true)
    setAnswers((current) => current.map((answer, index) => index === idx ? picked : answer))
    const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    startedRef.current = Date.now()
    pendingRewardCount.current++
    setPendingRewards(pendingRewardCount.current)
    void awardRewards({
      xp: ok ? 15 : 2,
      studySeconds: seconds,
      listeningSeconds: seconds,
      listeningSentences: 1,
    }).then(async () => {
      try {
        const newly = await checkAchievements()
        for (const a of newly) onAchievement(a.name)
      } catch {
        setRewardError('学习奖励已保存，成就检查暂时未完成，可稍后回到首页查看。')
      }
    }).catch(() => {
      setRewardError(`第 ${idx + 1} 题的学习奖励未能保存，请检查本机存储。本轮答案仍可回顾。`)
    }).finally(() => {
      pendingRewardCount.current--
      setPendingRewards(pendingRewardCount.current)
    })
  }

  function advance() {
    if (!checked || advanceLock.current) return
    advanceLock.current = true
    if (idx + 1 >= pack.items.length) setDone(true)
    else setIdx((current) => current + 1)
  }

  function restart() {
    if (pendingRewardCount.current > 0) return
    submitLock.current = false
    advanceLock.current = false
    setDone(false)
    setIdx(0)
    setPicked(null)
    setChecked(false)
    setAnswers(pack.items.map(() => null))
    setRewardError(null)
    setRound((current) => current + 1)
  }

  if (!item) return null
  const finished = checked && idx + 1 >= pack.items.length
  const rewardFeedback = <>
    {pendingRewards > 0 && <p className="readable text-px12 text-dim" role="status">正在保存 {pendingRewards} 题的学习奖励…</p>}
    {rewardError && <p className="readable text-px12 text-fail" role="alert">{rewardError}</p>}
  </>

  // 完成页展示本次短练结果。
  if (done) {
    const acc = score.total > 0 ? Math.round((score.ok / score.total) * 100) : 0
    return (
      <div className="h-full min-h-0 overflow-y-auto p-3 pb-24 md:p-5 md:pb-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="text-px24 text-gold">练习完成</div>
        <div className="text-px12 text-dim">
          {pack.level} 方向 · {pack.title}
        </div>
        <div className="pixel-frame w-full bg-panel p-4 text-center">
          <div className={`text-px36 tnum ${acc >= 80 ? 'text-pass' : acc >= 60 ? 'text-gold' : 'text-fail'}`}>
            {acc}%
          </div>
          <div className="mt-1 text-px12 text-dim tnum">
            本次练习 {score.ok}/{score.total} 题正确
          </div>
          <p className="readable mt-2 text-px12 text-dim">练习正确率仅反映本次作答，不换算四六级分数。</p>
        </div>
        {rewardFeedback}
        <div className="flex w-full gap-2">
          <PixelButton variant="primary" className="flex-1" onClick={onExit}>
            返回短练
          </PixelButton>
          <PixelButton
            className="flex-1"
            disabled={pendingRewards > 0}
            onClick={restart}
          >
            再练一次
          </PixelButton>
        </div>
        <ExamRoundReview pack={pack} answers={answers} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col pb-20 md:pb-4">
      <div className="flex items-center gap-2 border-b-2 border-edge bg-panel px-3 py-2">
        <PixelButton size="sm" variant="ghost" onClick={onExit} ariaLabel="退出听力短练">
          <Icon name="arrow-right" size={16} className="rotate-180" />
        </PixelButton>
        <span className="min-w-0 flex-1 truncate text-px12 text-bright">
          {pack.level} 方向 · {pack.title}
        </span>

        <span className="text-px12 text-dim tnum">
          {idx + 1}/{pack.items.length}
        </span>
      </div>
      <div className="px-3 pt-2">
        <PixelBar value={idx + 1} max={pack.items.length} label="题目进度" />
        {rewardFeedback}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-2xl space-y-3">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <PixelButton variant="primary" icon="speaker" onClick={() => void playStem(item.stem)}>
                {starting ? '取消载入' : playing ? '停止播放' : '播放原文'}
              </PixelButton>
              <div className="flex gap-1">
                {[0.85, 1, 1.15].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRate(r)}
                    aria-pressed={rate === r}
                    className={`pixel-btn pixel-btn-sm ${rate === r ? 'pixel-btn-primary' : ''}`}
                  >
                    {r}×
                  </button>
                ))}
              </div>
              <span className="ml-auto text-px12 text-dim">{pack.sectionName}</span>
            </div>
            <p className="readable mt-2 text-px12 text-dim">内置英语合成录音 · 可调速重听</p>
            {speakError && <div className="readable mt-2" role="alert"><p className="text-fail">{speakError}</p>{isMuted() && <PixelButton size="sm" onClick={() => { setMuted(false); void playStem(item.stem) }}>开启声音并播放</PixelButton>}</div>}
          </Panel>

          <Panel>
            <SectionHead>第 {idx + 1} 题</SectionHead>
            <p className="readable mb-3 text-[16px] leading-relaxed text-bright">{item.question}</p>
            <div className="space-y-2">
              {item.options.map((opt, i) => {
                const isAnswer = i === item.answer
                const state = !checked
                  ? ''
                  : isAnswer
                    ? '!border-pass text-pass'
                    : picked === i
                      ? '!border-fail text-fail'
                      : 'opacity-45'
                return (
                  <button
                    key={i}
                    disabled={checked}
                    onClick={() => setPicked(i)}
                    aria-pressed={picked === i}
                    className={`pixel-btn w-full px-3 py-3 text-left text-px12 ${state} ${
                      picked === i && !checked ? '!border-gold' : ''
                    }`}
                  >
                    <span className="mr-2 text-dim">{'ABCD'[i]}</span>
                    {opt}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex gap-2">
              {!checked ? (
                <PixelButton variant="primary" className="flex-1" onClick={judge} disabled={picked == null}>
                  提交
                </PixelButton>
              ) : (
                <PixelButton
                  className="flex-1"
                  variant={finished ? 'primary' : 'default'}
                  onClick={advance}
                >
                  {finished ? '查看练习结果' : '下一题'}
                </PixelButton>
              )}
            </div>
          </Panel>

          {checked && (
            <Panel>
              <div
                className={`mb-2 flex items-center gap-1 text-px12 ${
                  picked === item.answer ? 'text-pass' : 'text-fail'
                }`}
              >
                <Icon name={picked === item.answer ? 'check' : 'cross'} size={16} />
                {picked === item.answer ? '正确' : `答错了，正确答案是 ${'ABCD'[item.answer]}`}
              </div>
              <p className="readable text-px12 leading-relaxed text-dim">{item.explain}</p>
              <div className="mt-2 flex items-center gap-2">
                <PixelButton size="sm" icon="speaker" onClick={() => void playStem(item.stem)}>
                  再听原文
                </PixelButton>
                <span className="ml-auto text-px12 text-dim tnum">
                  本次练习 {score.ok}/{score.total}
                </span>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

/** 本轮答案只保留在播放器状态中；材料与解析供逐题核对。 */
export function ExamRoundReview({ pack, answers }: { pack: ExamPack; answers: readonly (number | null)[] }) {
  const wrongCount = answers.filter((answer, index) => answer !== null && answer !== pack.items[index]?.answer).length
  return (
    <Panel className="cet-round-review">
      <SectionHead right={`${wrongCount} 道错题`}>本轮答题回顾</SectionHead>
      <p className="readable mb-3 text-px12 text-dim">本轮答案仅在当前页面显示，离开或重练后清除，不保存答题历史。可逐题核对选择、参考答案和解析。</p>
      <ol className="space-y-4">
        {pack.items.map((question, index) => {
          const selected = answers[index] ?? null
          const correct = selected === question.answer
          const stem = question.stem || pack.items.find((other) => other.group === question.group && other.stem)?.stem
          return (
            <li key={index} className="border-t-2 border-edge pt-3">
              <div className={`mb-2 text-px12 ${correct ? 'text-pass' : 'text-fail'}`}>第 {index + 1} 题 · {selected === null ? '未作答' : correct ? '答对' : '错题回顾'}</div>
              <p className="readable mb-2 text-px12 text-bright">{question.question}</p>
              <p className="readable text-px12 text-dim">你的选择：{selected === null ? '未作答' : `${'ABCD'[selected]}) ${question.options[selected]}`}</p>
              <p className="readable mt-1 text-px12 text-pass">参考答案：{'ABCD'[question.answer]}) {question.options[question.answer]}</p>
              <p className="readable mt-2 text-px12 text-dim">解析：{question.explain || '可结合材料原文核对参考答案。'}</p>
              <details className="mt-2 text-px12 text-dim">
                <summary className="cursor-pointer text-gold">查看材料原文</summary>
                <p className="readable mt-2 whitespace-pre-wrap leading-relaxed">{stem || '这道题暂未提供材料原文。'}</p>
              </details>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
