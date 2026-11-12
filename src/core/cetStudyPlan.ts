import type { CetPaperStudy } from '../types/cetPaper'
import type { Profile } from '../types/model'
import { daysUntil } from './exam'
import { buildPendingCetSections, type PendingCetSection } from './learningReport'

/** 用户自述练习基础，仅用于调整建议，不是测试成绩或能力诊断。 */
export const CET_FOUNDATIONS: readonly { id: NonNullable<Profile['cetFoundation']>; label: string; description: string }[] = [
  { id: 'building', label: '正在打基础', description: '想先巩固常用词汇，逐步接触听读与写译练习。' },
  { id: 'steady', label: '基础逐渐稳定', description: '想围绕题型做专项练习，并回看作答证据。' },
  { id: 'ready', label: '想练综合运用', description: '愿意尝试真题与限时练习，再按核对记录订正。' },
]

export interface CetStudyPlan {
  stage: 'foundation' | 'specialized' | 'mock' | 'sprint'
  stageLabel: string
  stageReason: string
  title: string
  reason: string
  coverageNote?: string
  target: 'vocabulary' | 'listening' | 'prep'
  section?: PendingCetSection
}

const STAGES = {
  foundation: { stageLabel: '基础积累', title: '先巩固一组词汇，再接触一道真题',
    reason: '先完成今天到期的词汇复习，再安排一小段听读或写译；可以随时进入其他练习。', target: 'vocabulary' },
  specialized: { stageLabel: '专项突破', title: '今天安排一项听力或阅读专项',
    reason: '围绕一种题型练习，核对后记录依据，并为写作与翻译各留一点时间。', target: 'listening' },
  mock: { stageLabel: '真题模考', title: '安排一次真题练习并留出订正时间',
    reason: '用完整真题或分项限时练习熟悉顺序；核对后回看证据，再修订写作与翻译。', target: 'prep' },
  sprint: { stageLabel: '考前冲刺', title: '回看旧题证据，再熟悉答题节奏',
    reason: '临近你选择的计划日期，优先订正已有记录，搭配真题与写译修订，避免只增加新题数量。', target: 'prep' },
} as const

/** 只使用自选日期、自述偏好与已保存核对记录；不推断考试分数或锁定入口。 */
export function buildCetStudyPlan(profile: Pick<Profile, 'examDate' | 'cetFoundation'>, studies: CetPaperStudy[], now = new Date()): CetStudyPlan {
  const rawDays = daysUntil(profile.examDate, now)
  const days = rawDays !== null && Number.isFinite(rawDays) ? rawDays : null
  const expired = days !== null && days < 0
  let stage: CetStudyPlan['stage'] = days !== null && !expired && days <= 14 ? 'sprint'
    : days !== null && !expired && days <= 45 ? 'mock'
      : days !== null && !expired && days <= 90 ? 'specialized' : 'foundation'
  const selfReported = profile.cetFoundation === 'steady' || profile.cetFoundation === 'ready'
  if ((days === null || days > 90 || expired) && selfReported) stage = 'specialized'

  const calendarReason = expired ? `你选择的计划日期 ${profile.examDate} 已过，请更新日期后重新安排节奏。`
    : days === null ? '尚未设置有效的计划日期，先给出可随时调整的练习建议。'
      : `距离你选择的计划日期 ${profile.examDate} 还有 ${days} 天，按日历天安排当前阶段。`
  const preferenceReason = (days === null || days > 90 || expired) && selfReported
    ? '结合你自述的基础偏好，建议先从题型专项开始。'
    : profile.cetFoundation === 'building' ? '你自选了正在打基础，可把词汇复习分散到每天。' : ''
  const plan: CetStudyPlan = { stage, ...STAGES[stage], stageReason: `${calendarReason}${preferenceReason}` }

  const pending = buildPendingCetSections(studies).filter(section => section.pending > 0)
  const covered = pending.filter(section => section.covered > 0)
  const candidates = covered.length ? covered : pending
  const section = candidates.reduce<PendingCetSection | undefined>((best, next) =>
    !best || next.pending > best.pending ? next : best, undefined)
  if (section) {
    plan.section = { ...section }
    plan.target = section.id === 'listening' ? 'listening' : 'prep'
    plan.title = `先订正${section.name}的 ${section.pending} 道题`
    plan.reason = `按最近保存的核对记录，${section.name}有 ${section.pending} 道待订正题。${covered.length
      ? '先从有解析覆盖的题型中处理待订正最多的一项，回看原文与作答依据。'
      : '先处理待订正最多的一项，逐题对照原卷、答案和自己的依据。'}`
    plan.coverageNote = section.covered > 0
      ? `这 ${section.pending} 道待订正题中，${section.covered} 道有结构化解析，${section.verified} 道已核验${section.covered > section.verified ? `，${section.covered - section.verified} 道为待人工核验的解析草稿` : ''}。解析仅覆盖部分卷别，请结合原卷核对。`
      : '该题型暂无结构化解析，请手动对照原卷与答案。解析仅覆盖部分卷别。'
  } else if (expired) {
    plan.title = '更新计划日期，再安排今天的练习'
    plan.reason = `你选择的计划日期 ${profile.examDate} 已过。可以先继续${stage === 'foundation' ? '词汇复习' : '专项练习'}，更新日期后再调整阶段建议。`
  }
  return plan
}
