import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Transaction } from 'dexie'
import { db, migrateVocabularyProgress, migrateWordDifficultyMetadata, SCHEMA_VERSION } from '../src/db/database.ts'
import { defaultProfile, setFamiliarWord } from '../src/core/profile.ts'
import { countProductionCorrect, DEFAULT_DAILY_NEW_TARGET, isFamiliar, mergeFamiliarWords } from '../src/core/vocabProgress.ts'
import { emptySnapshot } from '../src/core/fsrs.ts'
import type { Profile, ReviewLog, UserWordStat, Word } from '../src/types/model.ts'

const log = (mode: ReviewLog['mode'], correct = true, nearMiss = false): ReviewLog => ({
  id: `${mode}-${correct}-${nearMiss}`, wordId: 'ability', rating: correct ? 3 : 1,
  reviewedAt: 100, deviceId: 'test', elapsedMs: 1000, mode, correct,
  ...(nearMiss ? { nearMiss: true } : {}),
})

test('production evidence counts exact successful spelling, excluding choices, wrong answers and near misses', () => {
  assert.equal(countProductionCorrect([
    log('choice-word'), log('choice-meaning'), log('listen-meaning'), log('new-card'),
    log('spell', false), log('listen-spell', false), log('spell', true, true),
    log('spell'), log('listen-spell'),
  ]), 2)
  assert.equal(DEFAULT_DAILY_NEW_TARGET, 10)
  assert.equal(defaultProfile().dailyNewTarget, 10)
})

test('familiar flags merge independently per word and a restoration survives stale or tied backup flags', () => {
  const local = { ability: { excluded: false, updatedAt: 200 }, absent: { excluded: true, updatedAt: 100 } }
  const incoming = { ability: { excluded: true, updatedAt: 100 }, extra: { excluded: true, updatedAt: 300 } }
  const merged = mergeFamiliarWords(local, incoming)
  assert.equal(isFamiliar({ familiarWords: merged }, 'ability'), false)
  assert.equal(isFamiliar({ familiarWords: merged }, 'absent'), true)
  assert.equal(isFamiliar({ familiarWords: merged }, 'extra'), true)
  assert.deepEqual(mergeFamiliarWords(merged, incoming), merged)
  assert.deepEqual(mergeFamiliarWords(local, { ability: { excluded: true, updatedAt: 200 } }), local)
  assert.deepEqual(mergeFamiliarWords(local, { invalid: { excluded: 'true', updatedAt: -1 } }), local)
  assert.equal(isFamiliar(undefined, 'ability'), false)
})

test('familiar marking and recovery share the profile write transaction without changing learning or rewards', async (t) => {
  let profile = { ...defaultProfile(), xp: 90, coins: 7, dailyNewTarget: 40 }
  let writes = 0
  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (next) => { profile = structuredClone(next); writes++; return next.id })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    profile.familiarWords = { ...profile.familiarWords, other: { excluded: true, updatedAt: 50 } }
    return (args[args.length - 1] as () => Promise<unknown>)()
  })
  t.mock.method(db.stats, 'put', () => { throw new Error('familiar marking must retain FSRS') })
  t.mock.method(db.reviewLogs, 'add', () => { throw new Error('familiar marking must not invent reviews') })
  const marked = await setFamiliarWord('ability', true)
  const restored = await setFamiliarWord('ability', false)
  assert.equal(isFamiliar(marked, 'ability'), true)
  assert.equal(isFamiliar(restored, 'ability'), false)
  assert.equal(isFamiliar(restored, 'other'), true)
  assert.ok(restored.familiarWords!.ability.updatedAt > marked.familiarWords!.ability.updatedAt)
  assert.equal(restored.xp, 90)
  assert.equal(restored.coins, 7)
  assert.equal(restored.dailyNewTarget, 40)
  assert.equal(writes, 2)
})

