import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURE_SCENES } from '../src/data/adventures.ts'
import { ADVENTURE_SCENE_IDS } from '../src/data/adventureIds.ts'

test('adventure content: 九个原创情景按三章各自从A2递进到B2', () => {
  assert.equal(ADVENTURE_SCENES.length, 9)
  assert.deepEqual(ADVENTURE_SCENES.map((scene) => scene.id), [...ADVENTURE_SCENE_IDS])
  const chapters = [...new Set(ADVENTURE_SCENES.map((scene) => scene.chapter))]
  assert.deepEqual(chapters, ['校园', '城市旅行', '工作观点'])
  for (const chapter of chapters) {
    assert.deepEqual(ADVENTURE_SCENES.filter((scene) => scene.chapter === chapter).map((scene) => scene.level), ['A2', 'B1', 'B2'])
  }
})

test('adventure content: 场景及题目id全局唯一，必要内容非空', () => {
  const ids = new Set<string>()
  for (const scene of ADVENTURE_SCENES) {
    assert.ok(scene.id.trim())
    assert.ok(!ids.has(scene.id), `重复场景id：${scene.id}`)
    ids.add(scene.id)
    for (const value of [scene.title, scene.chapter, scene.goal, scene.intro]) assert.ok(value.trim(), scene.id)
    for (const question of scene.questions) {
      assert.ok(question.id.trim())
      assert.ok(!ids.has(question.id), `重复题目id：${question.id}`)
      ids.add(question.id)
      assert.ok(question.prompt.trim(), question.id)
      assert.ok(question.explanation.trim(), question.id)
      assert.match(question.explanation, /[\u4e00-\u9fff]/u, `解析须有中文：${question.id}`)
    }
  }
})

test('adventure content: 对话4-6轮、50-110英语词，每场恰有4个词汇提示', () => {
  for (const scene of ADVENTURE_SCENES) {
    assert.ok(scene.dialogue.length >= 4 && scene.dialogue.length <= 6, scene.id)
    const wordCount = scene.dialogue.reduce((sum, line) => {
      assert.ok(line.speaker.trim() && line.en.trim() && line.zh.trim(), scene.id)
      return sum + (line.en.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu)?.length ?? 0)
    }, 0)
    assert.ok(wordCount >= 50 && wordCount <= 110, `${scene.id}：${wordCount}词`)
    assert.equal(scene.vocabulary.length, 4, scene.id)
    assert.equal(new Set(scene.vocabulary.map((item) => item.word.toLowerCase())).size, 4, scene.id)
    for (const item of scene.vocabulary) assert.ok(item.word.trim() && item.meaning.trim(), scene.id)
  }
})

test('adventure content: 每场三题覆盖理解、推断、表达，均为有效四选一', () => {
  for (const scene of ADVENTURE_SCENES) {
    assert.equal(scene.questions.length, 3, scene.id)
    assert.deepEqual(scene.questions.map((question) => question.skill), ['meaning', 'inference', 'expression'], scene.id)
    for (const question of scene.questions) {
      assert.equal(question.options.length, 4, question.id)
      assert.equal(new Set(question.options.map((option) => option.trim().toLowerCase())).size, 4, question.id)
      assert.ok(question.options.every((option) => option.trim()), question.id)
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, question.id)
      assert.match(question.prompt, /[\u4e00-\u9fff]/u, `题干须有中文：${question.id}`)
    }
  }
})

test('adventure content: 27题正确答案位置均匀分布', () => {
  const counts = [0, 0, 0, 0]
  for (const scene of ADVENTURE_SCENES) {
    for (const question of scene.questions) counts[question.answer]++
  }
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 27)
  assert.ok(counts.every((count) => count >= 6), `分布：${counts.join('/')}`)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `分布：${counts.join('/')}`)
})
