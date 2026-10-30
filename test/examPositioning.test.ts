import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysUntil, examDateInfo, upcomingExamSessions } from '../src/core/exam.ts'
import { RANKS, rankFromPower } from '../src/core/game.ts'
import { buildWeeklyReport } from '../src/core/weekly.ts'
import { defaultProfile, emptyDaily } from '../src/core/profile.ts'
import { db, todayKey } from '../src/db/database.ts'
import { BUILTIN_SETS, builtinSetsForLevel, mergeSetPack } from '../src/data/examSets.ts'

test('考试日期：已核验场次附官方来源，未知场次与个人日期保持不同身份', () => {
  const [confirmed, next] = upcomingExamSessions(2, new Date(2026, 9, 30))
  assert.equal(confirmed.date, '2026-12-12')
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.source, 'https://www.neea.edu.cn/html1/report/2609/1-1.htm')
  assert.equal(confirmed.checkedAt, '2026-10-30')
  assert.equal(next.date, '2027-06-12')
  assert.equal(next.status, 'estimated')
  assert.equal(next.source, undefined)
  assert.equal(examDateInfo(confirmed.date).status, 'confirmed')
  assert.equal(examDateInfo(confirmed.date).source, confirmed.source)
  assert.equal(examDateInfo(next.date).status, 'estimated')
  assert.equal(examDateInfo('2027-06-11').status, 'personal')
  assert.equal(examDateInfo().label, '未设置')
})

test('考试日期：保留考试当天，跨日后跳过；无效日历日期不生成倒计时', () => {
  const [sameDay] = upcomingExamSessions(1, new Date(2026, 11, 12, 23, 59, 59))
  assert.equal(sameDay.date, '2026-12-12')
  assert.equal(sameDay.daysLeft, 0)
  const [after] = upcomingExamSessions(1, new Date(2026, 11, 13))
  assert.equal(after.date, '2027-06-12')
  assert.equal(after.status, 'estimated')
  assert.equal(daysUntil('2026-02-31', new Date(2026, 1, 1)), null)
  assert.equal(examDateInfo('2026-02-31').status, 'personal')
})

test('成长阶段：旧 id 与积分阈值继续解析历史进度，展示使用应用内阶段', () => {
  const historical = [['a1', 0], ['a2', 300], ['b1', 900], ['b2', 2000], ['c1', 4000], ['c2', 7000], ['master', 12000]] as const
  assert.deepEqual(RANKS.map((rank) => [rank.id, rank.threshold]), historical)
  for (const [index, [id, threshold]] of historical.entries()) {
    const result = rankFromPower(threshold)
    assert.equal(result.rank.id, id)
    assert.equal(result.rank.code, `阶段${index + 1}`)
    if (index > 0) assert.equal(rankFromPower(threshold - 1).rank.id, historical[index - 1][0])
  }
})

test('原创听力：按备考级别筛选，主题连练保留全部材料与既有 id', () => {
  assert.deepEqual(builtinSetsForLevel('CET-4').map((set) => set.id), ['sim-cet4-campus', 'sim-cet4-health'])
  assert.deepEqual(builtinSetsForLevel('CET-6').map((set) => set.id), ['sim-cet6-work', 'sim-cet6-coast'])
  assert.deepEqual(BUILTIN_SETS.map((set) => mergeSetPack(set).items.length), [8, 8, 8, 7])
  for (const set of BUILTIN_SETS) {
    const merged = mergeSetPack(set)
    assert.equal(merged.id, `${set.id}-full`)
    assert.equal(merged.level, set.level)
    assert.deepEqual(merged.items, set.sections.flatMap((section) => section.pack.items))
    assert.equal(new Set(merged.items.map((item) => item.group)).size, 3)
    for (const [index, section] of set.sections.entries()) {
      assert.equal(section.name, `材料 ${index + 1}`)
      assert.equal(section.pack.id, `${set.id}-${section.key}`)
      assert.equal(new Set(section.pack.items.map((item) => item.group)).size, 1)
      assert.equal(new Set(section.pack.items.map((item) => item.stem)).size, 1)
    }
  }
})

test('周报：听力活动会被如实记录，活动量不生成考前准备保证', async (t) => {
  const today = todayKey()
  let current = { ...emptyDaily(today), listeningSeconds: 15 }
  t.mock.method(db.dailyLogs, 'bulkGet', async (dates: string[]) => dates.map((date) => date === today ? structuredClone(current) : undefined))
  t.mock.method(db.profile, 'get', async () => ({ ...defaultProfile(), examType: 'cet6', examDate: today }))
  const listeningOnly = await buildWeeklyReport()
  assert.equal(listeningOnly?.answered, 0)
  assert.match(listeningOnly!.comment, /已记录听力练习/)
  current = { ...current, totalAnswered: 10, correctCount: 8 }
  const withVocabulary = await buildWeeklyReport()
  assert.equal(withVocabulary?.avgAccuracy, 0.8)
  assert.doesNotMatch(withVocabulary!.comment, /考前不用赶|保证|通过考试|达到.{0,3}水平/)
})