test('schema9 migration derives evidence from all logs while preserving FSRS snapshots, rewards and peak', async () => {
  const snapshot = { ...emptySnapshot(100), reps: 3, state: 2, scheduled_days: 30, stability: 30 }
  const stats: UserWordStat[] = ['ability', 'choice-only', 'no-log'].map((wordId) => ({
    wordId, fsrs: { ...snapshot }, state: 'mastered', mistakeCount: 1, correctCount: 3,
    firstSeenAt: 100, lastReviewedAt: 500, productionCorrectCount: 99,
  }))
  const reviews = [log('spell'), { ...log('choice-word'), wordId: 'choice-only' },
    { ...log('choice-meaning'), wordId: 'choice-only' }]
  const profile: Profile = { ...defaultProfile(), xp: 123, coins: 45, power: 3, powerPeak: 2000,
    rankId: 'b2', cetRewardProgress: {}, ownedThemes: ['night', 'paper'], schemaVersion: 8 }
  let stored: UserWordStat[] = []
  const words: Word[] = [{ id: 'ability', word: 'ability', definition: '能力', bookId: 'cet4-core',
    unitId: 1, freqRank: 1, difficultyWeight: 1 }]
  const tables = {
    stats: { toArray: async () => stats, bulkPut: async (next: UserWordStat[]) => { stored = structuredClone(next) } },
    reviewLogs: { toArray: async () => reviews },
    words: { bulkGet: async (ids: string[]) => ids.map(id => words.find(w => w.id === id)) },
    profile: { toCollection: () => ({ modify: async (update: (p: Profile) => void) => update(profile) }) },
  }
  await migrateVocabularyProgress({ table: (name: keyof typeof tables) => tables[name] } as unknown as Transaction)
  for (const stat of stored) assert.deepEqual(stat.fsrs, snapshot)
  assert.equal(stored[0].productionCorrectCount, 1)
  assert.equal(stored[0].state, 'mastered')
  assert.equal(stored[1].productionCorrectCount, 0)
  assert.equal(stored[1].state, 'review')
  assert.equal(stored[2].productionCorrectCount, 0)
  assert.equal(stored[2].state, 'review')
  assert.equal(profile.power, 1)
  assert.equal(profile.powerPeak, 2000)
  assert.equal(profile.rankId, 'b2')
  assert.equal(profile.xp, 123)
  assert.equal(profile.coins, 45)
  assert.deepEqual(profile.cetRewardProgress, {})
  assert.deepEqual(profile.ownedThemes, ['night', 'paper'])
  assert.equal(profile.schemaVersion, 9)
})

test('schema12 migration only advances the version while keeping difficulty metadata absent or intact', async () => {
  const profiles: Profile[] = [
    { ...defaultProfile(), schemaVersion: 11, xp: 123, coins: 45, power: 3, powerPeak: 2000,
      familiarWords: { ability: { excluded: true, updatedAt: 100 } } },
    { ...defaultProfile(), schemaVersion: 11, wordDifficultyWeights: { ability: 1, absent: 1.3 } },
  ]
  const before = structuredClone(profiles)
  const transaction = { table: (name: string) => {
    assert.equal(name, 'profile', 'upgrade must not touch FSRS, review logs or other tables')
    return { toCollection: () => ({ modify: async (update: (profile: Profile) => void) => profiles.forEach(update) }) }
  } } as unknown as Transaction
  await migrateWordDifficultyMetadata(transaction)
  assert.equal(SCHEMA_VERSION, 12)
  assert.equal(db.verno, 12)
  assert.deepEqual(profiles, before.map((profile) => ({ ...profile, schemaVersion: 12 })))
  assert.equal(Object.prototype.hasOwnProperty.call(profiles[0], 'wordDifficultyWeights'), false)
})

test('schema9 upgrade does not inflate a legacy peak when learned words have no local dictionary entries', async () => {
  const snapshot = { ...emptySnapshot(100), reps: 3, state: 2, scheduled_days: 30, stability: 30 }
  const stats: UserWordStat[] = ['ability', 'absent'].map(wordId => ({ wordId, fsrs: { ...snapshot },
    state: 'mastered', mistakeCount: 0, correctCount: 3, firstSeenAt: 100, lastReviewedAt: 500 }))
  const profile: Profile = { ...defaultProfile(), schemaVersion: 8, power: 2, powerPeak: 2, xp: 40, coins: 8 }
  let saved: UserWordStat[] = []
  const tables = {
    stats: { toArray: async () => stats, bulkPut: async (next: UserWordStat[]) => { saved = structuredClone(next) } },
    reviewLogs: { toArray: async () => stats.map(stat => ({ ...log('spell'), id: stat.wordId, wordId: stat.wordId })) },
    words: { bulkGet: async () => stats.map(() => undefined) },
    profile: { toCollection: () => ({ modify: async (update: (value: Profile) => void) => update(profile) }) },
  }
  await migrateVocabularyProgress({ table: (name: keyof typeof tables) => tables[name] } as unknown as Transaction)
  assert.equal(profile.power, 2)
  assert.equal(profile.powerPeak, 2)
  assert.equal(profile.xp, 40)
  assert.equal(profile.coins, 8)
  assert.deepEqual(saved.map(stat => stat.fsrs), stats.map(stat => stat.fsrs))
})
