import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { blobToBase64, db, exportBackup, MEDIA_BACKUP_LIMIT, todayKey } from '../src/db/database.ts'
import { CET_PAPER_SOURCES } from '../src/data/cetPaperSources.ts'
import { CET_READY_PAPERS } from '../src/core/cetReadyPapers.ts'
import { importBackup, type BackupPayload } from '../src/core/backup.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { deriveState, emptySnapshot } from '../src/core/fsrs.ts'
import { claimChest } from '../src/core/progress.ts'
import type { AdventureProgress, CetPracticeRecord, CetRewardQuestionProgress, DailyQuest, ExpressionProgress, Profile, ReviewLog, UserWordStat, Word } from '../src/types/model.ts'
import type { CetPaperStudy, CetPaperSubmission } from '../src/types/cetPaper.ts'
import type { OutputRevision } from '../src/types/outputRevision.ts'
import { emptyOutputRevision } from '../src/core/outputRevision.ts'

const TABLE_KEYS = {
  words: 'id', stats: 'wordId', reviewLogs: 'id', dailyLogs: 'date', profile: 'id',
  achievements: 'id', quests: 'date', exams: 'id', media: 'id', adventures: 'sceneId', expressions: 'id', cetPractice: 'id', cetPapers: 'id',
} as const
type TableName = keyof typeof TABLE_KEYS
type Row = Record<string, unknown>
type Seed = Partial<Record<TableName, object[]>>

/** Node-only storage boundary; import/export and all merge/rebuild logic run unchanged. */
function databaseFixture(t: TestContext, initial: Seed = {}) {
  const stores = new Map<TableName, Map<string, Row>>()
  for (const name of Object.keys(TABLE_KEYS) as TableName[]) {
    const rows = new Map<string, Row>()
    stores.set(name, rows)
    const key = (row: Row) => String(row[TABLE_KEYS[name]])
    const put = async (row: Row) => {
      rows.set(key(row), structuredClone(row))
      return key(row)
    }
    const table = db[name]
    t.mock.method(table, 'get', async (id: string) => structuredClone(rows.get(id)))
    t.mock.method(table, 'put', put)
    t.mock.method(table, 'delete', async (id: string) => { rows.delete(id) })
    t.mock.method(table, 'bulkPut', async (incoming: Row[]) => {
      for (const row of incoming) await put(row)
      return incoming.length > 0 ? key(incoming[incoming.length - 1]) : undefined
    })
    t.mock.method(table, 'bulkGet', async (ids: string[]) => ids.map((id) => structuredClone(rows.get(id))))
    t.mock.method(table, 'count', async () => rows.size)
    t.mock.method(table, 'toArray', async () => structuredClone([...rows.values()]))
    t.mock.method(table, 'toCollection', () => ({ primaryKeys: async () => [...rows.keys()] }))
    t.mock.method(table, 'orderBy', (field: string) => ({
      toArray: async () => structuredClone([...rows.values()].sort((a, b) => Number(a[field]) - Number(b[field]))),
    }))
    t.mock.method(table, 'where', (field: string) => ({
      equals: (value: unknown) => ({
        toArray: async () => structuredClone([...rows.values()].filter((row) => row[field] === value)),
        primaryKeys: async () => [...rows.values()].filter((row) => row[field] === value).map(key),
      }),
    }))
    t.mock.method(table, 'filter', (predicate: (row: Row) => boolean) => ({
      count: async () => [...rows.values()].filter(predicate).length,
    }))
  }
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>
    const before = structuredClone([...stores].map(([name, rows]) => [name, [...rows]] as const))
    try {
      return await callback()
    } catch (error) {
      for (const [name, entries] of before) {
        const rows = stores.get(name)!
        rows.clear()
        for (const [id, row] of entries) rows.set(id, row)
      }
      throw error
    }
  })
  const reset = (seed: Seed) => {
    for (const [name, rows] of stores) {
      rows.clear()
      for (const row of seed[name] ?? []) {
        const value = row as Row
        rows.set(String(value[TABLE_KEYS[name]]), structuredClone(value))
      }
    }
  }
  reset(initial)
  return {
    reset,
    get: <T>(name: TableName, id: string) => stores.get(name)?.get(id) as T | undefined,
    snapshot: () => structuredClone([...stores].map(([name, rows]) => [name, [...rows.values()]])),
  }
}

function backupFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], 'wordquest-backup.json', { type: 'application/json' })
}

const word: Word = {
  id: 'ability', word: 'ability', definition: 'n. 能力', phonetic: '',
  bookId: 'cet4-full', unitId: 4, bookUnits: { 'cet4-full': 4, 'ky-core': 2 },
  freqRank: 100, difficultyWeight: 1,
}

function quest(patch: Partial<DailyQuest> = {}): DailyQuest {
  return {
    date: todayKey(), questIds: ['learn-10', 'review-10', 'listen-1min'],
    progress: [10, 10, 60], chestOpened: true, chestCount: 10, ...patch,
  }
}

function expression(patch: Partial<ExpressionProgress> = {}): ExpressionProgress {
  return {
    id: 'campus-library-say-1', sceneId: 'campus-library', attempts: 2,
    firstPracticedAt: 100, lastPracticedAt: 200, dueAt: 1793481600000,
    stage: 2, lastScheduledDate: '2026-10-30', independentDays: ['2026-10-30'],
    rewardedDates: ['2026-10-30'], lastOutcome: 'independent', ...patch,
  }
}

function cetReading(patch: Partial<CetPracticeRecord> = {}): CetPracticeRecord {
  return {
    id: 'cet4-reading-1', examType: 'cet4', kind: 'reading', draft: '', updatedAt: 300,
    firstSubmittedAt: 100, firstAnswers: [0, 1, 2], latestAnswers: [2, 1, 0],
    submittedAt: 300, completedAt: 100, attempts: 2, ...patch,
  }
}

function cetOutput(patch: Partial<CetPracticeRecord> = {}): CetPracticeRecord {
  return {
    id: 'cet6-writing-1', examType: 'cet6', kind: 'writing', draft: 'a revised draft', updatedAt: 400,
    submittedText: 'A clear explanation helps students understand a new service and make useful suggestions before the team decides how to improve it.',
    submittedAt: 300, completedAt: 100, checks: [true, true, true], attempts: 2, ...patch,
  }
}

const rewardPaper = CET_READY_PAPERS[0]
type RewardQuestion = CetRewardQuestionProgress
function rewardQuestion(patch: Partial<RewardQuestion> = {}): RewardQuestion {
  return { sourceId: rewardPaper.sourceId, paperRevision: rewardPaper.revision, number: 46,
    first: 'wrong', firstSubmittedAt: 100, last: 'correct', lastSubmittedAt: 300,
    paid: { correction: 300 }, ...patch }
}
function rewardKey(question: RewardQuestion): string {
  return `${question.sourceId}:${question.paperRevision}:${question.number}`
}

test('backup: familiar recovery flags merge on a studied device and stale backups cannot restore exclusions', async (t) => {
  const local = { ...defaultProfile(), xp: 10, dailyNewTarget: 40,
    familiarWords: { ability: { excluded: false, updatedAt: 200 } } }
  const fixture = databaseFixture(t, { profile: [local] })
  const payload: BackupPayload = { data: { reviewLogs: [], profile: [{ ...defaultProfile(),
    familiarWords: { ability: { excluded: true, updatedAt: 100 }, other: { excluded: true, updatedAt: 300 } },
  }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const restored = fixture.get<Profile>('profile', 'me')!
  assert.deepEqual(restored.familiarWords, {
    ability: { excluded: false, updatedAt: 200 }, other: { excluded: true, updatedAt: 300 },
  })
  assert.equal(restored.dailyNewTarget, 40, 'local settings remain while routing flags merge')
  const before = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), before)
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], profile: [defaultProfile()] } }))).ok, true)
  assert.deepEqual(fixture.get<Profile>('profile', 'me')!.familiarWords, restored.familiarWords)
  const exported = await exportBackup()
  fixture.reset({})
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.get<Profile>('profile', 'me')!.familiarWords, restored.familiarWords)
})

