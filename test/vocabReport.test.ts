import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateKeyOffset } from '../src/db/database.ts'
import { effectiveDayStreak, vocabularyFrequencyBands } from '../src/core/vocabReport.ts'

const now = new Date(2026, 10, 25, 0, 30).getTime()
const log = (offset: number, effectiveDay = true) => ({ date: dateKeyOffset(offset, new Date(now)), effectiveDay })

test('effective streak allows today in progress, stops at a completed gap and ignores future records', () => {
  assert.equal(effectiveDayStreak([], now), 0)
  assert.equal(effectiveDayStreak([log(-1), log(-2), log(-4), log(1)], now), 2)
  assert.equal(effectiveDayStreak([log(0), log(-1), log(-2), log(-2)], now), 3)
  assert.equal(effectiveDayStreak([log(0, false), log(-1, false), log(-2)], now), 0)
})

test('effective streak retains more than 400 days and follows local calendar boundaries', () => {
  const rows = Array.from({ length: 500 }, (_, index) => log(-index))
  assert.equal(effectiveDayStreak(rows, now), 500)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  assert.equal(effectiveDayStreak(rows, tomorrow.getTime()), 500)
  tomorrow.setDate(tomorrow.getDate() + 1)
  assert.equal(effectiveDayStreak(rows, tomorrow.getTime()), 0)
})

test('frequency bands preserve migration metadata and prefer downloaded metadata', () => {
  assert.deepEqual(vocabularyFrequencyBands(['local', 'cached', 'unknown'],
    [{ id: 'local', difficultyWeight: 1 }, undefined], { local: 1.6, cached: 1.3 }),
  { easy: 1, mid: 1, hard: 0, unknown: 1 })
})

test('frequency bands count each learned word once and keep missing or invalid metadata explicit', () => {
  assert.deepEqual(vocabularyFrequencyBands(['hard', 'hard', 'invalid', 'missing'], [], { hard: 1.6, invalid: NaN }),
    { easy: 0, mid: 0, hard: 1, unknown: 2 })
  assert.deepEqual(vocabularyFrequencyBands([], []), { easy: 0, mid: 0, hard: 0, unknown: 0 })
})
