import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Word } from '../types/model'
import type { Question, QuestionKind } from '../core/session'
import { buildQuestion, overrideRating, primaryMeaning, submitAnswer } from '../core/session'
import { recordCombo } from '../core/progress'
import { awardRewards } from '../core/profile'
import { MODE_LABEL, autoRating } from '../core/fsrs'
import { levelFromXp, rankFromPower } from '../core/game'
import { playSfx, speak } from '../core/audio'
import { Chest, Mascot, Monster, PixelBar, PixelButton } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { loadRoots, rootsForWord, type RootEntry } from '../core/roots'
import { useUi } from '../state/ui'

interface BattleProps {
  reviews: Word[]
  news: Word[]
  pool: Word[]
  /** 用户真实学过的词，用于干扰项 */
  knownWords?: Word[]
  onExit: () => void
}

interface Answered {
  correct: boolean
  answerText: string
  nextDue?: number
  /** 本次作答写入的日志 id，改评级时用它定位 */
  logId?: string
}

/** 飘字：伤害数字 / XP / MISS / 击杀，自动上升消失 */
/** 本场学过的词：结算页可回看 */
interface LearnedWord {
  word: string
  correct: boolean
  phonetic?: string
  meaning: string
}

interface FloatItem {
  id: number
  text: string
  cls: string
  dx: number
}

const KIND_HINT: Record<QuestionKind, string> = {
  'choice-word': '选出正确的释义',
  'choice-meaning': '选出对应的单词',
  spell: '根据释义拼出单词',
  'listen-meaning': '听发音，选出释义',
  'listen-spell': '听发音，拼出单词',
}

/** 挑战模式每题时限（毫秒），按题型区分；BOSS 词更紧 */
function challengeMs(kind: QuestionKind | undefined, boss: boolean): number {
  let base: number
  switch (kind) {
    case 'spell':
    case 'listen-spell':
      base = 25000
      break
    case 'listen-meaning':
      base = 18000
      break
    default:
      base = 15000
  }
  return boss ? Math.round(base * 0.8) : base
}

/** BOSS 词的额外击杀奖励 */
const BOSS_BONUS_XP = 10
const BOSS_BONUS_COIN = 2