test('backup: replay derives exact production counts and rejects snapshot-only mastery evidence', async (t) => {
  const at = new Date(2026, 9, 1).getTime()
  const reviews: ReviewLog[] = [
    { id: 'choice-1', wordId: word.id, mode: 'choice-word', correct: true, rating: 4, reviewedAt: at, deviceId: 'old', elapsedMs: 1000 },
    { id: 'choice-2', wordId: word.id, mode: 'choice-meaning', correct: true, rating: 4, reviewedAt: at + 40 * 86400000, deviceId: 'old', elapsedMs: 1000 },
    { id: 'near', wordId: word.id, mode: 'spell', correct: true, nearMiss: true, rating: 2, reviewedAt: at + 41 * 86400000, deviceId: 'old', elapsedMs: 1000 },
  ]
  const legacy: UserWordStat = { wordId: 'snapshot-only', fsrs: { ...emptySnapshot(at), reps: 4, state: 2, scheduled_days: 60 },
    state: 'mastered', productionCorrectCount: 100, correctCount: 4, mistakeCount: 0, firstSeenAt: at, lastReviewedAt: at }
  const fixture = databaseFixture(t)
  const payload = { data: { reviewLogs: reviews, stats: [legacy], profile: [defaultProfile()] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  let replayed = fixture.get<UserWordStat>('stats', word.id)!
  assert.equal(replayed.productionCorrectCount, 0)
  assert.notEqual(replayed.state, 'mastered')
  assert.equal(fixture.get<UserWordStat>('stats', legacy.wordId)!.productionCorrectCount, 0)
  assert.equal(fixture.get<UserWordStat>('stats', legacy.wordId)!.state, 'review')
  assert.deepEqual(fixture.get<UserWordStat>('stats', legacy.wordId)!.fsrs, JSON.parse(JSON.stringify(legacy.fsrs)))
  reviews.push({ ...reviews[0], id: 'production', mode: 'listen-spell', reviewedAt: at + 100 * 86400000 })
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  replayed = fixture.get<UserWordStat>('stats', word.id)!
  assert.equal(replayed.productionCorrectCount, 1)
  assert.equal(replayed.state, deriveState(replayed.fsrs, 1))
  const before = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), before)
})

test('backup: CET reward receipts merge by source, revision and question even when local settings are retained', async (t) => {
  const localQuestion = rewardQuestion()
  const remoteQuestion = rewardQuestion({ firstSubmittedAt: 50, lastSubmittedAt: 500,
    paid: { correction: 250, evidence: 400 } })
  const oldEdition = rewardQuestion({ paperRevision: '0123456789abcdef', number: 55,
    first: 'correct', firstSubmittedAt: 20, lastSubmittedAt: 20, paid: { firstCorrect: 20 } })
  const otherSource = rewardQuestion({ sourceId: CET_READY_PAPERS[1].sourceId,
    paperRevision: CET_READY_PAPERS[1].revision, first: 'correct', paid: { firstCorrect: 100 } })
  const localProgress = { [rewardKey(localQuestion)]: localQuestion, [rewardKey(otherSource)]: otherSource }
  const fixture = databaseFixture(t, { profile: [{ ...defaultProfile(), xp: 12, coins: 7,
    theme: 'paper', cetRewardProgress: localProgress }] })
  const payload: BackupPayload = { schemaVersion: 8, data: { reviewLogs: [], profile: [{
    ...defaultProfile(), xp: 9, coins: 3, theme: 'sunset', cetRewardProgress: {
      [rewardKey(remoteQuestion)]: remoteQuestion, [rewardKey(oldEdition)]: oldEdition,
    },
  }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const restored = fixture.get<Profile & { cetRewardProgress: Record<string, RewardQuestion> }>('profile', 'me')!
  assert.equal(restored.theme, 'paper')
  assert.equal(restored.xp, 12)
  assert.equal(restored.coins, 7)
  assert.deepEqual(restored.cetRewardProgress, {
    [rewardKey(localQuestion)]: { ...remoteQuestion, paid: { correction: 250, evidence: 400 } },
    [rewardKey(otherSource)]: otherSource, [rewardKey(oldEdition)]: oldEdition,
  })
  const beforeRepeat = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
  assert.equal(fixture.get<DailyQuest>('quests', todayKey()), undefined)
})

test('backup: CET reward receipts survive clean-device round trips and old backups without the new field', async (t) => {
  const question = rewardQuestion()
  const progress = { [rewardKey(question)]: question }
  const fixture = databaseFixture(t, { profile: [{ ...defaultProfile(), cetRewardProgress: progress }] })
  const exported = await exportBackup()
  assert.deepEqual((exported.data.profile[0] as Profile & { cetRewardProgress: unknown }).cetRewardProgress, progress)
  fixture.reset({})
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.get<Profile & { cetRewardProgress: unknown }>('profile', 'me')?.cetRewardProgress, progress)
  assert.equal((await importBackup(backupFile({ schemaVersion: 7, data: { reviewLogs: [], profile: [defaultProfile()] } }))).ok, true)
  assert.deepEqual(fixture.get<Profile & { cetRewardProgress: unknown }>('profile', 'me')?.cetRewardProgress, progress)
  assert.equal((await importBackup(backupFile({ schemaVersion: 6, data: { reviewLogs: [] } }))).ok, true)
  assert.deepEqual(fixture.get<Profile & { cetRewardProgress: unknown }>('profile', 'me')?.cetRewardProgress, progress)
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 0)
})

test('backup: consumed CET reward kinds retain tombstones and real receipt timestamps without paying again', async (t) => {
  const local = rewardQuestion({ paid: { correction: 0, evidence: 400 } })
  const incoming = rewardQuestion({ paid: { correction: 250, evidence: 0 } })
  const fixture = databaseFixture(t, { profile: [{ ...defaultProfile(),
    cetRewardProgress: { [rewardKey(local)]: local } }] })
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], profile: [{
    ...defaultProfile(), cetRewardProgress: { [rewardKey(incoming)]: incoming },
  }] } }))).ok, true)
  const progress = fixture.get<Profile & { cetRewardProgress: Record<string, RewardQuestion> }>('profile', 'me')!.cetRewardProgress
  assert.deepEqual(progress[rewardKey(local)].paid, { correction: 250, evidence: 400 })
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 0)
})

