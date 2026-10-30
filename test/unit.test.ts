/**
 * 纯函数单元测试（Node 内置 test runner）。
 *
 * 覆盖最核心的纯逻辑：FSRS 包装、题目生成、真题解析器、听力工具函数。
 * 运行：npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------- FSRS 包装 ----------

test('schedule: 答错后 due 不应晚于答对', async () => {
  const { schedule, emptySnapshot } = await import('../src/core/fsrs.ts')
  const now = Date.now()
  const snap = emptySnapshot(now)
  const again = schedule(snap, 1, now)
  const good = schedule(snap, 3, now)
  assert.ok(again.due <= good.due, `again(${again.due}) 应早于 good(${good.due})`)
})

test('deriveState: reps=0 为 new，长间隔为 mastered', async () => {
  const { deriveState } = await import('../src/core/fsrs.ts')
  const now = Date.now()
  assert.equal(deriveState({ due: now, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0 }), 'new')
  assert.equal(
    deriveState({ due: now + 30 * 86400000, stability: 40, difficulty: 5, elapsed_days: 5, scheduled_days: 30, reps: 3, lapses: 0, state: 2 }),
    'mastered',
  )
})

test('autoRating: 答错必为 Again，秒答为 Easy', async () => {
  const { autoRating } = await import('../src/core/fsrs.ts')
  assert.equal(autoRating({ correct: false, elapsedMs: 1000, mode: 'spell' }), 1)
  assert.equal(autoRating({ correct: true, elapsedMs: 1000, mode: 'spell' }), 4)
  assert.equal(autoRating({ correct: true, elapsedMs: 30000, mode: 'spell' }), 3)
})

// ---------- 真题解析器 ----------

const SAMPLE = `# 标题: 测试卷
# 级别: CET-6
# 部分: Section B 长对话

[材料]
Stem text here.

[题目]
What is it?
A) One
B) Two
C) Three
D) Four
答案: C
解析: 考点。

[题目]
Second question?
A) Alpha
B) Beta
C) Gamma
D) Delta
答案: A`

test('parseExamText: 正常解析两题共用一组材料', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const res = parseExamText(SAMPLE)
  assert.ok(res.ok)
  assert.equal(res.pack!.items.length, 2)
  assert.equal(res.pack!.items[0].group, res.pack!.items[1].group, '两题应共用一组')
  assert.equal(res.pack!.items[0].answer, 2)
  assert.equal(res.pack!.items[1].answer, 0)
  assert.equal(res.pack!.items[0].explain, '考点。')
})

test('parseExamText: 缺答案时报错', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const res = parseExamText(SAMPLE.replace('答案: A', ''))
  assert.ok(!res.ok)
  assert.ok(res.errors.some((e) => e.includes('答案')))
})

test('parseExamText: 选项只有三个时报错', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const res = parseExamText(SAMPLE.replace('D) Delta\n', ''))
  assert.ok(!res.ok)
  assert.ok(res.errors.some((e) => e.includes('选项')))
})

test('parseExamText: 材料前的题目报错而非死循环', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const broken = `# 标题: 坏卷

[题目]
Orphan question?
A) One
B) Two
C) Three
D) Four
答案: A`
  const res = parseExamText(broken)
  assert.ok(!res.ok || res.pack!.items.length === 0)
})

test('parseExamText: 小写选项与答案（Word 粘贴场景）', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const res = parseExamText(SAMPLE.replace(/([A-D])\)/g, (s) => `${s.toLowerCase()}`).replace('答案: C', '答案: c'))
  assert.ok(res.ok, res.ok ? '' : res.errors.join('；'))
  assert.equal(res.pack!.items[0].answer, 2)
})

test('parseExamText: CRLF 行尾（Windows 记事本）', async () => {
  const { parseExamText } = await import('../src/core/examImport.ts')
  const res = parseExamText(SAMPLE.replace(/\n/g, '\r\n'))
  assert.ok(res.ok, res.ok ? '' : res.errors.join('；'))
  assert.equal(res.pack!.items[0].options![0].length > 0, true)
  assert.equal(res.pack!.items.length, 2)
})

// ---------- 听力纯函数 ----------

test('maskTarget: 保留首字母遮住其余，不遮句中其他词', async () => {
  const { maskTarget } = await import('../src/core/listening.ts')
  const out = maskTarget('She always smiles.', 'always')
  assert.equal(out, 'She a_____ smiles.', `实际：${out}`)
})

test('checkOrder: 用户重排的块拼回原句才通过', async () => {
  const { checkOrder } = await import('../src/core/listening.ts')
  assert.ok(checkOrder(['sat', 'the', 'cat'], 'sat the cat'))
  assert.ok(!checkOrder(['the', 'cat', 'sat'], 'sat the cat'))
  assert.ok(!checkOrder(['the', 'cat', 'sat'], 'the cat ran'))
})

test('splitChunks: 按语义切块', async () => {
  const { splitChunks } = await import('../src/core/listening.ts')
  const chunks = splitChunks('The quick brown fox.')
  assert.ok(chunks.length >= 1)
  assert.ok(chunks.join('').length >= 15)
})

// ---------- 题目生成 ----------

test('buildQuestion: choice-word 的选项含正确答案且无重复', async () => {
  const { buildQuestion } = await import('../src/core/session.ts')
  const word = { id: 'ability', word: 'ability', definition: 'n. 能力', freqRank: 100, difficultyWeight: 1, bookId: 'cet4-core', unitId: 1, phonetic: '', pos: '' }
  const pool = [
    word,
    { ...word, id: 'abandon', word: 'abandon', definition: 'vt. 放弃', freqRank: 124 },
    { ...word, id: 'absence', word: 'absence', definition: 'n. 缺席', freqRank: 130 },
    { ...word, id: 'absolute', word: 'absolute', definition: 'a. 绝对的', freqRank: 140 },
    { ...word, id: 'academic', word: 'academic', definition: 'a. 学术的', freqRank: 150 },
  ]
  const q = buildQuestion(word, 'choice-word', pool, false)
  assert.equal(q.options!.length, 4)
  assert.ok(q.options!.includes(q.answer))
  assert.equal(new Set(q.options).size, 4, '选项不应重复')
})

test('buildQuestion: knownWords 优先进入干扰项', async () => {
  const { buildQuestion } = await import('../src/core/session.ts')
  const word = { id: 'ability', word: 'ability', definition: 'n. 能力', freqRank: 100, difficultyWeight: 1, bookId: 'cet4-core', unitId: 1, phonetic: '', pos: '' }
  const known = [
    { ...word, id: 'known1', word: 'known1', definition: 'x', freqRank: 101 },
    { ...word, id: 'known2', word: 'known2', definition: 'x', freqRank: 102 },
  ]
  const pool = [word, ...known, { ...word, id: 'fresh1', word: 'fresh1', definition: 'x', freqRank: 103 }]
  const q = buildQuestion(word, 'choice-meaning', pool, true, undefined, known)
  const knownInOpts = q.options!.filter((o) => known.some((k) => k.word === o))
  assert.ok(knownInOpts.length >= 1, `学过的词应优先进干扰项，实际选项：${q.options}`)
})