export function Battle({ reviews, news, pool, knownWords, onExit }: BattleProps) {
  const profile = useUi((s) => s.profile)
  const initialQueue = useMemo(
    () => [
      ...reviews.map((w) => ({ word: w, isReview: true })),
      ...news.map((w) => ({ word: w, isReview: false })),
    ],
    [reviews, news],
  )

  const [queue, setQueue] = useState(initialQueue)
  useEffect(() => setQueue(initialQueue), [initialQueue])

  const [index, setIndex] = useState(0)
  const [question, setQuestion] = useState<Question | null>(null)
  const [typed, setTyped] = useState('')
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [stats, setStats] = useState({ correct: 0, total: 0, xp: 0, coins: 0, bonus: 0 })
  const [finished, setFinished] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [shake, setShake] = useState(false)
  const [dying, setDying] = useState(false)
  const [slash, setSlash] = useState(false)
  const [hurt, setHurt] = useState(false)
  const [floats, setFloats] = useState<FloatItem[]>([])
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [chestOpen, setChestOpen] = useState(false)
  /** 本题提交后的 FSRS stability，用于记忆强度环 */
  const [statStability, setStatStability] = useState<number | null>(null)
  /** 本场已答题数（用于退出确认） */
  const answeredCountRef = useRef(0)
  const [learnedWords, setLearnedWords] = useState<LearnedWord[]>([])
  /** 挑战模式：每题限时，超时判错 */
  const [challenge, setChallenge] = useState(() => localStorage.getItem('wq:challenge') === '1')
  const [timeLeftPct, setTimeLeftPct] = useState(1)
  const deadlineRef = useRef(0)
  const timeoutFiredRef = useRef(false)
  const startRef = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const floatIdRef = useRef(0)
  /** 本场开局时的经验基数，用于在本地判断是否升级 */
  const xpBaseRef = useRef<number | null>(null)
  const shownLevelRef = useRef(1)
  /**
   * 同步提交锁。React 的 answered 状态要到下一次渲染才生效，
   * 快速连点「确认」会在同一帧内重复提交、写多条日志、重复加经验。
   */
  const submittingRef = useRef(false)
  const [rootsReady, setRootsReady] = useState(false)

  const current = queue[index]
  const currentWeight = current?.word.difficultyWeight ?? 1
  const isBoss = currentWeight >= 1.6

  // 词根表是辅助数据，加载失败不影响答题
  useEffect(() => {
    void loadRoots().then(() => setRootsReady(true))
  }, [])

  const wordRoots: RootEntry[] = useMemo(
    () => (rootsReady && question ? rootsForWord(question.word.id) : []),
    [rootsReady, question],
  )

  useEffect(() => {
    if (xpBaseRef.current === null) xpBaseRef.current = profile?.xp ?? 0
    shownLevelRef.current = levelFromXp(xpBaseRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 推一个飘字并自动清理（横向偏移用 crypto 随机，避免可预测的同位置堆叠） */
  const pushFloat = useCallback((text: string, cls: string) => {
    const id = ++floatIdRef.current
    const rnd = new Uint32Array(1)
    crypto.getRandomValues(rnd)
    const dx = Math.round(((rnd[0] % 1000) / 1000 - 0.5) * 28)
    setFloats((f) => [...f, { id, text, cls, dx }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 850)
  }, [])

  useEffect(() => {
    if (!current) {
      setFinished(true)
      return
    }
    const isReview = current.isReview
    // 题型每题独立随机采样：确定性种子会让「再来一轮」重复上一轮的题型序列
    const rnd = new Uint32Array(1)
    crypto.getRandomValues(rnd)
    const r = rnd[0] % 6
    const kind: QuestionKind = !isReview
      ? index % 3 === 0
        ? 'choice-meaning'
        : 'choice-word'
      : r <= 1
        ? 'spell'
        : r === 2
          ? 'listen-spell'
          : r === 3
            ? 'listen-meaning'
            : r === 4
              ? 'choice-meaning'
              : 'choice-word'
    setQuestion(buildQuestion(current.word, kind, pool, isReview, undefined, knownWords))
    submittingRef.current = false
    setTyped('')
    setAnswered(null)
    setShowRating(false)
    setDying(false)
    startRef.current = Date.now()
    if (isBoss) playSfx('boss')
    if (kind === 'listen-meaning' || kind === 'listen-spell') {
      setTimeout(() => void speak(current.word.word), 220)
    }
    if (kind === 'spell' || kind === 'listen-spell') {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [current, index, pool])

  /** 结算：宝箱先抖后开，金币飞出 */
  useEffect(() => {
    if (!finished) return
    setChestOpen(false)
    const t = setTimeout(() => {
      setChestOpen(true)
      playSfx('chest')
    }, 850)
    return () => clearTimeout(t)
  }, [finished])

  /** 升级检测：本地累计经验跨过等级线就全屏庆祝 */
  useEffect(() => {
    if (xpBaseRef.current === null) return
    const total = xpBaseRef.current + stats.xp + stats.bonus
    const lv = levelFromXp(total)
    if (lv > shownLevelRef.current) {
      shownLevelRef.current = lv
      setLevelUp(lv)
      playSfx('levelUp')
      setTimeout(() => setLevelUp(null), 1200)
    }
  }, [stats.xp, stats.bonus])

  /** 挑战模式倒计时：超时按答错处理，与手动答错同一提交路径 */
  useEffect(() => {
    if (!challenge || !question || answered || finished) return
    const total = challengeMs(question.kind, isBoss)
    deadlineRef.current = Date.now() + total
    timeoutFiredRef.current = false
    setTimeLeftPct(1)
    const timer = setInterval(() => {
      const left = deadlineRef.current - Date.now()
      const pct = Math.max(0, left / total)
      setTimeLeftPct(pct)
      if (left <= 0 && !timeoutFiredRef.current && !submittingRef.current) {
        timeoutFiredRef.current = true
        clearInterval(timer)
        void (async () => {
          const res = await commit(false, false)
          setAnswered({ correct: false, answerText: question.answer, nextDue: res?.nextDue, logId: res?.logId })
        })()
      }
    }, 100)
    return () => clearInterval(timer)
    // commit 依赖 combo，用 ref 避免每次连击重启计时
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge, question, answered, finished, index, isBoss])

  const finish = useCallback(() => setFinished(true), [])

  const advance = useCallback(() => {
    if (index + 1 >= queue.length) finish()
    else setIndex((i) => i + 1)
  }, [index, queue.length, finish])

  /** 答错的词补到队尾重练一次，但不无限循环（同一词最多出现 2 次） */
  const requeueIfWrong = useCallback(
    (word: Word, correct: boolean) => {
      if (correct) return
      setQueue((q) => {
        // 单个词最多重练一次
        if (q.filter((item) => item.word.id === word.id).length >= 2) return q
        // 整轮重排不超过初始题量的一半：答错多时不把一轮拖成两轮
        const retryCount = q.length - initialQueue.length
        if (retryCount >= Math.ceil(initialQueue.length / 2)) return q
        return [...q, { word, isReview: true }]
      })
    },
    [initialQueue.length],
  )

  const commit = useCallback(
    async (
      correct: boolean,
      nearMiss: boolean,
    ): Promise<{ nextDue: number; logId: string } | undefined> => {
      if (!question) return undefined
      if (submittingRef.current) return undefined
      submittingRef.current = true
      const elapsed = Date.now() - startRef.current
      const rating = autoRating({ correct, elapsedMs: elapsed, nearMiss, mode: question.kind })
      const res = await submitAnswer({
        question,
        rating: rating as 1 | 2 | 3 | 4,
        elapsedMs: elapsed,
        correct,
        nearMiss,
      })

      let bonusXp = 0
      let bonusCoin = 0
      const word = question.word
      const boss = word.difficultyWeight >= 1.6

      if (correct) {
        const n = combo + 1
        setCombo(n)
        setMaxCombo((m) => Math.max(m, n))
        // 记录本次连击峰值，供「手感渐热」等连击成就判定
        recordCombo(n)

        // 命中三连反馈：白闪 → 斩击 → 碎裂
        setSlash(true)
        setTimeout(() => setSlash(false), 400)
        setDying(true)
        setTimeout(() => setDying(false), 500)

        // BOSS 词额外奖励（真实经验，不只是演出）
        if (boss) {
          bonusXp = BOSS_BONUS_XP
          bonusCoin = BOSS_BONUS_COIN
          void awardRewards({ xp: bonusXp, coins: bonusCoin })
          pushFloat(`BOSS 击杀 +${bonusXp}`, 'text-gold text-px24')
          playSfx('boss')
        }

        pushFloat(`+${res.xp + bonusXp} XP`, 'text-pass')
        // 连击越高音调越高：用音高直接表达「手感在变热」
        playSfx('correct', 1 + Math.min(n, 12) * 0.06)
        if (n >= 3 && n % 5 === 0) pushFloat(`${n} 连击！`, 'text-gold text-px24')
      } else {
        setCombo(0)
        setShake(true)
        setHurt(true)
        setTimeout(() => setShake(false), 240)
        setTimeout(() => setHurt(false), 300)
        pushFloat('MISS', 'text-fail text-px24')
        playSfx('wrong')
      }

      answeredCountRef.current++
      setStatStability(res.stat.fsrs.stability)
      setLearnedWords((list) => [
        ...list.filter((x) => x.word !== question.word.word),
        {
          word: question.word.word,
          correct,
          phonetic: question.word.phonetic,
          meaning: primaryMeaning(question.word),
        },
      ])
      setStats((s) => ({
        correct: s.correct + (correct ? 1 : 0),
        total: s.total + 1,
        xp: s.xp + res.xp,
        coins: s.coins + res.coins + bonusCoin,
        bonus: s.bonus + bonusXp,
      }))
      requeueIfWrong(word, correct)
      return { nextDue: res.nextDue, logId: res.logId }
    },
    [question, requeueIfWrong, combo, pushFloat],
  )

  const onChoice = useCallback(
    async (opt: string) => {
      if (!question || answered || submittingRef.current) return
      const correct = opt === question.answer
      const res = await commit(correct, false)
      setAnswered({ correct, answerText: question.answer, nextDue: res?.nextDue, logId: res?.logId })
    },
    [question, answered, commit],
  )

  const onSubmitSpell = useCallback(async () => {
    if (!question || answered || submittingRef.current || !typed.trim()) return
    const target = question.answer.toLowerCase()
    const val = typed.trim().toLowerCase()
    const exact = val === target
    const almost = !exact && editDistance(val, target) === 1
    const res = await commit(exact || almost, almost)
    setAnswered({ correct: exact || almost, answerText: question.answer, nextDue: res?.nextDue, logId: res?.logId })
  }, [question, answered, typed, commit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = document.activeElement?.tagName === 'INPUT'
      if (e.key === ' ' && question && !inInput) {
        e.preventDefault()
        void speak(question.word.word)
      }
      // 四选一支持 1-4 / ABCD 键作答，配合回车继续实现全程不碰鼠标
      if (!inInput && question?.options && !answered && !showRating) {
        const byNumber = ['1', '2', '3', '4'].indexOf(e.key)
        const byLetter = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase())
        const pick = byNumber >= 0 ? byNumber : byLetter
        if (pick >= 0 && pick < question.options.length) {
          e.preventDefault()
          void onChoice(question.options[pick])
          return
        }
      }
      if (e.key === 'Enter' && answered && !showRating) {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, answered, showRating, advance, onChoice])

  // 进度以原始任务量为分母，重排的题不虚增总数
  const progressTotal = Math.max(1, initialQueue.length)

  if (queue.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <Monster weight={1} dead />
        <p className="text-px12 text-dim">今天没有待办</p>
        <PixelButton variant="primary" onClick={onExit}>
          回到今日
        </PixelButton>
      </div>
    )
  }

  if (finished) {
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    const totalXp = stats.xp + stats.bonus
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-4">
        {/* 升级庆祝 */}
        {levelUp && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="anim-lvl text-center">
              <div className="text-px36 text-gold">LEVEL UP</div>
              <div className="text-px24 text-bright">LV.{levelUp}</div>
            </div>
          </div>
        )}

        <Chest open={chestOpen} size={88} />
        <div className="text-px24 text-gold">战斗结算</div>
        <div className="pixel-frame w-full max-w-sm bg-panel p-3">
          <dl className="space-y-2">
            {[
              { label: '斩杀单词', value: `${stats.total} 只` },
              {
                label: '正确率',
                value: `${acc}%`,
                accent: (acc >= 80 ? 'pass' : acc >= 60 ? 'gold' : 'fail') as 'pass' | 'gold' | 'fail',
              },
              { label: '最高连击', value: `${maxCombo} 连` },
              { label: '获得经验', value: `+${totalXp} XP`, accent: 'gold' as const },
              { label: '获得金币', value: `+${stats.coins}`, accent: 'gold' as const },
            ].map((row, i) => (
              <Row key={row.label} {...row} style={{ animationDelay: `${900 + i * 120}ms` }} />
            ))}
          </dl>
          {/* 本场词单：答错标红，可回看 */}
          {learnedWords.length > 0 && (
            <div className="mt-2 border-2 border-edge p-2">
              <div className="mb-1 text-px12 text-dim">本场词单（{learnedWords.length}）</div>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {learnedWords.map((w) => (
                  <li key={w.word} className="flex items-baseline justify-between gap-2 text-px12">
                    <span className={`min-w-0 shrink-0 ${w.correct ? 'text-bright' : 'text-fail'}`}>
                      {w.word}
                    </span>
                    <span className="readable min-w-0 flex-1 truncate text-dim">{w.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <PixelButton variant="primary" onClick={onExit}>
              今日达成
            </PixelButton>
            <PixelButton
              variant="ghost"
              onClick={() => {
                setFinished(false)
                setChestOpen(false)
                setIndex(0)
                setStats({ correct: 0, total: 0, xp: 0, coins: 0, bonus: 0 })
                setCombo(0)
                setMaxCombo(0)
                setQueue(initialQueue)
              }}
            >
              再来一轮
            </PixelButton>
          </div>
        </div>
      </div>
    )
  }

  const isListening = question?.kind === 'listen-meaning' || question?.kind === 'listen-spell'
  const isSpell = question?.kind === 'spell' || question?.kind === 'listen-spell'
  const showWord = question?.kind === 'choice-word' // 只有看词选义才亮出单词

  return (
    <div className={`relative flex h-full flex-col ${shake ? 'animate-shake' : ''}`}>
      {/* 高连击：屏幕边缘火焰光晕 */}
      {combo >= 8 && (
        <div className="anim-fireglow pointer-events-none absolute inset-0 z-40" aria-hidden />
      )}
      {/* 升级庆祝 */}
      {levelUp && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
          <div className="anim-lvl text-center">
            <div className="text-px36 text-gold">LEVEL UP</div>
            <div className="text-px24 text-bright">LV.{levelUp}</div>
          </div>
        </div>
      )}
      {/* 答错：红色边缘一闪，表示被怪物反击 */}
      {hurt && (
        <div
          className="pointer-events-none absolute inset-0 z-40"
          style={{ boxShadow: 'inset 0 0 24px 8px color-mix(in srgb, var(--wq-fail) 55%, transparent)' }}
          aria-hidden
        />
      )}

      {/* 顶栏：进度 / 连击 */}
      <div className="flex items-center gap-2 border-b-2 border-edge bg-panel px-2 py-2">
        <button
          onClick={() => {
            if (answeredCountRef.current > 0 && !finished) {
              if (!window.confirm(`已答 ${answeredCountRef.current} 题，退出后本轮剩余题目作废。确定退出？`)) return
            }
            onExit()
          }}
          aria-label="退出战斗"
          className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-edge text-dim"
        >
          <Icon name="arrow-right" size={16} className="rotate-180" />
        </button>

        {progressTotal <= 30 ? (
          /* 短轮次用像素点：一眼看清剩几只怪 */
          <div className="flex min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-label={`进度 ${index}/${progressTotal}`}>
            {Array.from({ length: progressTotal }).map((_, i) => (
              <span
                key={i}
                className="block h-2.5 w-2.5 shrink-0 border border-black"
                style={{
                  background:
                    i < index ? 'var(--wq-gold)' : i === index ? 'var(--wq-pass)' : 'var(--wq-panel-2)',
                }}
              />
            ))}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <PixelBar value={Math.min(index, progressTotal)} max={progressTotal} label="本轮进度" />
          </div>
        )}

        <button
          onClick={() => {
            const next = !challenge
            setChallenge(next)
            localStorage.setItem('wq:challenge', next ? '1' : '0')
          }}
          aria-pressed={challenge}
          aria-label={challenge ? '关闭限时挑战' : '开启限时挑战'}
          title={challenge ? '限时挑战中：点击关闭' : '限时挑战：每题倒计时'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 text-px12 ${
            challenge ? 'border-gold text-gold' : 'border-edge text-dim'
          }`}
        >
          <Icon name="clock" size={16} />
        </button>
        {combo >= 2 && (
          <span
            key={combo}
            className={`anim-combo shrink-0 text-px12 tnum ${
              combo >= 10 ? 'text-fail' : combo >= 5 ? 'text-gold' : 'text-bright'
            }`}
          >
            {combo >= 5 && (
              <span className="anim-flame mr-[2px] inline-flex align-[-1px] text-gold">
                <Icon name="flame" size={12} />
              </span>
            )}
            {combo} 连
          </span>
        )}
        <span className="shrink-0 text-px12 text-dim tnum">
          {Math.min(index + 1, progressTotal)}/{progressTotal}
        </span>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 挑战模式倒计时条：绿→金→红，超时即判错 */}
        {challenge && !answered && !finished && (
          <div className="h-1.5 w-full bg-bg" role="timer" aria-label="剩余时间">
            <div
              className="h-full transition-[width] duration-100"
              style={{
                width: `${timeLeftPct * 100}%`,
                background:
                  timeLeftPct > 0.5 ? 'var(--wq-pass)' : timeLeftPct > 0.25 ? 'var(--wq-gold)' : 'var(--wq-fail)',
              }}
            />
          </div>
        )}

        {/* 上段：怪物舞台。固定高度，视线落点稳定 */}
        <div
          className="relative flex shrink-0 flex-col items-center justify-center overflow-hidden border-b-2 border-edge bg-panel/40 py-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 6px, color-mix(in srgb, var(--wq-edge) 25%, transparent) 6px 8px)',
          }}
        >
          <div className="relative flex w-full items-end justify-center gap-12 px-4">
            {/* 我方：勇者。明确「谁在攻击谁」——命中时它向前突进，答错时怪物反扑 */}
            <div className={`shrink-0 ${slash ? 'anim-hop' : ''}`} aria-hidden>
              <Mascot
                stage={rankFromPower(profile?.powerPeak ?? 0).rank.mascotStage}
                size={40}
                mood={hurt ? 'sad' : 'happy'}
                skin={profile?.mascot.skin}
              />
            </div>
            {/* 敌方：这只词怪才是被攻击的对象 */}
            <div className={`relative ${hurt ? 'anim-lunge' : ''}`}>
              <Monster weight={currentWeight} dying={dying} />
              {/* 斩击光 */}
              {slash && (
                <span
                  className="anim-slash pointer-events-none absolute top-1/2 left-1/2 h-2 w-28 -translate-y-1/2 bg-white"
                  style={{ boxShadow: '0 0 12px 4px rgba(255,255,255,.8)' }}
                  aria-hidden
                />
              )}
              {/* 飘字层 */}
              {floats.map((f) => (
                <span
                  key={f.id}
                  className={`anim-float pointer-events-none absolute top-0 left-1/2 whitespace-nowrap ${f.cls}`}
                  style={{ marginLeft: f.dx }}
                >
                  {f.text}
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-1 flex items-center gap-2 text-px12 text-dim">
            {isBoss && (
              <span className="border-2 border-gold px-1 text-px12 leading-none text-gold">BOSS</span>
            )}
            {MODE_LABEL[question?.kind ?? 'choice-word']} · {current?.isReview ? '复习' : '新词'}
          </div>
        </div>

        {/* 中段：题干，可滚动。紧随舞台（justify-start），避免大屏上题目被推到下半屏 */}
        <div className="flex min-h-0 flex-1 flex-col justify-start overflow-y-auto px-3 pt-3 pb-3">
        <div className={`w-full ${answered ? 'hidden' : ''}`}>
        <div className="mb-2 text-center text-px12 text-dim">{KIND_HINT[question?.kind ?? 'choice-word']}</div>

        {/* 题面 */}
        {question && showWord && (
          <div className="mb-2 text-center">
            <div className="text-px36 text-bright">{question.word.word}</div>
            {question.word.phonetic && <div className="mt-1 text-px12 text-dim">/{question.word.phonetic}/</div>}
            <PixelButton
              size="sm"
              variant="ghost"
              className="mt-1"
              icon="speaker"
              ariaLabel="朗读单词"
              onClick={() => void speak(question.word.word)}
            >
              朗读
            </PixelButton>
          </div>
        )}

        {question && question.kind === 'choice-meaning' && (
          <div className="readable mb-2 w-full px-1 text-center text-[20px] leading-snug text-bright">
            {primaryMeaning(question.word)}
          </div>
        )}

        {question && question.kind === 'spell' && (
          <div className="mb-2 text-center">
            <div className="readable px-1 text-[18px] leading-snug text-bright">{question.word.definition}</div>
            {question.word.phonetic && <div className="mt-1 text-px12 text-dim">/{question.word.phonetic}/</div>}
          </div>
        )}

        {question && isListening && (
          <div className="mb-2 flex justify-center">
            <PixelButton icon="speaker" onClick={() => void speak(question.word.word)}>
              再听一遍
            </PixelButton>
          </div>
        )}

        </div>

        {/* 作答区：紧随题干，与题干共同居中 */}
        <div className={`w-full ${answered ? 'mt-0' : 'mt-3'}`}>
        {/* 四选一：1-4 数字键也可作答 */}
        {question?.options && !answered && (
          <div className="grid grid-cols-1 gap-2">
            {question.options.map((opt, i) => {
              return (
                <button
                  key={`${opt}-${i}`}
                  disabled={Boolean(answered)}
                  onClick={() => void onChoice(opt)}
                  className={`pixel-btn grid grid-cols-[16px_1fr] items-baseline gap-2 px-3 py-3 text-left ${
                    question.kind === 'choice-word' ? 'readable text-[15px]' : 'text-px12'
                  }`}
                >
                  <span className="text-px12 text-dim">{'ABCD'[i]}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 拼写 */}
        {question && isSpell && !answered && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void onSubmitSpell()
            }}
          >
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={Boolean(answered)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="拼写答案"
              placeholder="输入拼写后回车"
              className="pixel-input w-full px-3 py-3 text-center text-px24 tracking-widest"
            />
            <PixelButton type="submit" variant="primary" onClick={() => void onSubmitSpell()}>
              确认
            </PixelButton>
          </form>
        )}

        {/* 作答反馈 */}
        {answered && (
          <div className="mt-3 animate-pop">
            <div
              className="pixel-frame bg-panel p-3"
              style={{ borderColor: answered.correct ? 'var(--wq-pass)' : 'var(--wq-fail)' }}
            >
              <div
                className={`mb-2 flex items-center gap-1 text-px12 ${
                  answered.correct ? 'text-pass' : 'text-fail'
                }`}
              >
                <Icon name={answered.correct ? 'check' : 'cross'} size={16} />
                {answered.correct ? '正确' : '答错了'}
              </div>
              <div className="text-px24 text-bright">{question?.word.word}</div>
              {question?.word.phonetic && <div className="text-px12 text-dim">/{question.word.phonetic}/</div>}
              <div className="readable mt-2 whitespace-pre-line text-[15px] leading-relaxed text-bright">
                {question?.word.definition}
              </div>
              {wordRoots.length > 0 && (
                <div className="mt-2 border-t-2 border-edge pt-2">
                  <div className="mb-1 text-px12 text-dim">词根拆解</div>
                  <ul className="space-y-1">
                    {wordRoots.slice(0, 3).map((r) => (
                      <li key={r.id} className="flex items-baseline gap-2 text-px12">
                        <span className="min-w-0 max-w-[40%] break-words text-gold">{r.form}</span>
                        <span className="text-dim">{r.cls}</span>
                        <span className={`min-w-0 flex-1 truncate ${r.meaningZh ? 'text-bright' : 'text-dim'}`}>
                          {r.meaning}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(question?.kind === 'spell' || question?.kind === 'listen-spell') && !answered.correct && typed.trim() && (
                <div className="mt-2 border-t-2 border-edge pt-2 text-px12">
                  <div className="mb-1 text-dim">拼写对比</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <span className="text-dim">你写的 </span>
                      <span className="text-fail">{typed.trim()}</span>
                    </span>
                    <span>
                      <span className="text-dim">正确 </span>
                      <span className="text-pass">{question?.word.word}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="mt-3 flex items-center gap-3 border-t-2 border-edge pt-2">
                {/* 记忆强度环：stability 越大越牢固，22 天以上视为掌握 */}
                {(() => {
                  const stab = statStability ?? 0
                  const pct = Math.min(1, stab / 45)
                  const C = 2 * Math.PI * 15
                  const color = stab >= 21 ? 'var(--wq-pass)' : stab >= 7 ? 'var(--wq-gold)' : 'var(--wq-fail)'
                  return (
                    <div className="relative h-10 w-10 shrink-0" role="img" aria-label={`记忆强度约 ${Math.round(stab)} 天`}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="15" fill="none" stroke="var(--wq-panel-2)" strokeWidth="5" />
                        <circle
                          cx="20"
                          cy="20"
                          r="15"
                          fill="none"
                          stroke={color}
                          strokeWidth="5"
                          strokeDasharray={`${(pct * C).toFixed(1)} ${C.toFixed(1)}`}
                          transform="rotate(-90 20 20)"
                        />
                      </svg>
                      <span
                        className="absolute inset-0 flex items-center justify-center text-px12 tnum"
                        style={{ color }}
                      >
                        {Math.round(stab)}
                      </span>
                    </div>
                  )
                })()}
                <div className="min-w-0 flex-1">
                  <div className="text-px12 text-dim">记忆强度</div>
                  <div className="text-px12 text-bright">
                    约 {Math.round(statStability ?? 0)} 天 ·{' '}
                    {(statStability ?? 0) >= 21 ? '已掌握' : (statStability ?? 0) >= 7 ? '巩固中' : '还比较脆'}
                  </div>
                  <div className="mt-0.5 text-px12 text-dim">
                    下次复习：{answered.nextDue ? formatDue(answered.nextDue) : '已加入队列'}
                  </div>
                </div>
              </div>
            </div>
            {!showRating && (
              <PixelButton className="mt-2 w-full" variant="primary" onClick={advance}>
                继续
              </PixelButton>
            )}
          </div>
        )}
        </div>
        </div>
      </div>

      {/* 手动评级（可选，默认自动评级） */}
      {answered && !showRating && (
        <div className="border-t-2 border-edge bg-panel px-3 py-2">
          <button className="w-full text-px12 text-dim underline decoration-dotted" onClick={() => setShowRating(true)}>
            手动调整评级
          </button>
        </div>
      )}
      {answered && showRating && question && (
        <div className="grid grid-cols-4 gap-1 border-t-2 border-edge bg-panel p-2">
          {[1, 2, 3, 4].map((r) => (
            <button
              key={r}
              className={`pixel-btn pixel-btn-sm ${r === 1 ? 'pixel-btn-fail' : r === 4 ? 'pixel-btn-pass' : ''}`}
              onClick={async () => {
                if (!question || !answered.logId) return
                // 只修正刚才那条日志的评级，不重复计分
                const res = await overrideRating(question.word.id, answered.logId, r as 1 | 2 | 3 | 4)
                if (res) setAnswered((a) => (a ? { ...a, nextDue: res.nextDue } : a))
                setShowRating(false)
                advance()
              }}
            >
              {['忘记', '困难', '记得', '简单'][r - 1]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  accent,
  style,
}: {
  label: string
  value: string
  accent?: 'gold' | 'pass' | 'fail'
  style?: React.CSSProperties
}) {
  const color =
    accent === 'gold' ? 'text-gold' : accent === 'pass' ? 'text-pass' : accent === 'fail' ? 'text-fail' : 'text-bright'
  return (
    <div className="anim-rowin flex items-center justify-between border-b border-edge/60 pb-1" style={style}>
      <dt className="text-px12 text-dim">{label}</dt>
      <dd className={`text-px12 ${color} tnum`}>{value}</dd>
    </div>
  )
}

/** 把到期时间转成「X 分钟后 / X 天后」这种直观说法 */
function formatDue(ts: number): string {
  const diff = ts - Date.now()
  if (diff <= 0) return '现在'
  const min = Math.round(diff / 60000)
  if (min < 60) return `${Math.max(1, min)} 分钟后`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} 小时后`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天后`
  return `${Math.round(days / 30)} 个月后`
}

/** 编辑距离，用于「擦边」判定（只差一个字母仍判通过） */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}
