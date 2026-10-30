/**
 * 词根练习题生成。
 *
 * 数据来自 ECDICT wordroot（611 条，187 条有 ≥4 个本地例词可出题）。
 * 两种题型：
 *   1. 看词根猜词义 —— 显示词根与一个例词，从 4 个词根释义中选正确的
 *   2. 看词选词根 —— 显示一个可拆解的词，从 4 个词根中选出它包含的
 *
 * 干扰项从其他词根的释义/形式里取，长度与语义距离尽量接近。
 */
import type { RootEntry } from './roots'

export type RootQuizKind = 'guess-meaning' | 'pick-root'

export interface RootQuiz {
  kind: RootQuizKind
  /** 题面：词根形式（guess-meaning）或单词（pick-root） */
  prompt: string
  /** 例词（guess-meaning 时帮助理解语境） */
  exampleWord?: string
  choices: string[]
  answer: string
  /** 答对后展示的完整信息 */
  root: RootEntry
}

/** crypto 随机整数 [0, n) —— 题目随机虽非加密场景，但统一用 crypto 源避免误用 */
function randInt(n: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}

function pick<T>(arr: T[], exclude: Set<string>, n: number): T[] {
  const out: T[] = []
  const copy = [...arr]
  while (copy.length > 0 && out.length < n) {
    const item = copy.splice(randInt(copy.length), 1)[0]
    const key = typeof item === 'string' ? item : JSON.stringify(item)
    if (exclude.has(key)) continue
    exclude.add(key)
    out.push(item)
  }
  return out
}

export function buildRootQuiz(
  roots: RootEntry[],
  index: Record<string, string[]>,
  words: string[],
  kind: RootQuizKind,
): RootQuiz | null {
  const eligible = roots.filter((r) => r.examples.length >= 2)
  if (eligible.length < 4) return null

  const root = eligible[randInt(eligible.length)]

  if (kind === 'guess-meaning') {
    // 题面：词根 + 一个含它的例词
    const exampleWord = root.examples[randInt(root.examples.length)]
    const others = pick(
      eligible.filter((r) => r.id !== root.id),
      new Set(),
      3,
    )
    return {
      kind,
      prompt: root.form,
      exampleWord,
      choices: [root.meaning, ...others.map((r) => r.meaning)],
      answer: root.meaning,
      root,
    }
  }

  // pick-root：找一个包含该词根的词
  const wordsWithRoot = words.filter((w) => (index[w] ?? []).includes(root.id))
  if (wordsWithRoot.length === 0) return null
  const word = wordsWithRoot[randInt(wordsWithRoot.length)]
  const others = pick(
    eligible.filter((r) => r.id !== root.id),
    new Set(),
    3,
  )
  return {
    kind,
    prompt: word,
    choices: [root.form, ...others.map((r) => r.form)],
    answer: root.form,
    root,
  }
}
