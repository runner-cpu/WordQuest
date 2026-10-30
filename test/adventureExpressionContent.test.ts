import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURE_SCENE_IDS } from '../src/data/adventureIds.ts'
import { ADVENTURE_EXPRESSIONS, getSceneExpressions } from '../src/data/adventureExpressions.ts'

test('expression content: 九个情景各有两道迁移表达题，id完整且唯一', () => {
  assert.equal(ADVENTURE_EXPRESSIONS.length, 18)
  const expectedIds = ADVENTURE_SCENE_IDS.flatMap((sceneId) => [`${sceneId}-say-1`, `${sceneId}-say-2`])
  assert.deepEqual(ADVENTURE_EXPRESSIONS.map((item) => item.id), expectedIds)
  assert.equal(new Set(ADVENTURE_EXPRESSIONS.map((item) => item.id)).size, 18)
  for (const sceneId of ADVENTURE_SCENE_IDS) {
    assert.deepEqual(getSceneExpressions(sceneId).map((item) => item.id), [`${sceneId}-say-1`, `${sceneId}-say-2`])
    assert.ok(getSceneExpressions(sceneId).every((item) => item.sceneId === sceneId))
  }
  assert.deepEqual(getSceneExpressions('unknown-scene'), [])
})

test('expression content: 题干、提示、解析提供中文支持，空白前后保留自然间隔', () => {
  for (const item of ADVENTURE_EXPRESSIONS) {
    for (const value of [item.prompt, item.hint, item.explanation]) {
      assert.ok(value.trim(), item.id)
      assert.match(value, /[\u4e00-\u9fff]/u, item.id)
    }
    assert.ok(item.before.trim() && item.after.trim(), item.id)
    assert.match(item.before, / $/u, `${item.id} 空白前需要空格`)
    assert.match(item.after, /^ /u, `${item.id} 空白后需要空格`)
    assert.doesNotMatch(item.before + item.after, /_{2,}/u, `${item.id} 只由UI插入一个空白`)
    assert.match(item.before + item.referenceAnswer + item.after, /^[A-Z].+[?.]$/u, `${item.id} 参考句应为完整句子`)
  }
})

test('expression content: 每题有可接受变体，参考答案在列表中且输入限定1-5个英文词', () => {
  for (const item of ADVENTURE_EXPRESSIONS) {
    assert.ok(item.acceptedAnswers.length >= 2, `${item.id} 应接受常见合理变体`)
    assert.ok(item.acceptedAnswers.includes(item.referenceAnswer), item.id)
    assert.equal(new Set(item.acceptedAnswers.map((answer) => answer.trim().toLowerCase())).size, item.acceptedAnswers.length, item.id)
    for (const answer of item.acceptedAnswers) {
      assert.equal(answer, answer.trim(), item.id)
      assert.match(answer, /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,4}$/iu, `${item.id}: ${answer}`)
    }
  }
})
