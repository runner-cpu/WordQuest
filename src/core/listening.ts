/**
 * 听力题目生成。
 *
 * 设计取向：整句默写对多数人是劝退式训练，一句话十几个词，错一个就算错，
 * 反馈也不聚焦。这里以三种低摩擦题型为主：
 *
 *   1. 选词填空  听句子，从 4 个词里选出被挖掉的那个（最常用）
 *   2. 听音选义  听句子，选出这句话的中文意思
 *   3. 词序排列  听句子，把打乱的词块排回正确顺序
 *   4. 整句听写  保留但作为高阶选项，默认不出现
 *
 * 每题只针对一个「考点」，答完能立刻知道错在哪个词。
 */

export type ListenKind = 'blank' | 'meaning' | 'order' | 'dictation'

export interface ListenQuestion {
  kind: ListenKind
  /** 完整原句 */
  text: string
  /** 中文翻译（内置材料才有） */
  zh?: string
  /** blank 模式：被挖掉的词 */
  target?: string
  /** blank 模式的 4 个选项 */
  choices?: string[]
  /** order 模式：打乱后的词块 */
  shuffled?: string[]
  /** meaning 模式的 4 个选项 */
  meaningChoices?: string[]
}

/** 从候选词里稳定地挑一个（同一句每次进来挖同一个词） */
function pickTarget(text: string, seed: number): string | null {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ''))
    .filter((w) => w.length >= 4)
  if (words.length === 0) return null
  // 优先挑实词（长度 >= 5），让考点更有意义
  const preferred = words.filter((w) => w.length >= 5)
  const pool = preferred.length > 0 ? preferred : words
  return pool[seed % pool.length]
}

function shuffleStable<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed || 1
  for (let i = a.length - 1; i > 0; i--) {
    // 线性同余，保证同一 seed 得到同一顺序
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 干扰项：从同一批材料里取其他词，长度接近，避免一眼看出。
 *
 * 必须排除「原句里已经出现的词」：否则题目会变成
 * 「The first week ... is a_____ busy.」而选项里有 first，
 * 学生看到 first 在句子里已经出现过，就能直接排除，题目失去意义。
 */
function distractors(target: string, pool: string[], seed: number, sentenceText: string, n = 3): string[] {
  const inSentence = new Set(
    sentenceText
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z']/g, ''))
      .filter(Boolean),
  )
  const candidates = pool
    .map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ''))
    .filter(
      (w) => w.length >= 3 && w.toLowerCase() !== target.toLowerCase() && !inSentence.has(w.toLowerCase()),
    )
  // 按长度接近程度排序，再取前若干个打乱
  candidates.sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length))
  const near = candidates.slice(0, 12)
  const picked: string[] = []
  const seen = new Set([target.toLowerCase()])
  for (const w of shuffleStable(near, seed)) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(w)
    if (picked.length >= n) break
  }
  return picked
}

export interface BuildOptions {
  /** 允许出现整句听写（默认关闭） */
  allowDictation?: boolean
  /** 该材料所有句子的词，用于生成干扰项 */
  wordPool?: string[]
  /** 该材料所有句子的中文，用于生成听音选义的干扰项 */
  zhPool?: string[]
}

/**
 * 为第 index 句生成题目。
 * 题型按序号轮换，保证一轮里三种题型都出现，不会连着做同一种。
 */
export function buildListenQuestion(
  sentence: { text: string; zh?: string },
  index: number,
  opts: BuildOptions = {},
): ListenQuestion {
  const seed = index * 7919 + sentence.text.length
  const pool = opts.wordPool ?? sentence.text.split(/\s+/)
  const target = pickTarget(sentence.text, seed)

  // 中文缺失时无法出「听音选义」，退回填空
  const canMeaning = Boolean(sentence.zh) && (opts.zhPool?.length ?? 0) >= 3
  const canOrder = sentence.text.split(/\s+/).length >= 5
  const canBlank = Boolean(target)

  const rotation: ListenKind[] = []
  if (canBlank) rotation.push('blank')
  if (canMeaning) rotation.push('meaning')
  if (canOrder) rotation.push('order')
  if (opts.allowDictation) rotation.push('dictation')
  if (rotation.length === 0) rotation.push('dictation')

  const kind = rotation[index % rotation.length]

  if (kind === 'blank' && target) {
    const others = distractors(target, pool, seed, sentence.text)
    return {
      kind,
      text: sentence.text,
      zh: sentence.zh,
      target,
      choices: shuffleStable([target, ...others], seed + 13),
    }
  }

  if (kind === 'meaning' && sentence.zh) {
    const others = shuffleStable(
      (opts.zhPool ?? []).filter((z) => z !== sentence.zh),
      seed + 29,
    ).slice(0, 3)
    return {
      kind,
      text: sentence.text,
      zh: sentence.zh,
      meaningChoices: shuffleStable([sentence.zh, ...others], seed + 41),
    }
  }

  if (kind === 'order' && canOrder) {
    const chunks = splitChunks(sentence.text)
    return {
      kind: 'order',
      text: sentence.text,
      zh: sentence.zh,
      shuffled: shuffleStable(chunks, seed + 53),
    }
  }

  return { kind: 'dictation', text: sentence.text, zh: sentence.zh }
}

/** 把句子切成 2-3 个词的词块，比单字排序更像真实练习 */
export function splitChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let i = 0
  while (i < words.length) {
    const size = words.length - i <= 2 ? words.length - i : i % 2 === 0 ? 2 : 3
    chunks.push(words.slice(i, i + size).join(' '))
    i += size
  }
  return chunks
}

/**
 * 把原句里目标词替换成下划线，保留首字母。
 *
 * replace 回调的第一个参数是「匹配到的字符串」，不是数组。早期写成 m[0]
 * 只取到了第一个字符，于是 always 变成 a_____，而选项里仍有 always，
 * 题目自相矛盾。
 */
export function maskTarget(text: string, target: string): string {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'gi')
  return text.replace(re, (match: string) => `${match[0]}${'_'.repeat(Math.max(0, match.length - 1))}`)
}

/** 判断排序答案是否正确（忽略大小写与标点） */
export function checkOrder(userOrder: string[], correctText: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  return norm(userOrder.join(' ')) === norm(correctText)
}