test('backup: malformed CET reward receipts reject the whole import before writing any table', async (t) => {
  const question = rewardQuestion()
  const key = rewardKey(question)
  const fixture = databaseFixture(t, { profile: [defaultProfile()] })
  const before = fixture.snapshot()
  const malformed: unknown[] = [null, [], 'invalid',
    { [key]: null }, { [key]: [] }, { invalid: question },
    { [key]: { ...question, sourceId: 'unknown' } },
    { [key]: { ...question, paperRevision: 'wrong-revision' } },
    ...[0, 56, 1.5].map((number) => ({ [key]: { ...question, number } })),
    { [key]: { ...question, first: 'pending' } }, { [key]: { ...question, last: 'pending' } },
    { [key]: { ...question, firstSubmittedAt: -1 } },
    { [key]: { ...question, firstSubmittedAt: 0.5 } },
    { [key]: { ...question, lastSubmittedAt: 99 } },
    { [key]: { ...question, lastSubmittedAt: null } },
    { [key]: { ...question, paid: null } }, { [key]: { ...question, paid: [] } },
    { [key]: { ...question, paid: { mystery: 300 } } },
    { [key]: { ...question, paid: { correction: -1 } } },
    { [key]: { ...question, paid: { correction: 0.5 } } },
    { [key]: { ...question, paid: { correction: '300' } } },
  ]
  for (const cetRewardProgress of malformed) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word],
      profile: [{ ...defaultProfile(), cetRewardProgress }],
    } }))
    assert.equal(result.ok, false, JSON.stringify(cetRewardProgress))
    assert.match(result.error!, /真题.*奖励.*凭据/)
    assert.deepEqual(fixture.snapshot(), before)
  }
  const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word],
    profile: [defaultProfile(), { cetRewardProgress: null }],
  } }))
  assert.equal(result.ok, false, 'a malformed later profile row cannot bypass receipt validation')
  assert.deepEqual(fixture.snapshot(), before)
  for (const profile of [null, 'invalid', { cetRewardProgress: { [key]: question } }]) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word], profile } }))
    assert.equal(result.ok, false, 'a malformed profile table cannot silently drop reward receipts')
    assert.match(result.error!, /真题.*奖励.*凭据/)
    assert.deepEqual(fixture.snapshot(), before)
  }
})

test('backup: imported CET receipts prevent another study from issuing the same question reward', async (t) => {
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile(new URL(`../public/${rewardPaper.path}`, import.meta.url))
  const paper = JSON.parse(bytes.toString()) as { answerKey: string[] }
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes))
  const { submitRewardedCetPaperStudy } = await import('../src/core/cetPapers.ts')
  const study = paperStudy({ id: 'cet-paper-after-backup', sourceId: rewardPaper.sourceId,
    paperRevision: rewardPaper.revision, answers: paperAnswers(paper.answerKey[0]), answerKey: paper.answerKey,
    firstSubmission: undefined, latestSubmission: undefined })
  const question = rewardQuestion({ number: 1, first: 'correct', lastSubmittedAt: 100, paid: { firstCorrect: 100 } })
  const fixture = databaseFixture(t, { cetPapers: [study] })
  const payload = { data: { reviewLogs: [], profile: [{ ...defaultProfile(), xp: 6, coins: 3,
    cetRewardProgress: { [rewardKey(question)]: question } }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const result = await submitRewardedCetPaperStudy(study.id)
  assert.equal(result.rewards.xp, 0)
  assert.equal(result.rewards.coins, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 6)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 3)
  assert.deepEqual(fixture.get<Profile>('profile', 'me')?.cetRewardProgress?.[rewardKey(question)].paid, { firstCorrect: 100 })
})

test('backup: export/import on a clean device restores settings, inventory, quests and legacy stats', async (t) => {
  const now = Date.now()
  const legacyWord: Word = { ...word, id: 'legacy', word: 'legacy' }
  const legacyStat: UserWordStat = {
    wordId: legacyWord.id,
    fsrs: { ...emptySnapshot(now), reps: 3, state: 2, scheduled_days: 30, stability: 30 },
    state: 'mastered', mistakeCount: 1, correctCount: 3, firstSeenAt: now, lastReviewedAt: now,
  }
  const reviewLog: ReviewLog = {
    id: 'review-1', wordId: word.id, rating: 3, reviewedAt: now,
    deviceId: 'old-device', elapsedMs: 10000, mode: 'choice-word', correct: true,
  }
  const remote: Profile = {
    ...defaultProfile(), deviceId: 'old-device', onboarded: true, xp: 3600, coins: 120,
    freezes: 3, themeFragments: 2, chestRewardTier: 2, streakRewardTier: 1,
    streak: 9, lastStudyDate: todayKey(), powerPeak: 2000,
    ownedThemes: ['sunset', 'forest'], theme: 'sunset', styleId: 'calm', customHue: 320,
    ownedSkins: ['leaf'], mascot: { name: '小勇者', skin: 'leaf' },
    examType: 'cet6', examDate: '2026-12-12', studyBook: 'ky-core', dailyNewTarget: 40,
  }
  const fixture = databaseFixture(t, {
    words: [word, legacyWord], stats: [legacyStat], reviewLogs: [reviewLog],
    dailyLogs: [{ ...emptyDaily(), listeningSeconds: 360, listeningSentences: 5, studySeconds: 360 }],
    profile: [remote], quests: [quest()], achievements: [{ id: 'word-1', unlockedAt: now }],
    adventures: [{ sceneId: 'campus-library', bestScore: 2, attempts: 1,
      correctQuestionIds: ['library-1', 'library-2'], firstPlayedAt: now, lastPlayedAt: now, completedAt: now }],
    expressions: [expression()],
    cetPractice: [cetReading(), cetOutput()],
  })
  const exported = await exportBackup()
  assert.equal(exported.schemaVersion, 10)
  const localWord = { ...word, definition: '本地修订释义', bookId: 'cet4-core', unitId: 1, bookUnits: undefined }
  fixture.reset({
    words: [localWord],
    profile: [{ ...defaultProfile(), deviceId: 'new-device' }],
  })

  const result = await importBackup(backupFile(exported))
  assert.equal(result.ok, true)
  assert.equal(result.totalLogs, 1)
  assert.equal(result.rebuiltWords, 1)
  const restored = fixture.get<Profile>('profile', 'me')!
  for (const field of ['coins', 'freezes', 'themeFragments', 'chestRewardTier', 'examType', 'examDate',
    'studyBook', 'dailyNewTarget', 'theme', 'styleId', 'customHue', 'onboarded'] as const) {
    assert.deepEqual(restored[field], remote[field], `restores ${field}`)
  }
  assert.deepEqual(restored.mascot, remote.mascot)
  assert.ok(restored.ownedThemes?.includes('sunset'))
  assert.ok(restored.ownedSkins?.includes('leaf'))
  assert.equal(restored.deviceId, 'new-device')
  assert.equal(fixture.get<DailyQuest>('quests', todayKey())?.chestOpened, true)
  assert.deepEqual(fixture.get<AdventureProgress>('adventures', 'campus-library'), exported.data.adventures[0])
  assert.deepEqual(fixture.get<ExpressionProgress>('expressions', 'campus-library-say-1'), exported.data.expressions[0])
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', 'cet4-reading-1'), exported.data.cetPractice[0])
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', 'cet6-writing-1'), exported.data.cetPractice[1])
  assert.equal(await claimChest(), null, 'restored open chest cannot be claimed again')
  assert.deepEqual(fixture.get<UserWordStat>('stats', 'legacy'), JSON.parse(JSON.stringify({
    ...legacyStat, state: 'review', productionCorrectCount: 0,
  })), 'legacy FSRS snapshots survive while mastery waits for recorded production')
  assert.equal(fixture.get<Word>('words', 'ability')?.definition, '本地修订释义')
  assert.deepEqual(fixture.get<Word>('words', 'ability')?.bookUnits, {
    'cet4-full': 4, 'ky-core': 2, 'cet4-core': 1,
  })
})

