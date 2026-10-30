import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACHIEVEMENTS, achievementProgress, achievementTarget, summarizeAchievementLogs, type AchievementCtx } from '../src/core/achievements.ts'
import type { ReviewLog } from '../src/types/model.ts'

const empty: AchievementCtx = {
  streak: 0, mastered: 0, learned: 0, bookMasteryRatio: 0, listeningSentences: 0,
  listeningSeconds: 0, listeningDays: 0, perfectDays: 0, accuracyStreakDays: 0,
  maxCombo: 0, totalAnswered: 0, studyDays: 0, reviewsDone: 0, correctReviews: 0,
  recoveredWords: 0, relearnedWords: 0, spellingCorrect: 0, spellingWords: 0,
  listeningSpellCorrect: 0, spellingStreak: 0, adventureCompleted: 0,
  adventurePerfect: 0, expressionIndependent: 0, expressionRetained: 0, learningDimensions: 0,
}
const byId = (id: string) => ACHIEVEMENTS.find((achievement) => achievement.id === id)!
const log = (id: string, wordId: string, day: number, correct: boolean, mode: ReviewLog['mode'] = 'spell'): ReviewLog => ({
  id, wordId, reviewedAt: new Date(2026, 9, day, 12).getTime(), correct, mode,
  rating: correct ? 3 : 1, elapsedMs: 3000, deviceId: 'test',
})

test('68 枚成就保留旧 ID，每枚均有准确说明、进度和正向学习条件', () => {
  assert.equal(ACHIEVEMENTS.length, 68)
  assert.equal(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size, 68)
  const oldIds = [
    'streak-1', 'streak-7', 'streak-14', 'streak-30', 'streak-60', 'streak-100', 'streak-180', 'streak-365',
    'word-1', 'word-50', 'word-100', 'word-300', 'word-500', 'word-1000', 'word-2000', 'word-3000', 'cet4-90', 'learn-500',
    'listen-1', 'listen-20', 'listen-50', 'listen-100', 'listen-300', 'listen-perfect-20', 'listen-speed', 'listen-marathon',
    'combo-10', 'combo-25', 'combo-perfect', 'combo-steady', 'combo-night', 'combo-50',
    'fail-day', 'fail-triple', 'fail-hard20', 'hide-early', 'hide-nearmiss', 'hide-collector', 'hide-broke', 'hide-marathon',
  ]
  assert.ok(oldIds.every((id) => byId(id)))
  for (const achievement of ACHIEVEMENTS) {
    const progress = achievementProgress(achievement, empty)
    assert.ok(achievement.desc.length > 0 && achievement.unit.length > 0)
    assert.equal(achievement.check(empty), false, achievement.id)
    assert.equal(progress.current, 0)
    assert.ok(progress.target > 0)
    assert.doesNotMatch(achievement.desc, /凌晨|1\.5|金币少于|配色主题/)
  }
})

test('表达成就区分独立写出与跨日回想，进度按不同表达计算', () => {
  const first = { ...empty, expressionIndependent: 1 }
  assert.equal(byId('expression-1').check(first), true)
  assert.equal(byId('expression-6').check(first), false)
  assert.equal(byId('expression-recall-3').check(first), false)
  const practiced = { ...empty, expressionIndependent: 18, expressionRetained: 2 }
  assert.equal(byId('expression-18').check(practiced), true)
  assert.equal(byId('expression-recall-3').check(practiced), false)
  assert.deepEqual(achievementProgress(byId('expression-recall-3'), practiced), {
    current: 2, target: 3, ratio: 2 / 3, remaining: 1,
  })
  assert.equal(byId('expression-recall-3').check({ ...practiced, expressionRetained: 3 }), true)
})

test('纠错成就要求之后另一天答对，遗忘恢复还要求此前答对过', () => {
  const sameDay = summarizeAchievementLogs([log('1', 'known', 1, true), log('2', 'known', 2, false), log('3', 'known', 2, true)])
  assert.equal(sameDay.recoveredWords, 0)
  assert.equal(sameDay.relearnedWords, 0)
  assert.equal(byId('fail-day').check({ ...empty, ...sameDay }), false)
  const recovered = summarizeAchievementLogs([
    log('1', 'known', 1, true), log('2', 'known', 2, false), log('3', 'known', 3, true),
    log('4', 'new', 1, false), log('5', 'new', 3, true),
  ])
  assert.equal(recovered.recoveredWords, 2)
  assert.equal(recovered.relearnedWords, 1)
  assert.equal(byId('fail-day').check({ ...empty, ...recovered }), true)
  assert.equal(byId('fail-triple').check({ ...empty, ...recovered }), true)
  const wrongOnly = summarizeAchievementLogs([log('a', 'wrong', 1, false), log('b', 'wrong', 2, false), log('c', 'wrong', 3, false)])
  for (const id of ['fail-day', 'fail-triple', 'fail-hard20']) assert.equal(byId(id).check({ ...empty, ...wrongOnly }), false)
})

test('拼写指标区分听写、不同单词与连续正确，不以普通选择题冒充拼写', () => {
  const facts = summarizeAchievementLogs([
    log('1', 'one', 1, true, 'choice-word'), log('2', 'one', 2, true, 'spell'),
    log('3', 'one', 3, true, 'listen-spell'), log('4', 'two', 4, false, 'spell'),
    log('5', 'two', 5, true, 'spell'),
  ])
  assert.equal(facts.spellingCorrect, 3)
  assert.equal(facts.spellingWords, 2)
  assert.equal(facts.listeningSpellCorrect, 1)
  assert.equal(facts.spellingStreak, 2)
  assert.equal(facts.correctReviews, 3)
})

test('冒险成就按不同通过场景和满星场景计数，推荐不会透露隐藏条件', () => {
  const ctx = { ...empty, adventureCompleted: 6, adventurePerfect: 3, spellingCorrect: 24 }
  assert.equal(byId('adventure-6').check(ctx), true)
  assert.equal(byId('adventure-9').check(ctx), false)
  assert.equal(byId('adventure-perfect-3').check(ctx), true)
  assert.equal(byId('adventure-perfect-9').check(ctx), false)
  const done = new Set(ACHIEVEMENTS.filter((achievement) => achievement.check(ctx)).map((achievement) => achievement.id))
  assert.equal(achievementTarget(ctx, done)?.id, 'spell-25')
  assert.equal(achievementTarget(ctx, done, 'adventure-9')?.id, 'adventure-9')
  assert.notEqual(achievementTarget(ctx, done, 'hide-collector')?.hidden, true)
  assert.equal(achievementTarget(ctx, new Set(ACHIEVEMENTS.map((achievement) => achievement.id))), undefined)
})
