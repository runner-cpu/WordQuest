import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db, todayKey } from '../src/db/database.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { emptySnapshot, schedule } from '../src/core/fsrs.ts'
import { submitAnswer } from '../src/core/session.ts'
import { XP_RULES } from '../src/core/game.ts'
import type { ReviewLog, UserWordStat, Word } from '../src/types/model.ts'

test('作答等待写事务时，保留先提交的奖励与同词复习状态', async (t) => {
  const now = Date.now()
  const word: Word = {
    id: 'example', word: 'example', definition: '例子', bookId: 'cet4-core',
    unitId: 1, freqRank: 10, difficultyWeight: 1,
  }
  let profile = { ...defaultProfile(), lastStudyDate: todayKey() }
  let daily = emptyDaily()
  let stat: UserWordStat | undefined
  const logs: ReviewLog[] = []

  t.mock.method(db.profile, 'get', async () => structuredClone(profile))
  t.mock.method(db.profile, 'put', async (next) => { profile = structuredClone(next); return next.id })
  t.mock.method(db.stats, 'get', async () => structuredClone(stat))
  t.mock.method(db.stats, 'put', async (next) => { stat = structuredClone(next); return next.wordId })
  t.mock.method(db.dailyLogs, 'get', async () => structuredClone(daily))
  t.mock.method(db.dailyLogs, 'put', async (next) => { daily = structuredClone(next); return next.date })
  t.mock.method(db.reviewLogs, 'add', async (log) => { logs.push(structuredClone(log)); return log.id })
  t.mock.method(db, 'transaction', async (...args: unknown[]) => {
    // 另一标签的奖励和该词第一次作答，在当前作答取得写锁之前提交。
    // 旧实现已在这里之前读取 profile/stat，随后会用旧快照覆盖这次提交。
    profile = { ...profile, xp: 100, coins: 50 }
    daily = { ...daily, newLearned: 1, totalAnswered: 1, xp: 100, coinsEarned: 50 }
    stat = {
      wordId: word.id, fsrs: schedule(emptySnapshot(now - 60000), 3, now - 60000),
      state: 'learning', mistakeCount: 0, correctCount: 1,
      firstSeenAt: now - 60000, lastReviewedAt: now - 60000,
    }
    const run = args[args.length - 1] as () => Promise<unknown>
    return run()
  })

  const result = await submitAnswer({
    question: { word, kind: 'choice-word', answer: word.definition, isReview: false },
    rating: 3, elapsedMs: 3000, correct: true, manual: true,
  })

  assert.equal(profile.xp, 100 + XP_RULES.reviewCorrect)
  assert.equal(profile.coins, 51)
  assert.equal(result.xp, XP_RULES.reviewCorrect)
  assert.equal(result.stat.fsrs.reps, 2)
  assert.equal(result.stat.correctCount, 2)
  assert.equal(result.stat.firstSeenAt, now - 60000)
  assert.equal(stat?.fsrs.reps, 2)
  assert.equal(daily.newLearned, 1)
  assert.equal(daily.reviewsDone, 1)
  assert.equal(daily.totalAnswered, 2)
  assert.equal(daily.xp, 100 + XP_RULES.reviewCorrect)
  assert.equal(logs.length, 1)
  assert.equal(result.logId, logs[0].id)
  assert.equal(result.nextDue, result.stat.fsrs.due)
})
