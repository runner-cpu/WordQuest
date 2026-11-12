import { useId, useMemo } from 'react'
import { CET_FOUNDATIONS } from '../core/cetStudyPlan'
import { examDateInfo, formatExamDate, upcomingExamSessions } from '../core/exam'
import type { Profile } from '../types/model'
import { PixelButton } from '../ui/Pixel'

export type PlanningPreferencesValue = Pick<Profile, 'examDate' | 'cetFoundation'>

/** Optional self-reported planning inputs; no date or foundation is selected for the learner. */
export function PlanningPreferences({ examDate, cetFoundation, onChange, disabled = false }: PlanningPreferencesValue & {
  onChange: (patch: Partial<PlanningPreferencesValue>) => void
  disabled?: boolean
}) {
  const id = useId()
  const sessions = useMemo(() => upcomingExamSessions(4), [])
  const dateInfo = examDateInfo(examDate)
  const foundation = CET_FOUNDATIONS.find((item) => item.id === cetFoundation)

  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <div>
      <label className="mb-2 block text-px12 text-bright" htmlFor={`${id}-date`}>考试日期（可选）</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={`${id}-date`} type="date" value={examDate ?? ''} onChange={(event) => onChange({ examDate: event.target.value || undefined })}
          className="pixel-input readable min-h-11 min-w-0 max-w-full flex-1 px-3 py-2 !text-[16px]" aria-describedby={`${id}-date-help`} />
        {examDate && <PixelButton size="sm" variant="ghost" onClick={() => onChange({ examDate: undefined })}>清除考试日期</PixelButton>}
      </div>
      <p id={`${id}-date-help`} className="readable mt-2 text-[16px] leading-relaxed text-dim">可以留空。这里保存你的计划日期，参加考试请按报名通知与准考证安排。</p>
      {examDate && <div className="readable mt-2 space-y-1 text-[16px] leading-relaxed">
        <p className="text-gold">计划日期：{formatExamDate(examDate)}</p>
        <p className="text-dim">{dateInfo.label}</p>
        {dateInfo.source && <a className="text-gold underline" href={dateInfo.source} target="_blank" rel="noreferrer">官方通知 · 核对于 {dateInfo.checkedAt}</a>}
      </div>}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-px12 text-dim">查看可选场次（含预计）</summary>
        <p className="readable mb-2 text-[16px] leading-relaxed text-dim">已公布场次附官方来源；其他场次为预计，仅供个人规划。点击后才会选中日期。</p>
        <div className="space-y-2">{sessions.map((session) => <button key={session.id} type="button" aria-pressed={examDate === session.date}
          onClick={() => onChange({ examDate: session.date })}
          className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 border-2 px-3 py-2 text-left text-px12 ${examDate === session.date ? 'border-gold bg-panel-2 text-bright' : 'border-edge text-dim'}`}>
          <span>{session.label} · {session.status === 'confirmed' ? '官方已公布' : '预计'}</span>
          <span className="tnum">{session.date.slice(5)} · 还有 {session.daysLeft} 天</span>
        </button>)}</div>
      </details>
    </div>
    <div>
      <label className="mb-2 block text-px12 text-bright" htmlFor={`${id}-foundation`}>自述基础（可选）</label>
      <select id={`${id}-foundation`} value={cetFoundation ?? ''} onChange={(event) => onChange({ cetFoundation: CET_FOUNDATIONS.find((item) => item.id === event.target.value)?.id })}
        className="pixel-input readable min-h-11 w-full min-w-0 px-3 py-2 !text-[16px]" aria-describedby={`${id}-foundation-help`}>
        <option value="">暂不设置</option>
        {CET_FOUNDATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <p id={`${id}-foundation-help`} className="readable mt-2 text-[16px] leading-relaxed text-dim">{foundation?.description ?? '按自己的学习感受选择，也可以跳过；这不是能力测评。'}</p>
    </div>
    <p className="readable text-[16px] leading-relaxed text-dim">两项只用于安排学习建议，随时可在设置修改或清空，所有练习都可直接使用。</p>
  </fieldset>
}