test('backup: existing device keeps settings and repeated imports do not add balances or reopen chests', async (t) => {
  const local = {
    ...defaultProfile(), deviceId: 'local', onboarded: true, coins: 100, freezes: 3,
    themeFragments: 1, chestRewardTier: 2, theme: 'sunset', styleId: 'focus',
    studyBook: 'cet4-core', dailyNewTarget: 20, ownedThemes: ['sunset'],
    ownedSkins: ['leaf'], mascot: { name: '本机', skin: 'leaf' },
  }
  const fixture = databaseFixture(t, {
    profile: [local], quests: [quest({ progress: [20, 2, 0], chestOpened: false, chestCount: 0 })],
    dailyLogs: [{ ...emptyDaily(), totalAnswered: 8, correctCount: 7, listeningSeconds: 0 }],
  })
  const payload: BackupPayload = {
    app: 'wordquest', data: {
      reviewLogs: [],
      profile: [{ ...defaultProfile(), onboarded: true, deviceId: 'remote', coins: 120, freezes: 2,
        themeFragments: 2, chestRewardTier: 1, theme: 'midnight-neon', styleId: 'calm',
        studyBook: 'cet6-core', dailyNewTarget: 60, ownedThemes: ['midnight-neon'], ownedSkins: ['crown'],
        mascot: { name: '远端', skin: 'crown' } }],
      quests: [quest()],
      dailyLogs: [{ ...emptyDaily(), totalAnswered: 3, correctCount: 3, listeningSeconds: 120 }],
    },
  }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const profile = fixture.get<Profile>('profile', 'me')!
  assert.equal(profile.coins, 120)
  assert.equal(profile.freezes, 3)
  assert.equal(profile.themeFragments, 2)
  assert.equal(profile.chestRewardTier, 2)
  assert.equal(profile.theme, 'sunset')
  assert.equal(profile.styleId, 'focus')
  assert.equal(profile.studyBook, 'cet4-core')
  assert.equal(profile.dailyNewTarget, 20)
  assert.deepEqual(profile.mascot, { name: '本机', skin: 'leaf' })
  assert.ok(profile.ownedThemes?.includes('midnight-neon'))
  assert.ok(profile.ownedSkins?.includes('crown'))
  assert.deepEqual(fixture.get<DailyQuest>('quests', todayKey())?.progress, [20, 10, 60])
  assert.equal(fixture.get<DailyQuest>('quests', todayKey())?.chestOpened, true)
  assert.equal(fixture.get<{ listeningSeconds: number }>('dailyLogs', todayKey())?.listeningSeconds, 120)
  const afterFirst = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), afterFirst)
})

test('backup: completed onboarding and automatic empty records still restore the old device settings', async (t) => {
  const now = Date.now()
  const fixture = databaseFixture(t, {
    profile: [{ ...defaultProfile(), deviceId: 'new-device', onboarded: true, examType: 'cet4',
      studyBook: 'cet4-core', dailyNewTarget: 20, theme: 'night' }],
    words: [word],
    stats: [{ wordId: word.id, fsrs: emptySnapshot(now), state: 'new', mistakeCount: 0,
      correctCount: 0, firstSeenAt: now, lastReviewedAt: now }],
    dailyLogs: [emptyDaily()],
    quests: [quest({ progress: [0, 0, 0], chestOpened: false, chestCount: 0 })],
  })
  const remote: Profile = { ...defaultProfile(), deviceId: 'old-device', onboarded: true,
    examType: 'cet6', examDate: '2026-12-12', studyBook: 'cet6-full', dailyNewTarget: 60,
    theme: 'paper', styleId: 'calm', customHue: 160, mascot: { name: '备份勇者', skin: 'leaf' } }

  const result = await importBackup(backupFile({ app: 'wordquest', data: { reviewLogs: [], profile: [remote] } }))
  assert.equal(result.ok, true)
  const restored = fixture.get<Profile>('profile', 'me')!
  for (const field of ['examType', 'examDate', 'studyBook', 'dailyNewTarget', 'theme', 'styleId', 'customHue', 'mascot'] as const) {
    assert.deepEqual(restored[field], remote[field], `restores ${field} after onboarding`)
  }
  assert.equal(restored.deviceId, 'new-device')
  assert.equal(fixture.get<DailyQuest>('quests', todayKey())?.chestOpened, false)
})

test('backup: listening without word reviews counts as existing study and preserves local settings', async (t) => {
  const local: Profile = { ...defaultProfile(), onboarded: true, theme: 'paper', styleId: 'focus',
    examType: 'cet4', studyBook: 'cet4-full', dailyNewTarget: 25 }
  const fixture = databaseFixture(t, {
    profile: [local],
    dailyLogs: [{ ...emptyDaily(), listeningSeconds: 30 }],
    quests: [quest({ progress: [0, 0, 30], chestOpened: false, chestCount: 0 })],
  })
  const result = await importBackup(backupFile({ app: 'wordquest', data: {
    reviewLogs: [], profile: [{ ...defaultProfile(), onboarded: true, theme: 'sunset', styleId: 'calm',
      examType: 'cet6', studyBook: 'cet6-core', dailyNewTarget: 60 }],
  } }))
  assert.equal(result.ok, true)
  const merged = fixture.get<Profile>('profile', 'me')!
  for (const field of ['theme', 'styleId', 'examType', 'studyBook', 'dailyNewTarget'] as const) {
    assert.equal(merged[field], local[field], `preserves ${field} for listening learner`)
  }
})

test('backup: adventure progress merges conservatively and counts as existing study', async (t) => {
  const local: AdventureProgress = { sceneId: 'campus-library', bestScore: 2, attempts: 5,
    correctQuestionIds: ['q1', 'q3'], firstPlayedAt: 100, lastPlayedAt: 300, completedAt: 200 }
  const remote: AdventureProgress = { sceneId: 'campus-library', bestScore: 3, attempts: 4,
    correctQuestionIds: ['q1', 'q2'], firstPlayedAt: 150, lastPlayedAt: 500, completedAt: 400 }
  const fixture = databaseFixture(t, {
    profile: [{ ...defaultProfile(), theme: 'paper', dailyNewTarget: 25 }], adventures: [local],
  })
  const payload: BackupPayload = { app: 'wordquest', data: { reviewLogs: [], adventures: [remote],
    profile: [{ ...defaultProfile(), theme: 'sunset', dailyNewTarget: 60 }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.get<AdventureProgress>('adventures', local.sceneId), {
    sceneId: local.sceneId, bestScore: 3, attempts: 5, correctQuestionIds: ['q1', 'q3', 'q2'],
    firstPlayedAt: 100, lastPlayedAt: 500, completedAt: 200,
  })
  assert.equal(fixture.get<Profile>('profile', 'me')?.theme, 'paper')
  assert.equal(fixture.get<Profile>('profile', 'me')?.dailyNewTarget, 25)
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 0)
  const merged = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), merged)
})

test('backup: schema-three backups without adventures preserve local adventure results', async (t) => {
  const progress: AdventureProgress = { sceneId: 'campus-library', bestScore: 1, attempts: 1,
    correctQuestionIds: ['q1'], firstPlayedAt: 100, lastPlayedAt: 200 }
  const fixture = databaseFixture(t, { adventures: [progress] })
  assert.equal((await importBackup(backupFile({ app: 'wordquest', schemaVersion: 3,
    data: { reviewLogs: [] } }))).ok, true)
  assert.deepEqual(fixture.get<AdventureProgress>('adventures', progress.sceneId), progress)
})

