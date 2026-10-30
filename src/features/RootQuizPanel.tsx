import { useEffect, useState } from 'react'
import { PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { allRoots, loadRoots } from '../core/roots'
import { buildRootQuiz, type RootQuiz } from '../core/rootQuiz'
import { awardRewards } from '../core/profile'
import { playSfx } from '../core/audio'

/**
 * 词根练习。
 *
 * 词根是「认一次管一片」的内容：认识 spect = 看，inspect/spectator/respect
 * 就都有了锚点。之前只展示不考察，这里补上练习闭环。
 *
 * 两种题型轮换：看词根猜词义 / 看词选词根。答对给金币（与背词一致）。
 */
export function RootQuizPanel() {
  const [rootsReady, setRootsReady] = useState(false)
  const [quiz, setQuiz] = useState<RootQuiz | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [stats, setStats] = useState({ ok: 0, total: 0 })

  useEffect(() => {
    void loadRoots().then(() => {
      setRootsReady(true)
      setQuiz(buildQuiz())
    })
  }, [])

  function buildQuiz(): RootQuiz | null {
    const roots = allRoots()
    if (roots.length === 0) return null
    // 用 examples 反推「词 → 词根」索引
    const indexMap: Record<string, string[]> = {}
    for (const r of roots) {
      for (const ex of r.examples) {
        ;(indexMap[ex] ??= []).push(r.id)
      }
    }
    const words = Object.keys(indexMap)
    const kind: 'guess-meaning' | 'pick-root' = stats.total % 2 === 0 ? 'guess-meaning' : 'pick-root'
    return buildRootQuiz(roots, indexMap, words, kind)
  }

  function submit() {
    if (!quiz || picked == null) return
    const ok = picked === quiz.answer
    setCorrect(ok)
    setChecked(true)
    setStats((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }))
    if (ok) {
      playSfx('correct')
      void awardRewards({ xp: 3, coins: 1 })
    } else {
      playSfx('wrong')
    }
  }

  function next() {
    setPicked(null)
    setChecked(false)
    setQuiz(buildQuiz())
  }

  if (!rootsReady) {
    return (
      <p className="text-center text-px12 text-dim">正在载入词根表</p>
    )
  }

  if (!quiz) {
    return (
      <p className="text-center text-px12 text-dim">词根数据不足，无法出题</p>
    )
  }

  return (
    <div>
      <SectionHead right={`本次 ${stats.ok}/${stats.total}`}>
        {quiz.kind === 'guess-meaning' ? '看词根猜词义' : '看词选词根'}
      </SectionHead>

      {/* 题面 */}
      <div className="mb-3 text-center">
        {quiz.kind === 'guess-meaning' ? (
          <>
            <div className="text-px36 text-gold">{quiz.prompt}</div>
            {quiz.exampleWord && (
              <div className="mt-1 text-px12 text-dim">
                例如 <span className="text-bright">{quiz.exampleWord}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-px36 text-bright">{quiz.prompt}</div>
            <div className="mt-1 text-px12 text-dim">它包含哪个词根？</div>
          </>
        )}
      </div>

      {/* 选项 */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {quiz.choices.map((c) => {
          const isAnswer = c === quiz.answer
          const state = !checked
            ? ''
            : isAnswer
              ? '!border-pass text-pass'
              : picked === c
                ? '!border-fail text-fail'
                : 'opacity-45'
          return (
            <button
              key={c}
              disabled={checked}
              onClick={() => setPicked(c)}
              aria-pressed={picked === c}
              className={`pixel-btn px-3 py-3 text-left text-px12 ${state} ${
                picked === c && !checked ? '!border-gold' : ''
              }`}
            >
              {c}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex gap-2">
        {!checked ? (
          <PixelButton variant="primary" className="flex-1" onClick={submit} disabled={picked == null}>
            提交
          </PixelButton>
        ) : (
          <PixelButton variant="primary" className="flex-1" onClick={next}>
            下一题
          </PixelButton>
        )}
      </div>

      {checked && (
        <div className="mt-3 border-2 border-edge p-2 text-px12">
          <div className={`mb-1 flex items-center gap-1 ${correct ? 'text-pass' : 'text-fail'}`}>
            <Icon name={correct ? 'check' : 'cross'} size={16} />
            {correct ? '正确' : '答错了'}
          </div>
          <div className="text-bright">
            {quiz.root.form} <span className="text-dim">{quiz.root.cls}</span>
          </div>
          <div className="text-bright">{quiz.root.meaning}</div>
          {quiz.root.origin && <div className="text-dim">语源：{quiz.root.origin}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            {quiz.root.examples.slice(0, 6).map((ex) => (
              <span key={ex} className="border-2 border-edge px-1.5 py-0.5 text-dim">
                {ex}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
