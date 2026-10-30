/**
 * 四六级考试场次。
 *
 * 已公布场次保留官方来源与核对日期；其余场次按第二个周六估算，
 * 仅供个人备考规划。Profile.examDate 始终是用户选择的计划日期。
 */

export interface ExamSession {
  /** 稳定 id，形如 2026-06 */
  id: string
  year: number
  month: 6 | 12
  /** YYYY-MM-DD */
  date: string
  /** 展示文案，如「2026 年 6 月」 */
  label: string
  /** 距离今天的天数 */
  daysLeft: number
  status: 'confirmed' | 'estimated'
  source?: string
  checkedAt?: string
}

export interface ExamDateInfo {
  status: 'confirmed' | 'estimated' | 'personal'
  label: string
  source?: string
  checkedAt?: string
}

/** 核验自教育部教育考试院的已公布笔试日期，按场次 id 查找。 */
export const CONFIRMED_EXAM_SESSIONS: Readonly<Record<string, {
  date: string
  source: string
  checkedAt: string
}>> = {
  '2026-12': {
    date: '2026-12-12',
    source: 'https://www.neea.edu.cn/html1/report/2609/1-1.htm',
    checkedAt: '2026-10-30',
  },
}

/** 当月第二个周六 */
function secondSaturday(year: number, month: number): Date {
  const first = new Date(year, month - 1, 1)
  const firstWeekday = first.getDay() // 0=周日
  // 到第一个周六还差几天（周六=6）
  const offset = (6 - firstWeekday + 7) % 7
  const firstSaturday = 1 + offset
  return new Date(year, month - 1, firstSaturday + 7)
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localDate(dateStr?: string): Date | undefined {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined
  const d = new Date(`${dateStr}T00:00:00`)
  return !Number.isNaN(d.getTime()) && toKey(d) === dateStr ? d : undefined
}

/** 来源说明由日期推导，不额外改写用户保存的目标日期。 */
export function examDateInfo(dateStr?: string): ExamDateInfo {
  const d = localDate(dateStr)
  if (!d) return { status: 'personal', label: dateStr ? '个人计划日期' : '未设置' }
  const sessionId = dateStr!.slice(0, 7)
  const confirmed = CONFIRMED_EXAM_SESSIONS[sessionId]
  if (confirmed?.date === dateStr) return { status: 'confirmed', label: '官方已公布', source: confirmed.source, checkedAt: confirmed.checkedAt }
  const month = d.getMonth() + 1
  if ((month === 6 || month === 12) && toKey(secondSaturday(d.getFullYear(), month)) === dateStr) {
    return { status: 'estimated', label: '预计日期 · 以官方通知为准' }
  }
  return { status: 'personal', label: '个人计划日期' }
}

/** 未来的 n 个考试场次，按时间升序 */
export function upcomingExamSessions(count = 4, now = new Date()): ExamSession[] {
  const out: ExamSession[] = []
  const startYear = now.getFullYear()
  for (let year = startYear; out.length < count && year < startYear + 4; year++) {
    for (const month of [6, 12] as const) {
      const id = `${year}-${String(month).padStart(2, '0')}`
      const confirmed = CONFIRMED_EXAM_SESSIONS[id]
      const d = confirmed ? localDate(confirmed.date)! : secondSaturday(year, month)
      // 当天及以后都算可选；已经过了的场次跳过
      const endOfDay = new Date(d)
      endOfDay.setHours(23, 59, 59, 999)
      if (endOfDay < now) continue
      const daysLeft = Math.max(0, daysUntil(toKey(d), now) ?? 0)
      out.push({
        id,
        year,
        month,
        date: toKey(d),
        label: `${year} 年 ${month} 月`,
        daysLeft,
        status: confirmed ? 'confirmed' : 'estimated',
        ...(confirmed ? { source: confirmed.source, checkedAt: confirmed.checkedAt } : {}),
      })
      if (out.length >= count) break
    }
  }
  return out
}

/** 把任意日期格式化成「2026 年 12 月 12 日（周六）」 */
export function formatExamDate(dateStr?: string): string {
  if (!dateStr) return ''
  const d = localDate(dateStr)
  if (!d) return dateStr
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（${week}）`
}

export function daysUntil(dateStr?: string, now = new Date()): number | null {
  if (!dateStr) return null
  const d = localDate(dateStr)
  if (!d) return null
  // 按本地日历日计数：日期字符串直接 new Date 会按 UTC 解析，且夏令时
  // 切换的一天可能不是 24 小时。把双方的年月日映射到 UTC 后再相减。
  const targetDay = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((targetDay - currentDay) / 86400000)
}
