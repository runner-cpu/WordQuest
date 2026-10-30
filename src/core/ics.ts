/**
 * 日历订阅 .ics（§5.6）—— 零依赖兜底提醒，任何平台可用。
 * 不依赖 Web Push，也不需要服务器：生成一个本地 .ics 文件，
 * 用户导入系统日历后即可每天收到学习提醒。
 */

import { examDateInfo } from './exam'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本地日期 → ICS 的 floating local time（不带 Z，避免时区错位） */
function icsDateTime(d: Date, hour: number, minute: number): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}${pad(minute)}00`
}

function icsDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** RFC 5545 折行：每行不超过 75 字节 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length
    if (curLen + len > 75) {
      out.push(cur)
      cur = ' ' + ch
      curLen = 1 + len
    } else {
      cur += ch
      curLen += len
    }
  }
  if (cur) out.push(cur)
  return out.join('\r\n')
}

export interface IcsOptions {
  /** 每天提醒时间（小时，0–23） */
  hour?: number
  minute?: number
  /** 个人备考目标日期 YYYY-MM-DD，可选：会额外生成一个全天目标事件 */
  examDate?: string
  examType?: 'cet4' | 'cet6'
  /** 从今天起生成多少天的每日提醒 */
  days?: number
}

export function buildStudyReminderIcs(opts: IcsOptions = {}): string {
  const { hour = 20, minute = 0, examDate, examType = 'cet4', days = 120 } = opts
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WordQuest//Study Reminder//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:单词勇者 · 学习提醒',
    'X-WR-TIMEZONE:Asia/Shanghai',
  ]

  // 每日学习提醒（重复 120 天）
  const start = new Date(now)
  start.setDate(start.getDate() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + days)

  lines.push(
    'BEGIN:VEVENT',
    `UID:wordquest-daily-${stamp}@local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDateTime(start, hour, minute)}`,
    `DTEND:${icsDateTime(start, hour, minute + 15)}`,
    'RRULE:FREQ=DAILY;COUNT=' + days,
    'SUMMARY:单词勇者 · 今日任务',
    `DESCRIPTION:${escapeText('打开 WordQuest 清理到期复习。下限只要 2 分钟，先打开比学 1 小时更容易发生。')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    'DESCRIPTION:今日的单词在等你',
    'END:VALARM',
    'END:VEVENT',
  )

  // 个人备考目标（全天事件），日期依据与界面使用同一来源。
  if (examDate) {
    const d = new Date(`${examDate}T09:00:00`)
    if (!Number.isNaN(d.getTime())) {
      const dateInfo = examDateInfo(examDate)
      const description = [
        `WordQuest 为你记录的个人备考目标日期：${examDate}。`,
        `日期依据：${dateInfo.label}。`,
        ...(dateInfo.source ? [`官方来源：${dateInfo.source}`] : []),
        ...(dateInfo.checkedAt ? [`核对日期：${dateInfo.checkedAt}`] : []),
        '具体考试安排请以官方通知及准考证为准。',
      ].join('\n')
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      lines.push(
        'BEGIN:VEVENT',
        `UID:wordquest-exam-${stamp}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d)}`,
        `DTEND;VALUE=DATE:${icsDate(next)}`,
        `SUMMARY:${escapeText(`${examType === 'cet6' ? 'CET-6' : 'CET-4'} 备考目标日 · ${dateInfo.label}`)}`,
        `DESCRIPTION:${escapeText(description)}`,
        'BEGIN:VALARM',
        'TRIGGER:-P7D',
        'ACTION:DISPLAY',
        'DESCRIPTION:距离备考目标日还有 7 天',
        'END:VALARM',
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
