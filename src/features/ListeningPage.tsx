import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/database'
import { awardRewards } from '../core/profile'
import { Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { useUi } from '../state/ui'
import { isMuted, setMuted, speak, speechErrorMessage, stopSpeaking } from '../core/audio'
import { originalAudioPath } from '../core/originalAudio'
import { checkAchievements } from '../core/progress'
import { BUILTIN_MATERIALS } from '../data/listening'
import { builtinSetsForLevel, mergeSetPack } from '../data/examSets'
import { buildListenQuestion, checkOrder, maskTarget } from '../core/listening'
import { ExamPlayer } from './ExamPlayer'
import { CetPaperLibrary } from './CetPaperLibrary'
import type { ExamPack } from '../core/examImport'
import './listening.css'

/**
 * 听力模块。
 *
 * 近年真题听力优先，原创短练和句子练习按需展开。
 * 目标级别用于内容分组，不表示试题已完成官方难度校准。
 */
interface Sentence {
  start: number
  end: number
  text: string
  zh?: string
}

interface Material {
  id: string
  title: string
  createdAt: number
  audioBlob?: Blob
  sentences: Sentence[]
  source?: 'builtin' | 'import'
}

export function ListeningPage() {
  const profile = useUi((state) => state.profile)
  const pushToast = useUi((state) => state.pushToast)
  const [level, setLevel] = useState<'cet4' | 'cet6'>(() => profile?.examType === 'cet6' ? 'cet6' : 'cet4')
  const [active, setActive] = useState<Material | null>(null)
  const [activeExam, setActiveExam] = useState<ExamPack | null>(null)
  const [practiceKind, setPracticeKind] = useState<'short' | 'sentence'>('short')
  useEffect(() => setLevel(profile?.examType === 'cet6' ? 'cet6' : 'cet4'), [profile?.examType])
  const practiceSets = builtinSetsForLevel(level === 'cet4' ? 'CET-4' : 'CET-6')
  const announce = (name: string) => pushToast(`成就解锁：${name}`, 'levelup')

  if (activeExam) return <ExamPlayer pack={activeExam} onExit={() => setActiveExam(null)} onAchievement={announce} />
  if (active) return <Player material={active} onExit={() => setActive(null)} onAchievement={announce} />

  return <div className="listening-page p-3 pb-24 md:p-5 md:pb-8">
    <Panel className="listening-library">
      <div className="listening-heading"><h2 className="text-px24 text-bright">近年真题听力</h2><div className="listening-levels" role="group" aria-label="真题听力级别">{(['cet4', 'cet6'] as const).map((value) => <PixelButton key={value} variant={level === value ? 'primary' : 'default'} aria-pressed={level === value} onClick={() => setLevel(value)}>{value === 'cet4' ? '四级' : '六级'}</PixelButton>)}</div></div>
      <CetPaperLibrary level={level} scope="listening" />
    </Panel>
    <details className="listening-extra">
      <summary><span className="text-bright">原创加练</span><span className="readable text-dim">理解短练与句子练习</span></summary>
      <div className="listening-extra-body">
        <p className="readable text-dim">内置英语合成录音，可重听、调速。用于听辨和理解加练。</p>
        <div className="listening-kinds" role="group" aria-label="原创练习类型">{([{ id: 'short', name: '理解短练' }, { id: 'sentence', name: '句子练习' }] as const).map((kind) => <PixelButton key={kind.id} variant={practiceKind === kind.id ? 'primary' : 'ghost'} aria-pressed={practiceKind === kind.id} onClick={() => setPracticeKind(kind.id)}>{kind.name}</PixelButton>)}</div>
        <ul className="listening-original-list">
          {practiceKind === 'short' ? practiceSets.map((set) => <li key={set.id}><div className="min-w-0"><h3 className="text-px12 text-bright">{set.label}</h3><p className="readable text-dim">{set.sections.reduce((sum, section) => sum + section.pack.items.length, 0)} 题 · {set.sections.length} 段材料</p></div><PixelButton onClick={() => setActiveExam(mergeSetPack(set))} aria-label={`练习${set.label}`}>开始短练</PixelButton></li>) : BUILTIN_MATERIALS.map((material) => <li key={material.id}><div className="min-w-0"><h3 className="text-px12 text-bright">{material.title}</h3><p className="readable text-dim">{material.topic} · {material.sentences.length} 句</p></div><PixelButton aria-label={`练习${material.title}`} onClick={() => setActive({ id: material.id, title: material.title, createdAt: Date.now(), source: 'builtin', sentences: material.sentences.map((sentence) => ({ start: 0, end: 0, text: sentence.text, zh: sentence.zh })) })}>练句子</PixelButton></li>)}
        </ul>
      </div>
    </details>
    <p className="readable listening-footnote text-dim">阅读、写作和翻译真题在「今日」的四六级备考台。</p>
  </div>
}

const KIND_LABEL: Record<string, string> = {
  blank: '选词填空',
  meaning: '听音选义',
  order: '词序排列',
  dictation: '整句听写',
}

const KIND_HINT: Record<string, string> = {
  blank: '听句子，选出被挖掉的词',
  meaning: '听句子，选出它的中文意思',
  order: '听句子，把词块排回正确顺序',
  dictation: '听句子，写出完整内容',
}

function Player({
  material,
  onExit,
  onAchievement,
}: {
  material: Material
  onExit: () => void
  onAchievement: (name: string) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [rate, setRate] = useState(1)
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [results, setResults] = useState({ ok: 0, total: 0 })
  const [allowDictation, setAllowDictation] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speakError, setSpeakError] = useState<string | null>(null)
  const startedRef = useRef(Date.now())
  const playback = useRef(0)

  const [picked, setPicked] = useState<string | null>(null)
  const [orderPicked, setOrderPicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')

  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void (async () => {
      const row = await db.media.get(material.id)
      const blob = row?.blob ?? material.audioBlob
      if (blob && !disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    })().catch(() => { if (!disposed) setSpeakError('本机录音读取未完成，请返回后重试。') })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [material.id, material.audioBlob])

  useEffect(() => {
    const player = audioRef.current
    playback.current++
    setPlaying(false); setStarting(false)
    return () => { playback.current++; stopSpeaking(); player?.pause() }
  }, [idx, material.id])

  const sentence = material.sentences[idx]

  const pools = useMemo(() => {
    const wordPool: string[] = []
    const zhPool: string[] = []
    for (const s of material.sentences) {
      wordPool.push(...s.text.split(/\s+/))
      if (s.zh) zhPool.push(s.zh)
    }
    return { wordPool, zhPool }
  }, [material.sentences])

  const question = useMemo(
    () =>
      sentence
        ? buildListenQuestion(sentence, idx, {
            allowDictation,
            wordPool: pools.wordPool,
            zhPool: pools.zhPool,
          })
        : null,
    [sentence, idx, allowDictation, pools],
  )

  useEffect(() => {
    setChecked(false)
    setCorrect(false)
    setPicked(null)
    setOrderPicked([])
    setTyped('')
    setSpeakError(null)
    startedRef.current = Date.now()
  }, [idx, allowDictation])

  async function play() {
    if (!sentence) return
    if (playing || starting) { playback.current++; stopSpeaking(); audioRef.current?.pause(); setPlaying(false); setStarting(false); return }
    const attempt = ++playback.current
    setSpeakError(null)
    setStarting(true)
    if (url && audioRef.current) {
      const el = audioRef.current
      el.currentTime = sentence.start
      el.playbackRate = rate
      try {
        await el.play()
        if (attempt === playback.current) setPlaying(true)
      } catch {
        if (attempt === playback.current) { setSpeakError('音频播放未能开始，请再点一次播放。'); setPlaying(false) }
      } finally {
        if (attempt === playback.current) setStarting(false)
      }
      return
    }
    const res = await speak(sentence.text, {
      rate,
      src: originalAudioPath(sentence.text),
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

  function judge() {
    if (!question) return
    let ok = false
    if (question.kind === 'blank') ok = picked === question.target
    else if (question.kind === 'meaning') ok = picked === question.zh
    else if (question.kind === 'order') {
      ok = checkOrder(
        orderPicked.map((i) => question.shuffled?.[i] ?? ''),
        question.text,
      )
    } else ok = normalize(typed) === normalize(question.text)

    setChecked(true)
    setCorrect(ok)
    setResults((r) => ({ ok: r.ok + (ok ? 1 : 0), total: r.total + 1 }))
    const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    startedRef.current = Date.now()
    void awardRewards({
      xp: ok ? 15 : 2,
      studySeconds: seconds,
      listeningSeconds: seconds,
      listeningSentences: 1,
    }).then(async () => {
      const newly = await checkAchievements()
      for (const a of newly) onAchievement(a.name)
    })
  }

  function next() {
    setIdx((i) => Math.min(material.sentences.length - 1, i + 1))
  }

  if (!sentence || !question) return null

  const answered = checked
  const canSubmit =
    question.kind === 'blank' || question.kind === 'meaning'
      ? Boolean(picked)
      : question.kind === 'order'
        ? orderPicked.length === (question.shuffled?.length ?? 0)
        : Boolean(typed.trim())

  return (
    <div className="flex h-full flex-col pb-20 md:pb-4">
      <div className="flex items-center gap-2 border-b-2 border-edge bg-panel px-3 py-2">
        <PixelButton size="sm" variant="ghost" onClick={onExit} ariaLabel="返回材料库">
          <Icon name="arrow-right" size={16} className="rotate-180" />
        </PixelButton>
        <span className="min-w-0 flex-1 truncate text-px12 text-bright">{material.title}</span>
        <span className="text-px12 text-dim tnum">
          {idx + 1}/{material.sentences.length}
        </span>
      </div>
      <div className="px-3 pt-2">
        <PixelBar value={idx + 1} max={material.sentences.length} label="句进度" />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-2xl space-y-3">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <PixelButton variant="primary" icon="speaker" onClick={() => void play()}>
                {starting ? '取消载入' : playing ? '停止播放' : '播放句子'}
              </PixelButton>
              <div className="flex gap-1">
                {[0.7, 0.85, 1, 1.2].map((r) => (
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
            </div>
            {url ? (
              <audio ref={audioRef} src={url} preload="metadata" className="hidden" onEnded={() => setPlaying(false)} onTimeUpdate={() => { const player = audioRef.current; if (player && sentence.end > sentence.start && player.currentTime >= sentence.end) { player.pause(); setPlaying(false) } }} onError={() => { setPlaying(false); setSpeakError('本机录音未能播放，请重新导入后重试。') }} />
            ) : (
              <p className="readable mt-2 text-px12 text-dim">
                内置英语合成录音 · 可调速重听
              </p>
            )}
            {speakError && <div className="readable mt-2" role="alert"><p className="text-fail">{speakError}</p>{isMuted() && <PixelButton size="sm" onClick={() => { setMuted(false); void play() }}>开启声音并播放</PixelButton>}</div>}
          </Panel>

          <Panel>
            <SectionHead right={KIND_LABEL[question.kind]}>{KIND_HINT[question.kind]}</SectionHead>

            {question.kind === 'blank' && (
              <>
                <p className="readable mb-3 text-[17px] leading-relaxed text-bright">
                  {answered ? question.text : maskTarget(question.text, question.target ?? '')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {question.choices?.map((c) => {
                    const isAnswer = c === question.target
                    const state = !answered
                      ? ''
                      : isAnswer
                        ? '!border-pass text-pass'
                        : picked === c
                          ? '!border-fail text-fail'
                          : 'opacity-45'
                    return (
                      <button
                        key={c}
                        disabled={answered}
                        onClick={() => setPicked(c)}
                        aria-pressed={picked === c}
                        className={`pixel-btn px-3 py-3 text-px12 ${state} ${
                          picked === c && !answered ? '!border-gold' : ''
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {question.kind === 'meaning' && (
              <>
                <p className="readable mb-3 text-px12 text-dim">先听，再选意思。原文提交后显示。</p>
                <div className="space-y-2">
                  {question.meaningChoices?.map((c) => {
                    const isAnswer = c === question.zh
                    const state = !answered
                      ? ''
                      : isAnswer
                        ? '!border-pass text-pass'
                        : picked === c
                          ? '!border-fail text-fail'
                          : 'opacity-45'
                    return (
                      <button
                        key={c}
                        disabled={answered}
                        onClick={() => setPicked(c)}
                        aria-pressed={picked === c}
                        className={`pixel-btn w-full px-3 py-3 text-left text-px12 ${state} ${
                          picked === c && !answered ? '!border-gold' : ''
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {question.kind === 'order' && (
              <>
                <p className="readable mb-2 text-px12 text-dim">
                  按正确顺序点击词块，点已选中的可撤回。
                </p>
                <div className="mb-3 min-h-[52px] border-2 border-dashed border-edge p-2">
                  {orderPicked.length === 0 ? (
                    <span className="text-px12 text-dim">点下方词块开始排列</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {orderPicked.map((i, pos) => (
                        <button
                          key={`${i}-${pos}`}
                          disabled={answered}
                          onClick={() => setOrderPicked((prev) => prev.filter((_, p) => p !== pos))}
                          className="border-2 border-gold px-2 py-1 text-px12 text-bright"
                        >
                          {question.shuffled?.[i]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {question.shuffled?.map((chunk, i) => {
                    const used = orderPicked.includes(i)
                    return (
                      <button
                        key={i}
                        disabled={answered || used}
                        onClick={() => setOrderPicked((prev) => [...prev, i])}
                        className={`pixel-btn pixel-btn-sm ${used ? 'opacity-30' : ''}`}
                      >
                        {chunk}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {question.kind === 'dictation' && (
              <>
                <p className="readable mb-2 text-px12 text-dim">听句子，写出完整内容。</p>
                <textarea
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={answered}
                  rows={3}
                  placeholder="听到什么写什么，不用管大小写和标点"
                  className="pixel-input w-full px-2 py-2 text-px12"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </>
            )}

            <div className="mt-3 flex gap-2">
              {!answered ? (
                <PixelButton variant="primary" className="flex-1" onClick={judge} disabled={!canSubmit}>
                  提交
                </PixelButton>
              ) : (
                <PixelButton className="flex-1" onClick={idx + 1 >= material.sentences.length ? onExit : next}>
                  {idx + 1 >= material.sentences.length ? '完成' : '下一句'}
                </PixelButton>
              )}
            </div>
          </Panel>

          {answered && (
            <Panel>
              <div className={`mb-2 flex items-center gap-1 text-px12 ${correct ? 'text-pass' : 'text-fail'}`}>
                <Icon name={correct ? 'check' : 'cross'} size={16} />
                {correct ? '正确' : '答错了'}
              </div>
              <p className="readable text-[15px] leading-relaxed text-bright">{question.text}</p>
              {question.zh && <p className="readable mt-1 text-px12 text-dim">{question.zh}</p>}
              {question.kind === 'blank' && question.target && (
                <p className="mt-2 text-px12 text-gold">被挖掉的词：{question.target}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <PixelButton size="sm" icon="speaker" onClick={() => void play()}>
                  再听一遍
                </PixelButton>
                <span className="ml-auto text-px12 text-dim tnum">
                  本次 {results.ok}/{results.total}
                </span>
              </div>
            </Panel>
          )}

          <Panel className="!p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-px12 text-bright">整句听写</div>
                <div className="text-px12 text-dim">默认关闭。一句话十几词，错一个就全错</div>
              </div>
              <PixelButton
                size="sm"
                variant={allowDictation ? 'primary' : 'ghost'}
                aria-pressed={allowDictation}
                onClick={() => setAllowDictation((v) => !v)}
              >
                {allowDictation ? '已开启' : '关闭'}
              </PixelButton>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