test('backup: stale expression snapshots preserve newer scheduling and union reward receipts without awarding', async (t) => {
  const local = expression({ attempts: 5, stage: 3, dueAt: 1794000000000 })
  const remote = expression({ attempts: 4, stage: 1, dueAt: 1793400000000,
    firstPracticedAt: 50, lastPracticedAt: 150, lastScheduledDate: '2026-10-29',
    independentDays: ['2026-10-29'], rewardedDates: ['2026-10-29'] })
  const fixture = databaseFixture(t, {
    expressions: [local], profile: [{ ...defaultProfile(), theme: 'paper', dailyNewTarget: 25 }],
  })
  const payload = { app: 'wordquest', data: { reviewLogs: [], expressions: [remote],
    profile: [{ ...defaultProfile(), theme: 'sunset', dailyNewTarget: 60 }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const merged = fixture.get<ExpressionProgress>('expressions', local.id)!
  assert.equal(merged.stage, 3)
  assert.equal(merged.dueAt, local.dueAt)
  assert.equal(merged.lastScheduledDate, local.lastScheduledDate)
  assert.equal(merged.attempts, 5)
  assert.equal(merged.firstPracticedAt, 50)
  assert.equal(merged.lastPracticedAt, 200)
  assert.deepEqual(merged.independentDays, ['2026-10-29', '2026-10-30'])
  assert.deepEqual(merged.rewardedDates, ['2026-10-29', '2026-10-30'])
  assert.equal(fixture.get<Profile>('profile', 'me')?.theme, 'paper')
  assert.equal(fixture.get<Profile>('profile', 'me')?.dailyNewTarget, 25)
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  const beforeRepeat = fixture.snapshot()
  await importBackup(backupFile(payload))
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
})

test('backup: newer expression scheduling wins, while same-day conflict uses earlier due and lower stage', async (t) => {
  const local = expression({ stage: 3, dueAt: 10000 })
  const fixture = databaseFixture(t, { expressions: [local] })
  const newer = expression({ lastScheduledDate: '2026-10-31', stage: 4, dueAt: 20000,
    lastPracticedAt: 300, lastOutcome: 'assisted', independentDays: ['bad', '2026-02-31', '2026-10-30'] })
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], expressions: [newer] } }))).ok, true)
  assert.equal(fixture.get<ExpressionProgress>('expressions', local.id)?.dueAt, 20000)
  assert.equal(fixture.get<ExpressionProgress>('expressions', local.id)?.stage, 4)
  const conflict = expression({ lastScheduledDate: '2026-10-31', stage: 0, dueAt: 15000,
    lastPracticedAt: 400, lastOutcome: 'retry', rewardedDates: [] })
  await importBackup(backupFile({ data: { reviewLogs: [], expressions: [conflict] } }))
  const merged = fixture.get<ExpressionProgress>('expressions', local.id)!
  assert.equal(merged.stage, 0)
  assert.equal(merged.dueAt, 15000)
  assert.equal(merged.lastOutcome, 'retry')
  assert.deepEqual(merged.independentDays, ['2026-10-30'])
  assert.deepEqual(merged.rewardedDates, ['2026-10-30'])
})

test('backup: schema-four backups keep expressions and invalid/empty practice rows are skipped', async (t) => {
  const local = expression()
  const fixture = databaseFixture(t, { expressions: [local] })
  assert.equal((await importBackup(backupFile({ app: 'wordquest', schemaVersion: 4,
    data: { reviewLogs: [] } }))).ok, true)
  assert.deepEqual(fixture.get<ExpressionProgress>('expressions', local.id), local)
  await importBackup(backupFile({ data: { reviewLogs: [], expressions: [
    expression({ id: 'unknown' }), expression({ id: 'campus-library-say-2', attempts: 0 }),
    expression({ id: 'campus-library-say-2', sceneId: 'city-museum' }),
    expression({ id: 'campus-library-say-2', lastScheduledDate: '2026-02-31' }),
  ] } }))
  assert.equal(fixture.get<ExpressionProgress>('expressions', 'unknown'), undefined)
  assert.equal(fixture.get<ExpressionProgress>('expressions', 'campus-library-say-2'), undefined)
  assert.deepEqual(fixture.get<ExpressionProgress>('expressions', local.id), local)
})

test('backup: CET merges earliest reading history, latest submissions and current drafts independently without rewards', async (t) => {
  const localReading = cetReading({ attempts: 5 })
  const localOutput = cetOutput({ attempts: 5, updatedAt: 500, draft: 'the current local draft' })
  const remoteReading = cetReading({ updatedAt: 600, submittedAt: 600, firstSubmittedAt: 50,
    completedAt: 50, firstAnswers: [3, 3, 3], latestAnswers: [1, 2, 3], attempts: 4 })
  const remoteOutput = cetOutput({ updatedAt: 700, draft: 'the newest remote draft', submittedAt: 200,
    completedAt: 50, submittedText: `${localOutput.submittedText} Extra remote detail.`, attempts: 4 })
  const localProfile: Profile = { ...defaultProfile(), theme: 'paper', dailyNewTarget: 25 }
  const fixture = databaseFixture(t, { profile: [localProfile], cetPractice: [localReading, localOutput] })
  const payload: BackupPayload = { app: 'wordquest', data: { reviewLogs: [], cetPractice: [remoteReading, remoteOutput],
    profile: [{ ...defaultProfile(), theme: 'sunset', dailyNewTarget: 60 }] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const reading = fixture.get<CetPracticeRecord>('cetPractice', localReading.id)!
  assert.equal(reading.updatedAt, 600)
  assert.equal(reading.submittedAt, 600)
  assert.deepEqual(reading.latestAnswers, [1, 2, 3])
  assert.equal(reading.firstSubmittedAt, 50)
  assert.deepEqual(reading.firstAnswers, [3, 3, 3])
  assert.equal(reading.completedAt, 50)
  assert.equal(reading.attempts, 5)
  const output = fixture.get<CetPracticeRecord>('cetPractice', localOutput.id)!
  assert.equal(output.draft, 'the newest remote draft')
  assert.equal(output.updatedAt, 700)
  assert.equal(output.submittedText, localOutput.submittedText)
  assert.equal(output.submittedAt, 300)
  assert.equal(output.completedAt, 50)
  assert.equal(output.attempts, 5)
  const profile = fixture.get<Profile>('profile', 'me')!
  assert.equal(profile.theme, 'paper')
  assert.equal(profile.dailyNewTarget, 25)
  assert.equal(profile.xp, 0)
  assert.equal(profile.coins, 0)
  assert.equal(fixture.get<DailyQuest>('quests', todayKey()), undefined)
  const afterFirst = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), afterFirst)
})

test('backup: stale CET records and schema-five files preserve newer drafts, submissions and first answers', async (t) => {
  const localReading = cetReading({ firstSubmittedAt: 50, completedAt: 50, firstAnswers: [3, 2, 1] })
  const localOutput = cetOutput({ draft: '', updatedAt: 900 })
  const fixture = databaseFixture(t, { cetPractice: [localReading, localOutput] })
  assert.equal((await importBackup(backupFile({ app: 'wordquest', schemaVersion: 5, data: { reviewLogs: [] } }))).ok, true)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', localReading.id), localReading)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', localOutput.id), localOutput)
  const staleReading = cetReading({ updatedAt: 200, submittedAt: 200, attempts: 1 })
  const draftOnly: CetPracticeRecord = { id: localOutput.id, examType: 'cet6', kind: 'writing', draft: 'old draft', updatedAt: 50, attempts: 0 }
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], cetPractice: [staleReading, draftOnly] } }))).ok, true)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', localReading.id), localReading)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', localOutput.id), localOutput)
})

test('backup: an unfinished CET draft alone still allows settings restoration on a fresh device', async (t) => {
  const draft: CetPracticeRecord = { id: 'cet4-translation-1', examType: 'cet4', kind: 'translation',
    draft: 'unfinished', updatedAt: 100, attempts: 0 }
  const fixture = databaseFixture(t, { cetPractice: [draft], profile: [{ ...defaultProfile(), theme: 'night' }] })
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [],
    profile: [{ ...defaultProfile(), theme: 'paper', dailyNewTarget: 40 }] } }))).ok, true)
  assert.equal(fixture.get<Profile>('profile', 'me')?.theme, 'paper')
  assert.equal(fixture.get<Profile>('profile', 'me')?.dailyNewTarget, 40)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', draft.id), draft)
})

