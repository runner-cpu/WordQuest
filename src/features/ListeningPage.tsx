import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/database'
import { awardRewards } from '../core/profile'
import { Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { useUi } from '../state/ui'
import { hasEnglishVoice, onVoicesChanged, speak } from '../core/audio'
import { checkAchievements } from '../core/progress'
import { BUILTIN_MATERIALS } from '../data/listening'
import { builtinSetsForLevel, mergeSetPack } from '../data/examSets'
import { buildListenQuestion, checkOrder, maskTarget } from '../core/listening'
import { ExamPlayer } from './ExamPlayer'
import type { ExamPack } from '../core/examImport'

/**
 * 听力模块。
 *
 * 按主题组织的原创短练，以及短文句子练习。
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
  const profile = useUi((s) => s.profile)
  const openCetPrep = useUi((s) => s.openCetPrep)
  const pushToast = useUi((s) => s.pushToast)
  const [level, setLevel] = useState<'CET-4' | 'CET-6'>(() => profile?.examType === 'cet6' ? 'CET-6' : 'CET-4')
  const [active, setActive] = useState<Material | null>(null)
  const [activeExam, setActiveExam] = useState<ExamPack | null>(null)
  const [voiceReady, setVoiceReady] = useState(() => hasEnglishVoice())

  useEffect(() => onVoicesChanged(() => setVoiceReady(hasEnglishVoice())), [])
  useEffect(() => setLevel(profile?.examType === 'cet6' ? 'CET-6' : 'CET-4'), [profile?.examType])
  const practiceSets = builtinSetsForLevel(level)

  if (activeExam) {
    return (
      <ExamPlayer
        pack={activeExam}
        onExit={() => setActiveExam(null)}
        onAchievement={(name) => pushToast(`成就解锁：${name}`, 'levelup')}
      />
    )
  }

  if (active) {
    return (
      <Player
        material={active}
        onExit={() => setActive(null)}
        onAchievement={(name) => pushToast(`成就解锁：${name}`, 'levelup')}
      />
    )
  }

  return (
    <div className="space-y-3 p-3 pb-24 md:p-5 md:pb-8">
      <Panel>
        <SectionHead>用真题录音练完整节奏</SectionHead>
        <p className="readable mb-3 text-[16px] text-dim">近年真题提供高校公开原卷、答案与录音入口。可导入本机录音，配合 25 道听力答题卡练习，再回听错题证据。</p>
        <PixelButton variant="primary" icon="headphones" onClick={openCetPrep}>去近年真题练听力</PixelButton>
      </Panel>
      {!voiceReady && (
        <Panel className="!border-fail">
          <div className="flex items-start gap-2">
            <span className="mt-[2px] text-fail">
              <Icon name="warning" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-px12 text-fail">系统未检测到英语语音，原创短练暂不能朗读</div>
              <p className="readable mt-1 text-px12 text-dim">
                内置短练与短文靠系统英语语音朗读，导入的真题录音可直接播放。
                Windows 在「设置 → 时间和语言 → 语音」添加英语；macOS 在「系统设置 → 辅助功能 → 朗读内容」下载英语语音。
                装好后刷新页面即可。
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* 目标级别下的原创短练 */}
      <Panel>
        <SectionHead right={`${practiceSets.length} 组`}>原创听力短练</SectionHead>
        <p className="readable mb-2 text-px12 text-dim">
          默认显示备考目标对应的短练，可切换级别。每组 7–8 题、3 段材料，合成语音朗读，可连续练习或单独练一段。
        </p>
        <div className="mb-3 flex gap-2" aria-label="听力短练级别">
          {(['CET-4', 'CET-6'] as const).map((value) => (
            <PixelButton key={value} size="sm" variant={level === value ? 'primary' : 'ghost'} aria-pressed={level === value} onClick={() => setLevel(value)}>
              {value === 'CET-4' ? '四级方向' : '六级方向'}
            </PixelButton>
          ))}
        </div>
        <div className="space-y-2">
          {practiceSets.map((set) => (
            <div key={set.id} className="border-2 border-edge p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-px12 text-bright">{set.label}</div>
                  <div className="text-px12 text-dim tnum">
                    {set.level} 方向 · {set.sections.reduce((a, s) => a + s.pack.items.length, 0)} 题 · {set.sections.length} 段材料
                  </div>
                </div>
                <span className="shrink-0 border border-gold px-1 text-px12 leading-4 text-gold">原创</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <PixelButton size="sm" variant="primary" onClick={() => setActiveExam(mergeSetPack(set))}>
                  连续短练
                </PixelButton>
                {set.sections.map((s) => (
                  <PixelButton
                    key={s.key}
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveExam(s.pack)}
                  >
                    {s.name} · {s.pack.items.length}题
                  </PixelButton>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="readable mt-2 text-px12 text-dim">
          原创材料用于听辨与理解练习，未按官方整卷题量、播放流程或分值校准。备考时请另行安排对应级别的真题训练。
        </p>
      </Panel>


      <Panel>
        <SectionHead right={`${BUILTIN_MATERIALS.length} 篇`}>句子练习</SectionHead>
        <p className="readable mb-2 text-px12 text-dim">
          原创短文，合成语音朗读，离线可用。选词填空、听音选义、词序排列轮换出现。
        </p>
        <div className="grid gap-1 md:grid-cols-2">
          {BUILTIN_MATERIALS.map((m) => (
            <button
              key={m.id}
              className="flex w-full items-center gap-2 border-2 border-edge bg-panel-2 px-2 py-2 text-left"
              onClick={() =>
                setActive({
                  id: m.id,
                  title: m.title,
                  createdAt: Date.now(),
                  source: 'builtin',
                  sentences: m.sentences.map((s) => ({ start: 0, end: 0, text: s.text, zh: s.zh })),
                })
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-px12 text-bright">
                  {m.title}
                  <span className="text-dim">{m.level}</span>
                </div>
                <div className="text-px12 text-dim">
                  {m.topic} · {m.sentences.length} 句
                </div>
              </div>
              <Icon name="arrow-right" size={16} />
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
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
  const [voiceReady, setVoiceReady] = useState(() => hasEnglishVoice())
  const [speakError, setSpeakError] = useState<string | null>(null)
  const startedRef = useRef(Date.now())

  const [picked, setPicked] = useState<string | null>(null)
  const [orderPicked, setOrderPicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')

  useEffect(() => onVoicesChanged(() => setVoiceReady(hasEnglishVoice())), [])

  useEffect(() => {
    void (async () => {
      const row = await db.media.get(material.id)
      const blob = row?.blob ?? material.audioBlob
      if (blob) setUrl(URL.createObjectURL(blob))
    })()
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id])

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
    setSpeakError(null)
    if (url && audioRef.current) {
      const el = audioRef.current
      el.currentTime = sentence.start
      el.playbackRate = rate
      setPlaying(true)
      try {
        await el.play()
      } catch {
        setSpeakError('音频播放被浏览器拦截，请再点一次播放')
        setPlaying(false)
      }
      return
    }
    setPlaying(true)
    const res = await speak(sentence.text, {
      rate,
      onEnd: () => setPlaying(false),
    })
    if (!res.ok) {
      setPlaying(false)
      if (res.reason === 'no-voice') {
        setSpeakError('系统没有英语语音包，无法朗读')
      } else if (res.reason === 'muted') {
        setSpeakError('当前是静音状态，请在设置里开启音效与发音')
      } else {
        setSpeakError('这台浏览器不支持语音合成')
      }
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
                {playing ? '再听一遍' : '播放句子'}
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
              <audio ref={audioRef} src={url} preload="auto" className="hidden" />
            ) : (
              <p className="readable mt-2 text-px12 text-dim">
                {voiceReady
                  ? '内置材料用系统语音朗读，点播放即可听到。'
                  : '系统没有英语语音包，暂时无法朗读内置材料。'}
              </p>
            )}
            {speakError && <p className="mt-2 text-px12 text-fail">{speakError}</p>}
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
