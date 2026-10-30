import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CET_PRACTICES, type CetLevel, type CetPracticeKind } from '../src/data/cetPractice.ts'

function englishWords(text: string): number {
  return text.match(/[A-Za-z]+(?:['’\u002d][A-Za-z]+)*/gu)?.length ?? 0
}

test('CET content: 两级三种专项各两项，固定id唯一且基础元数据完整', () => {
  assert.equal(CET_PRACTICES.length, 12)
  assert.equal(new Set(CET_PRACTICES.map((item) => item.id)).size, 12)
  for (const examType of ['cet4', 'cet6'] satisfies CetLevel[]) {
    for (const kind of ['reading', 'writing', 'translation'] satisfies CetPracticeKind[]) {
      const items = CET_PRACTICES.filter((item) => item.examType === examType && item.kind === kind)
      assert.deepEqual(items.map((item) => item.id), [`${examType}-${kind}-1`, `${examType}-${kind}-2`])
    }
  }
  for (const item of CET_PRACTICES) {
    assert.ok(item.title.trim(), item.id)
    assert.ok(Number.isInteger(item.minutes) && item.minutes > 0 && item.minutes <= 30, item.id)
    assert.ok(item.focus.includes('原创'), `${item.id} 应标记原创练习`)
  }
})

test('CET reading: 每篇4段180-260英语词，3题唯一且有逐字证据与中文解析', () => {
  const ids = new Set<string>()
  const answerPositions = [0, 0, 0, 0]
  for (const item of CET_PRACTICES) {
    if (item.kind !== 'reading') continue
    assert.equal(item.passage.length, 4, item.id)
    assert.ok(item.passage.every((paragraph) => paragraph.trim().length > 0), item.id)
    const fullText = item.passage.join('\n')
    const count = englishWords(fullText)
    assert.ok(count >= 180 && count <= 260, `${item.id}: ${count}词`)
    assert.equal(item.questions.length, 3, item.id)
    for (const question of item.questions) {
      assert.ok(question.id.startsWith(`${item.id}-`), question.id)
      assert.ok(!ids.has(question.id), question.id)
      ids.add(question.id)
      assert.ok(question.prompt.trim() && question.skill.trim(), question.id)
      assert.equal(question.options.length, 4, question.id)
      assert.equal(new Set(question.options).size, 4, question.id)
      assert.ok(question.options.every((option) => option.trim()), question.id)
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, question.id)
      answerPositions[question.answer]++
      assert.ok(question.evidence.trim() && item.passage.some((paragraph) => paragraph.includes(question.evidence)), `${question.id} 证据须逐字来自原文`)
      assert.match(question.evidence, /[.!?]$/u, `${question.id} 证据须为完整句`)
      assert.match(question.explanation, /[\u4e00-\u9fff]/u, question.id)
    }
  }
  assert.equal(ids.size, 12)
  assert.deepEqual(answerPositions, [3, 3, 3, 3], '正确选项位置应均匀分散')
})

test('CET output: 参考、思路、注意事项完整，每题恰有3条操作性自评', () => {
  for (const item of CET_PRACTICES) {
    if (item.kind === 'reading') continue
    assert.ok(item.prompt.trim() && item.reference.trim(), item.id)
    assert.ok(item.outline.length >= 3 && item.outline.every((line) => line.trim()), item.id)
    assert.ok(item.notes.length >= 2 && item.notes.every((line) => line.trim()), item.id)
    assert.equal(item.checklist.length, 3, item.id)
    assert.equal(new Set(item.checklist).size, 3, item.id)
    assert.ok(item.checklist.every((line) => line.includes('是否') && line.endsWith('？')), item.id)
    assert.ok(item.wordRange[0] > 0 && item.wordRange[0] < item.wordRange[1], item.id)
    const count = englishWords(item.reference)
    assert.ok(count >= item.wordRange[0] && count <= item.wordRange[1], `${item.id}: ${count}参考词`)
  }
})

test('CET writing: 两级任务与范文词数分别遵循120-180和150-200', () => {
  for (const item of CET_PRACTICES) {
    if (item.kind !== 'writing') continue
    const expected = item.examType === 'cet4' ? [120, 180] : [150, 200]
    assert.deepEqual(item.wordRange, expected, item.id)
    assert.match(item.prompt, item.examType === 'cet4' ? /120[–-]180/u : /150[–-]200/u, item.id)
    assert.ok(!item.sourceText, `${item.id} 写作不应冒充汉译英`)
  }
})

test('CET translation: 中文长度按级别递进，注明译法不唯一和英文范围仅供参考', () => {
  for (const item of CET_PRACTICES) {
    if (item.kind !== 'translation') continue
    assert.ok(item.sourceText?.trim(), item.id)
    const count = item.sourceText!.match(/[\u4e00-\u9fff]/gu)?.length ?? 0
    const [minimum, maximum] = item.examType === 'cet4' ? [140, 160] : [180, 200]
    assert.ok(count >= minimum && count <= maximum, `${item.id}: ${count}个汉字`)
    assert.ok(item.notes.some((note) => note.includes('译法不唯一')), item.id)
    assert.match(item.prompt, /参考/u, item.id)
  }
})