test('backup: malformed CET rows reject the whole import before any table is written', async (t) => {
  const fixture = databaseFixture(t, { cetPractice: [cetReading()] })
  const before = fixture.snapshot()
  const malformed: unknown[] = [
    null,
    cetReading({ id: 'unknown' }),
    cetReading({ examType: 'cet6' }),
    cetReading({ kind: 'writing' }),
    cetReading({ attempts: 1.5 }),
    cetReading({ attempts: 0 }),
    cetReading({ updatedAt: NaN }),
    cetReading({ submittedAt: 400 }),
    cetReading({ firstSubmittedAt: 200 }),
    cetReading({ firstAnswers: [0, 1] }),
    cetReading({ firstAnswers: [0, 1, 4] }),
    cetReading({ latestAnswers: [0, 1, -1] }),
    cetReading({ latestAnswers: [0, 1, 0.5] }),
    cetReading({ draft: 'unexpected reading draft' }),
    cetOutput({ submittedText: 'too short' }),
    cetOutput({ checks: [true, true, false] }),
    cetOutput({ checks: [true, true] }),
    cetOutput({ firstAnswers: [0, 1, 2] }),
    { ...cetOutput(), draft: 123 },
    { ...cetOutput(), checks: [true, true, 'true'] },
  ]
  for (const row of malformed) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word], cetPractice: [row] } }))
    assert.equal(result.ok, false, JSON.stringify(row))
    assert.match(result.error!, /专项练习/)
    assert.deepEqual(fixture.snapshot(), before)
  }
  for (const badTable of [null, {}, 'invalid']) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], cetPractice: badTable } }))
    assert.equal(result.ok, false)
    assert.deepEqual(fixture.snapshot(), before)
  }
})

test('backup: old profiles retain their selected paid appearance without ownership arrays', async (t) => {
  const fixture = databaseFixture(t)
  assert.equal((await importBackup(backupFile({
    data: { reviewLogs: [], profile: [{ theme: 'sunset', mascot: { name: '旧勇者', skin: 'leaf' }, onboarded: true }] },
  }))).ok, true)
  const profile = fixture.get<Profile>('profile', 'me')!
  assert.equal(profile.theme, 'sunset')
  assert.ok(profile.ownedThemes?.includes('sunset'))
  assert.equal(profile.mascot.skin, 'leaf')
  assert.ok(profile.ownedSkins?.includes('leaf'))
})

test('backup: invalid review ratings are rejected before any data is written', async (t) => {
  const fixture = databaseFixture(t)
  const before = fixture.snapshot()
  const result = await importBackup(backupFile({ data: {
    words: [word], reviewLogs: [{ id: 'bad', wordId: word.id, rating: 99, reviewedAt: Date.now(), elapsedMs: 5, correct: true }],
  } }))
  assert.equal(result.ok, false)
  assert.deepEqual(fixture.snapshot(), before)
})

const paperId = 'cet-paper-backup-test'
const paperAnswers = (answer = '') => Array<string>(55).fill('').map((value, index) => index === 0 ? answer : value)
const paperSnapshot = (submittedAt: number, answer = 'A'): CetPaperSubmission => ({
  answers: paperAnswers(answer), answerKey: paperAnswers('A'), submittedAt,
})
const paperPdf = new Blob(['%PDF-1.7\nlocal paper'], { type: 'application/pdf' })
function paperStudy(patch: Partial<CetPaperStudy> = {}): CetPaperStudy {
  return {
    id: paperId, sourceId: CET_PAPER_SOURCES[0].id, variant: '第一套', createdAt: 10, updatedAt: 300,
    answers: paperAnswers('A'), answerKey: paperAnswers('A'), writingDraft: 'a draft', translationDraft: '',
    notes: 'review', elapsedSeconds: 120, files: {},
    firstSubmission: paperSnapshot(100, 'B'), latestSubmission: paperSnapshot(300), ...patch,
  }
}

function checkedOutputRevision(initial: string, text: string, updatedAt: number): OutputRevision {
  return { ...emptyOutputRevision(updatedAt), text, reasons: ['tense', 'cohesion'],
    initialChecks: [true, true, true], revisionChecks: [true, true, true],
    initialCheckedText: initial, revisionCheckedText: text }
}

test('backup: original and paper revisions round trip their separate text, reasons and checked snapshots', async (t) => {
  const original = cetOutput({ revision: checkedOutputRevision('a revised draft', 'A separate revised version.', 350) })
  const paper = paperStudy({ writingRevision: checkedOutputRevision('a draft', 'Paper writing revision.', 250),
    translationDraft: 'Initial translation.', translationRevision: checkedOutputRevision('Initial translation.', 'Revised translation.', 270) })
  const fixture = databaseFixture(t, { cetPractice: [original], cetPapers: [paper] })
  const exported = await exportBackup()
  assert.equal(exported.schemaVersion, 10)
  assert.deepEqual(exported.data.cetPractice, [original])
  assert.deepEqual(exported.data.cetPapers, [paper])
  fixture.reset({})
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', original.id), original)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paper.id), paper)
  const beforeRepeat = fixture.snapshot()
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 0)
  assert.equal(fixture.get<DailyQuest>('quests', todayKey()), undefined)
})

test('backup: each output revision merges by its own clock and changed initials invalidate only matching checks', async (t) => {
  const localOutput = cetOutput({ draft: 'The current initial.', updatedAt: 900,
    revision: checkedOutputRevision('The current initial.', 'Older local revision.', 600) })
  const incomingOutput = cetOutput({ draft: 'The older remote initial.', updatedAt: 700,
    revision: checkedOutputRevision('The older remote initial.', 'Newer remote revision.', 650) })
  const localPaper = paperStudy({ updatedAt: 900, writingDraft: 'Current writing.', translationDraft: 'Current translation.',
    writingRevision: checkedOutputRevision('Current writing.', 'Older writing revision.', 600),
    translationRevision: checkedOutputRevision('Current translation.', 'Keep translation revision.', 800) })
  const incomingPaper = paperStudy({ updatedAt: 700, writingDraft: 'Remote writing.', translationDraft: 'Remote translation.',
    writingRevision: checkedOutputRevision('Remote writing.', 'Newer writing revision.', 650),
    translationRevision: checkedOutputRevision('Remote translation.', 'Older translation revision.', 500) })
  const fixture = databaseFixture(t, { cetPractice: [localOutput], cetPapers: [localPaper] })
  const payload = { data: { reviewLogs: [], cetPractice: [incomingOutput], cetPapers: [incomingPaper] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const output = fixture.get<CetPracticeRecord>('cetPractice', localOutput.id)!
  assert.equal(output.draft, localOutput.draft)
  assert.equal(output.revision?.text, incomingOutput.revision?.text)
  assert.equal(output.revision?.updatedAt, 650)
  assert.deepEqual(output.revision?.initialChecks, [false, false, false])
  assert.equal(output.revision?.initialCheckedText, undefined)
  assert.deepEqual(output.revision?.revisionChecks, [true, true, true])
  assert.equal(output.submittedText, localOutput.submittedText)
  assert.equal(output.attempts, localOutput.attempts)
  const paper = fixture.get<CetPaperStudy>('cetPapers', paperId)!
  assert.equal(paper.writingDraft, localPaper.writingDraft)
  assert.equal(paper.writingRevision?.text, incomingPaper.writingRevision?.text)
  assert.deepEqual(paper.writingRevision?.initialChecks, [false, false, false])
  assert.deepEqual(paper.writingRevision?.revisionChecks, [true, true, true])
  assert.deepEqual(paper.translationRevision, localPaper.translationRevision)
  assert.deepEqual(paper.firstSubmission, localPaper.firstSubmission)
  assert.deepEqual(paper.latestSubmission, localPaper.latestSubmission)
  const beforeRepeat = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
  const oldBackup = { schemaVersion: 9, data: { reviewLogs: [],
    cetPractice: [cetOutput({ draft: localOutput.draft, updatedAt: 1000 })],
    cetPapers: [paperStudy({ updatedAt: 1000, writingDraft: localPaper.writingDraft, translationDraft: localPaper.translationDraft })] } }
  assert.equal((await importBackup(backupFile(oldBackup))).ok, true)
  assert.deepEqual(fixture.get<CetPracticeRecord>('cetPractice', localOutput.id)?.revision, output.revision)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId)?.writingRevision, paper.writingRevision)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId)?.translationRevision, paper.translationRevision)
})

