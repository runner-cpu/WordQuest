import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStudyReminderIcs } from '../src/core/ics.ts'
import { CONFIRMED_EXAM_SESSIONS, examDateInfo } from '../src/core/exam.ts'

function events(content: string): string[] {
  const unfolded = content.replace(/\r\n /g, '')
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)\r\nEND:VEVENT/g)].map((match) => match[1])
}

test('ICS: official exam dates retain a personal goal and include provenance in the all-day event', () => {
  const confirmed = Object.values(CONFIRMED_EXAM_SESSIONS)[0]
  const content = buildStudyReminderIcs({ examDate: confirmed.date, examType: 'cet6' })
  const goal = events(content)[1]
  const compactDate = confirmed.date.replaceAll('-', '')
  assert.ok(goal.includes(`DTSTART;VALUE=DATE:${compactDate}`))
  assert.ok(goal.includes('SUMMARY:CET-6 备考目标日 · 官方已公布'))
  assert.ok(goal.includes(`个人备考目标日期：${confirmed.date}`))
  assert.ok(goal.includes(`官方来源：${confirmed.source}`))
  assert.ok(goal.includes(`核对日期：${confirmed.checkedAt}`))
  assert.ok(goal.includes('DESCRIPTION:距离备考目标日还有 7 天'))
  for (const line of content.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75)
})

test('ICS: estimated and personal dates use the shared date labels without implying an official exam day', () => {
  for (const [date, status] of [['2027-06-12', 'estimated'], ['2027-06-11', 'personal']] as const) {
    const info = examDateInfo(date)
    assert.equal(info.status, status)
    const goal = events(buildStudyReminderIcs({ examDate: date, examType: 'cet4' }))[1]
    assert.ok(goal.includes(`SUMMARY:CET-4 备考目标日 · ${info.label}`))
    assert.ok(goal.includes(`日期依据：${info.label}`))
    assert.ok(goal.includes(`个人备考目标日期：${date}`))
    assert.ok(!goal.includes('官方来源：'))
    assert.ok(!goal.includes('undefined'))
  }
})

test('ICS: an absent target date continues to export only the daily study reminder', () => {
  const content = buildStudyReminderIcs({ days: 14, hour: 19, minute: 30 })
  const rows = events(content)
  assert.equal(rows.length, 1)
  assert.ok(rows[0].includes('SUMMARY:单词勇者 · 今日任务'))
  assert.ok(rows[0].includes('RRULE:FREQ=DAILY;COUNT=14'))
  assert.match(rows[0], /DTSTART:\d{8}T193000/)
  assert.ok(!content.includes('备考目标'))
  assert.ok(!content.includes('wordquest-exam-'))
})
