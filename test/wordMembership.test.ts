import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  completeBookUnits,
  mergeWordMembership,
  removeWordBook,
  wordBookUnits,
  wordForBook,
  wordInBooks,
} from '../src/core/wordMembership.ts'
import type { Word } from '../src/types/model.ts'

const legacy: Word = {
  id: 'example', word: 'example', definition: '例子', bookId: 'cet4-core',
  unitId: 2, freqRank: 200, difficultyWeight: 1,
}

test('旧词条兼容，重叠词下载保留全局 id 和各书独立单元', () => {
  assert.equal(wordInBooks(legacy, ['cet4-core']), true)
  const merged = mergeWordMembership(legacy, { ...legacy, bookId: 'cet4-full', unitId: 8 })
  assert.equal(merged.id, legacy.id)
  assert.deepEqual(wordBookUnits(merged), { 'cet4-core': 2, 'cet4-full': 8 })
  assert.equal(wordForBook(merged, 'cet4-core').unitId, 2)
  assert.equal(wordForBook(merged, 'cet4-full').unitId, 8)
  assert.equal(wordInBooks(merged, ['cet4-full']), true)
  assert.deepEqual(wordBookUnits(legacy), { 'cet4-core': 2 })
})

test('词表修订只移除目标书归属，原词和其他书归属仍保留', () => {
  const merged = mergeWordMembership(legacy, { ...legacy, bookId: 'cet4-full', unitId: 8 })
  const removed = removeWordBook(merged, 'cet4-core')
  assert.equal(removed.id, legacy.id)
  assert.equal(wordInBooks(removed, ['cet4-core']), false)
  assert.equal(wordInBooks(removed, ['cet4-full']), true)
  const orphan = removeWordBook(removed, 'cet4-full')
  assert.equal(orphan.word, legacy.word)
  assert.equal(wordInBooks(orphan, ['cet4-core', 'cet4-full']), false)
  const restored = mergeWordMembership(orphan, { ...legacy, unitId: 3 })
  assert.deepEqual(wordBookUnits(restored), { 'cet4-core': 3 })
})

test('单元完整性按恢复后的词条数量判断，部分单元仍需补齐', () => {
  const words = [legacy, { ...legacy, id: 'other' }]
  const units = [{ unitId: 2, count: 2 }, { unitId: 3, count: 1 }]
  assert.deepEqual(completeBookUnits(words, 'cet4-core', units), [2])
  assert.deepEqual(completeBookUnits(words.slice(0, 1), 'cet4-core', units), [])
  assert.deepEqual(completeBookUnits(words, 'cet4-full', units), [])
})

test('实际四级核心词和全本顺序下载后，两个词书都保持完整', () => {
  const store = new Map<string, Word>()
  const base = new URL('../public/data/books/', import.meta.url)
  for (const bookId of ['cet4-core', 'cet4-full'] as const) {
    const index = JSON.parse(readFileSync(new URL(`${bookId}/index.json`, base), 'utf8'))
    for (const unit of index.units) {
      const payload = JSON.parse(readFileSync(new URL(`${bookId}/${unit.file}`, base), 'utf8'))
      for (const word of payload.words as Word[]) store.set(word.id, mergeWordMembership(store.get(word.id), word))
    }
  }
  const words = [...store.values()]
  assert.equal(words.filter((word) => wordInBooks(word, ['cet4-core'])).length, 1200)
  assert.equal(words.filter((word) => wordInBooks(word, ['cet4-full'])).length, 3837)
  assert.equal(store.size, 3837)
})