test('backup: malformed new revision fields reject every table before any write', async (t) => {
  const valid = checkedOutputRevision('a revised draft', 'A separate revision.', 350)
  const fixture = databaseFixture(t, { cetPractice: [cetOutput()] })
  const before = fixture.snapshot()
  const malformed = [
    { ...valid, reasons: ['score'] }, { ...valid, revisionCheckedText: 'Different text.' },
    { ...valid, initialCheckedText: 'Different initial.' }, { ...valid, updatedAt: 500 },
    { ...valid, revisionChecks: [true, true, 'true'] }, { ...valid, initialChecks: [false, false, false] },
  ]
  for (const revision of malformed) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word],
      cetPractice: [cetOutput({ revision: revision as never })] } }))
    assert.equal(result.ok, false)
    assert.match(result.error!, /专项练习/)
    assert.deepEqual(fixture.snapshot(), before)
  }
  for (const revision of [
    { ...checkedOutputRevision('a draft', 'Paper revision.', 250), reasons: ['score'] },
    checkedOutputRevision('Another initial.', 'Paper revision.', 250),
    checkedOutputRevision('a draft', 'Paper revision.', 9),
    checkedOutputRevision('a draft', 'Paper revision.', 400),
  ]) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word],
      cetPapers: [paperStudy({ writingRevision: revision as never })] } }))
    assert.equal(result.ok, false)
    assert.match(result.error!, /真题/)
    assert.deepEqual(fixture.snapshot(), before)
  }
})

const paperRef = (suffix: string, kind = 'paper' as 'paper' | 'answers') => ({
  id: `cet-paper:${paperId}:${kind}:${suffix}`, name: `${suffix}.pdf`, type: paperPdf.type, size: paperPdf.size,
})

test('backup: edited paper drafts keep local settings before checking, while empty cards still allow restoration', async (t) => {
  const local: Profile = { ...defaultProfile(), theme: 'paper', examType: 'cet4', studyBook: 'cet4-core', examDate: '2026-12-12' }
  const remote: Profile = { ...defaultProfile(), theme: 'sunset', examType: 'cet6', studyBook: 'cet6-full', examDate: '2027-06-12' }
  const empty = paperStudy({ answers: paperAnswers(), answerKey: paperAnswers(), writingDraft: '', translationDraft: '',
    notes: '', elapsedSeconds: 0, files: {}, firstSubmission: undefined, latestSubmission: undefined })
  const fixture = databaseFixture(t)
  const edits: Partial<CetPaperStudy>[] = [{ writingDraft: 'My first draft' }, { translationDraft: 'My translation' },
    { writingRevision: checkedOutputRevision('', 'My independent revision.', 250) },
    { translationRevision: checkedOutputRevision('', 'My revised translation.', 250) },
    { notes: 'Listen for the contrast' }, { answers: paperAnswers('B') }, { answerKey: paperAnswers('A') },
    { files: { paper: paperRef('local-draft') } }]
  for (const edit of [...edits, {}]) {
    fixture.reset({ profile: [local], cetPapers: [{ ...empty, ...edit }] })
    assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], profile: [remote] } }))).ok, true)
    const expected = Object.keys(edit).length ? local : remote
    const result = fixture.get<Profile>('profile', 'me')!
    for (const field of ['theme', 'examType', 'studyBook', 'examDate'] as const) assert.equal(result[field], expected[field])
  }
})

test('backup: real-paper cards, independent submissions and local documents survive a round trip', async (t) => {
  const ref = paperRef('original')
  const study = paperStudy({ files: { paper: ref } })
  const fixture = databaseFixture(t, { cetPapers: [study], media: [{ id: ref.id, blob: paperPdf }] })
  const exported = await exportBackup()
  assert.equal(exported.schemaVersion, 10)
  assert.deepEqual(exported.data.cetPapers, [study])
  assert.equal(exported.data.media[0].type, 'application/pdf')
  fixture.reset({})
  const restored = await importBackup(backupFile(exported))
  assert.equal(restored.ok, true)
  assert.equal(restored.addedCetPapers, 1)
  assert.equal(restored.addedMedia, 1)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId), study)
  assert.equal(await fixture.get<{ blob: Blob }>('media', ref.id)?.blob.text(), await paperPdf.text())
  assert.equal(fixture.get<Profile>('profile', 'me')?.xp, 0)
  assert.equal(fixture.get<Profile>('profile', 'me')?.coins, 0)
  assert.equal(fixture.get<DailyQuest>('quests', todayKey()), undefined)
})

test('backup: correction evidence round trips and merges each question independently of newer paper drafts', async (t) => {
  const local = paperStudy({ sourceId: rewardPaper.sourceId, paperRevision: rewardPaper.revision,
    updatedAt: 900, writingDraft: 'the newer local draft', correctionEvidence: {
      '1': { text: 'Local first evidence', previousSubmittedAt: 100, recordedAt: 200 },
      '46': { text: 'Local evidence stays', previousSubmittedAt: 100, recordedAt: 300 },
    } })
  const incoming = paperStudy({ sourceId: rewardPaper.sourceId, paperRevision: rewardPaper.revision,
    updatedAt: 700, writingDraft: 'the older remote draft', correctionEvidence: {
      '1': { text: 'Newer remote first evidence', previousSubmittedAt: 300, recordedAt: 600 },
      '55': { text: 'Remote evidence is added', previousSubmittedAt: 100, recordedAt: 500 },
    } })
  const fixture = databaseFixture(t, { cetPapers: [local] })
  const exported = await exportBackup()
  fixture.reset({})
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId), local)
  const payload = { data: { reviewLogs: [], cetPapers: [incoming] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const merged = fixture.get<CetPaperStudy>('cetPapers', paperId)!
  assert.equal(merged.writingDraft, local.writingDraft)
  assert.deepEqual(merged.correctionEvidence, {
    '1': incoming.correctionEvidence!['1'], '46': local.correctionEvidence!['46'],
    '55': incoming.correctionEvidence!['55'],
  })
  const beforeRepeat = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
  assert.equal((await importBackup(backupFile({ schemaVersion: 7, data: { reviewLogs: [],
    cetPapers: [paperStudy({ sourceId: rewardPaper.sourceId, paperRevision: rewardPaper.revision, updatedAt: 1000 })],
  } }))).ok, true)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId)?.correctionEvidence, merged.correctionEvidence)
})

test('backup: malformed correction evidence rejects the entire import before any write', async (t) => {
  const valid = { text: 'The sentence gives this answer.', previousSubmittedAt: 100, recordedAt: 200 }
  const fixture = databaseFixture(t, { cetPapers: [paperStudy()] })
  const before = fixture.snapshot()
  const invalid: unknown[] = [null, [], { '0': valid }, { '56': valid }, { '01': valid },
    { '1': null }, { '1': { ...valid, text: '' } }, { '1': { ...valid, text: '   ' } },
    { '1': { ...valid, text: 'x'.repeat(10001) } },
    { '1': { ...valid, previousSubmittedAt: 9 } }, { '1': { ...valid, recordedAt: 301 } },
    { '1': { ...valid, recordedAt: 100 } }, { '1': { ...valid, recordedAt: 200.5 } },
  ]
  for (const correctionEvidence of invalid) {
    const study = { ...paperStudy({ sourceId: rewardPaper.sourceId, paperRevision: rewardPaper.revision }), correctionEvidence }
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word], cetPapers: [study] } }))
    assert.equal(result.ok, false, JSON.stringify(correctionEvidence))
    assert.match(result.error!, /真题/)
    assert.deepEqual(fixture.snapshot(), before)
  }
  const unpinned = { ...paperStudy(), correctionEvidence: { '1': valid } }
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], cetPapers: [unpinned] } }))).ok, false)
  assert.deepEqual(fixture.snapshot(), before)
})

test('backup: paper drafts, earliest first and latest submissions merge independently while stale files stay unreferenced', async (t) => {
  const localRef = paperRef('local')
  const staleRef = paperRef('stale')
  const answerRef = paperRef('reference-answers', 'answers')
  const local = paperStudy({ updatedAt: 900, writingDraft: 'new local writing', latestSubmission: paperSnapshot(700), files: { paper: localRef } })
  const incoming = paperStudy({ updatedAt: 800, writingDraft: 'older remote writing', firstSubmission: paperSnapshot(50, 'C'),
    latestSubmission: paperSnapshot(800, 'D'), files: { paper: staleRef, answers: answerRef } })
  const fixture = databaseFixture(t, {
    cetPapers: [local], media: [{ id: localRef.id, blob: paperPdf }], profile: [{ ...defaultProfile(), theme: 'paper' }],
  })
  const payload: BackupPayload = { data: { reviewLogs: [], cetPapers: [incoming],
    profile: [{ ...defaultProfile(), theme: 'sunset' }], media: [
      { id: staleRef.id, type: paperPdf.type, base64: await blobToBase64(paperPdf) },
      { id: answerRef.id, type: paperPdf.type, base64: await blobToBase64(paperPdf) },
    ] } }
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  const merged = fixture.get<CetPaperStudy>('cetPapers', paperId)!
  assert.equal(merged.writingDraft, 'new local writing')
  assert.equal(merged.updatedAt, 900)
  assert.deepEqual(merged.firstSubmission, incoming.firstSubmission)
  assert.deepEqual(merged.latestSubmission, incoming.latestSubmission)
  assert.deepEqual(merged.files, { paper: localRef, answers: answerRef })
  assert.equal(fixture.get('media', staleRef.id), undefined)
  assert.ok(fixture.get('media', localRef.id))
  assert.ok(fixture.get('media', answerRef.id))
  assert.equal(fixture.get<Profile>('profile', 'me')?.theme, 'paper', 'submitted papers count as real study')
  const beforeRepeat = fixture.snapshot()
  assert.equal((await importBackup(backupFile(payload))).ok, true)
  assert.deepEqual(fixture.snapshot(), beforeRepeat)
  assert.equal((await importBackup(backupFile({ schemaVersion: 6, data: { reviewLogs: [] } }))).ok, true)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId), merged)
})

test('backup: a newer paper attachment replaces its previous blob in the same transaction', async (t) => {
  const previous = paperRef('previous')
  const replacement = paperRef('replacement')
  const fixture = databaseFixture(t, { cetPapers: [paperStudy({ files: { paper: previous } })],
    media: [{ id: previous.id, blob: paperPdf }] })
  const incoming = paperStudy({ updatedAt: 500, files: { paper: replacement } })
  assert.equal((await importBackup(backupFile({ data: { reviewLogs: [], cetPapers: [incoming],
    media: [{ id: replacement.id, type: paperPdf.type, base64: await blobToBase64(paperPdf) }] } }))).ok, true)
  assert.equal(fixture.get('media', previous.id), undefined)
  assert.ok(fixture.get('media', replacement.id))
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId)?.files.paper, replacement)
})

test('backup: malformed paper cards and mismatched document bytes reject before any writes', async (t) => {
  const ref = paperRef('valid')
  const study = paperStudy({ files: { paper: ref } })
  const fixture = databaseFixture(t, { cetPapers: [paperStudy()] })
  const before = fixture.snapshot()
  const media = { id: ref.id, type: paperPdf.type, base64: await blobToBase64(paperPdf) }
  const badCards: unknown[] = [null, paperStudy({ sourceId: 'unknown' }), paperStudy({ answers: ['A'] }),
    paperStudy({ createdAt: 500 }), paperStudy({ elapsedSeconds: -1 }),
    paperStudy({ firstSubmission: paperSnapshot(301) }),
    paperStudy({ files: { paper: { ...ref, id: 'some-other-doc' } } }),
    { ...study, files: { video: ref } }, { ...study, firstSubmission: undefined },
  ]
  for (const card of badCards) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word], cetPapers: [card], media: [media] } }))
    assert.equal(result.ok, false)
    assert.match(result.error!, /真题/)
    assert.deepEqual(fixture.snapshot(), before)
  }
  const wrongBytes = await blobToBase64(new Blob(['x'.repeat(paperPdf.size)]))
  for (const badMedia of [{ ...media, type: 'audio/mpeg' }, { ...media, base64: 'invalid base64' },
    { ...media, base64: wrongBytes }, { ...media, base64: media.base64.slice(0, -4) }]) {
    const result = await importBackup(backupFile({ data: { reviewLogs: [], words: [word], cetPapers: [study], media: [badMedia] } }))
    assert.equal(result.ok, false)
    assert.match(result.error!, /文档或录音/)
    assert.deepEqual(fixture.snapshot(), before)
  }
})

test('backup: skipped documents retain card references for reimport and the shared 100 MB media limit', async (t) => {
  const ref = paperRef('missing-document')
  const study = paperStudy({ files: { paper: ref } })
  const fixture = databaseFixture(t, { cetPapers: [study], media: [
    { id: 'huge-document', blob: { size: MEDIA_BACKUP_LIMIT + 1, type: 'application/pdf' } },
  ] })
  assert.equal(MEDIA_BACKUP_LIMIT, 100 * 1024 * 1024)
  const exported = await exportBackup()
  assert.equal(exported.mediaSkipped, 1)
  assert.deepEqual(exported.data.media, [])
  assert.deepEqual(exported.data.cetPapers[0].files.paper, ref)
  fixture.reset({})
  assert.equal((await importBackup(backupFile(exported))).ok, true)
  assert.deepEqual(fixture.get<CetPaperStudy>('cetPapers', paperId)?.files.paper, ref)
  assert.equal(fixture.get('media', ref.id), undefined)
})

test('backup: an omitted remote document cannot delete the only available local attachment', async (t) => {
  const localRef = paperRef('available-local')
  const skippedRef = paperRef('skipped-remote')
  const fixture = databaseFixture(t, { cetPapers: [paperStudy({ files: { paper: localRef } })],
    media: [{ id: localRef.id, blob: paperPdf }] })
  assert.equal((await importBackup(backupFile({ mediaSkipped: 1, data: { reviewLogs: [],
    cetPapers: [paperStudy({ updatedAt: 600, writingDraft: 'newer remote draft', files: { paper: skippedRef } })], media: [],
  } }))).ok, true)
  const merged = fixture.get<CetPaperStudy>('cetPapers', paperId)!
  assert.equal(merged.writingDraft, 'newer remote draft')
  assert.deepEqual(merged.files.paper, localRef)
  assert.ok(fixture.get('media', localRef.id))
  assert.equal(fixture.get('media', skippedRef.id), undefined)
})
