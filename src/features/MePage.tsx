import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { AchievementGallery } from './AchievementGallery'
import { RANKS, rankFromPower, levelProgress } from '../core/game'
import { ensureProfile, patchProfile } from '../core/profile'
import { examDateInfo, formatExamDate, upcomingExamSessions } from '../core/exam'
import { Mascot, Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import type { Profile } from '../types/model'
import { Icon } from '../ui/icons'
import { applyTheme } from '../ui/theme'
import { useUi } from '../state/ui'
import { ensureSeedBook } from '../core/wordbook'
import { SHOP_ITEMS, applyPurchase, canBuy } from '../core/shop'

export function MePage({
  onOpenSettings,
  /** 首启引导模式：只渲染快速设置。 */
  __forceOnboarding = false,
  __onOnboarded,
}: {
  onOpenSettings: () => void
  __forceOnboarding?: boolean
  __onOnboarded?: (p: Profile) => void
}) {
  const profile = useUi((s) => s.profile)
  const setProfile = useUi((s) => s.setProfile)
  const pushToast = useUi((s) => s.pushToast)
  const reviewCount = useLiveQuery(() => db.reviewLogs.count(), [])

  useEffect(() => {
    void ensureProfile().then(setProfile)
  }, [setProfile])

  const rank = rankFromPower(profile?.powerPeak ?? 0)
  const lp = levelProgress(profile?.xp ?? 0)

  return (
    <div className="space-y-3 p-3 pb-24 md:p-5 md:pb-8">
      {/* 词汇积累阶段 */}
      <Panel className="!border-gold">
        <div className="flex items-start gap-3">
          <Mascot stage={rank.rank.mascotStage} size={72} mood="happy" skin={profile?.mascot.skin} />
          <div className="min-w-0 flex-1">
            <div className="text-px24 text-gold">
              {rank.rank.code} {rank.rank.name}
              <span className="ml-2 text-px12 text-dim">{['Ⅰ', 'Ⅱ', 'Ⅲ'][rank.tier]}</span>
            </div>
            <div className="text-px12 text-dim tnum">
              词汇力 {profile?.power ?? 0} · 峰值 {profile?.powerPeak ?? 0}
              {rank.next
                ? ` · 距下一级 ${Math.max(0, rank.next.threshold - (profile?.powerPeak ?? 0))}`
                : ' · 已达顶点'}
            </div>
            <div className="mt-2">
              <PixelBar
                value={rank.next ? (profile?.powerPeak ?? 0) - rank.rank.threshold : 1}
                max={rank.next ? rank.next.threshold - rank.rank.threshold : 1}
                color="var(--wq-gold)"
                label="词汇积累进度"
              />
            </div>
          </div>
        </div>
        <p className="readable mt-3 text-px12 text-dim">{rank.rank.desc}。阶段依据应用内词卡积累展示，四六级各项能力需另行练习与评估。</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="等级" value={`LV.${lp.level}`} />
          <Mini label="经验" value={String(profile?.xp ?? 0)} />
          <Mini label="金币" value={String(profile?.coins ?? 0)} />
        </div>
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-px12 text-dim tnum">
            <span>
              LV.{lp.level} → LV.{lp.level + 1}
            </span>
            <span className="tnum">还差 {Math.max(0, lp.span - lp.into)} XP</span>
          </div>
          <PixelBar value={lp.into} max={lp.span} label="等级经验" />
        </div>
        {profile?.dormancy && <div className="mt-2 text-px12 text-dim">好久没复习了，回访继续积累</div>}
      </Panel>

      {!profile?.onboarded && (
        <Onboarding
          onDone={async (patch) => {
            const next = await patchProfile({ ...patch, onboarded: true })
            setProfile(next)
            __onOnboarded?.(next)
            // 用户选了六级就立刻备好六级核心词，避免开始学习时才发现没词库
            const bookId = patch.examType === 'cet6' ? 'cet6-core' : 'cet4-core'
            try {
              await ensureSeedBook(bookId)
              pushToast('设置完成，词书已就绪', 'levelup')
            } catch {
              pushToast('设置完成，但词书下载失败，请到「单词」页重试')
            }
          }}
        />
      )}

      {__forceOnboarding && profile?.onboarded && (
        <Panel className="!border-gold">
          <div className="flex items-center gap-1 text-px12 text-gold">
            <Icon name="spark" size={16} />
            设置完成
          </div>
          <p className="readable mt-1 text-px12 text-dim">
            词书已备好，回到「今日」开始第一轮学习吧。
          </p>
          <PixelButton className="mt-2 w-full" variant="primary" onClick={() => __onOnboarded?.(profile)}>
            进入今日
          </PixelButton>
        </Panel>
      )}

      {!__forceOnboarding && (
      <>
      <AchievementGallery />

      {/* 积累阶段阶梯 */}
      <Panel>
        <SectionHead>词汇积累阶段与解锁</SectionHead>
        <ol className="space-y-1">
          {RANKS.map((r) => {
            const reached = (profile?.powerPeak ?? 0) >= r.threshold
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1 text-px12">
                <span className={`flex shrink-0 items-center gap-1 ${reached ? 'text-gold' : 'text-dim'}`}>
                  <Icon name={reached ? 'check' : 'lock'} size={16} />
                  {r.name}
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-px12 text-dim">
                  <span className="tnum">{r.threshold}</span>
                  <span className="truncate text-right">{r.unlock}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </Panel>

      {/* 商店 */}
      <Panel>
        <SectionHead right={`金币 ${profile?.coins ?? 0} · 碎片 ${profile?.themeFragments ?? 0}`}>
          商店
        </SectionHead>
        <p className="readable mb-2 text-px12 text-dim">
          金币只能靠学习获得，只换外观与便利，不卖学习能力。
        </p>
        <ul className="space-y-2">
          {SHOP_ITEMS.map((item) => {
            const check = profile ? canBuy(item, profile) : { ok: false, reason: '' }
            const owned =
              (item.kind === 'theme' && profile?.ownedThemes?.includes(item.payload)) ||
              (item.kind === 'mascot' && profile?.ownedSkins?.includes(item.payload))
            return (
              <li key={item.id} className="flex items-center gap-2 border-b border-edge/50 pb-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-px12 text-bright">{item.name}</div>
                  <div className="readable text-px12 text-dim">{item.desc}</div>
                </div>
                {owned ? (
                  <span className="shrink-0 text-px12 text-pass">已拥有</span>
                ) : (
                  <PixelButton
                    size="sm"
                    variant={check.ok ? 'primary' : 'ghost'}
                    disabled={!check.ok}
                    onClick={async () => {
                      if (!profile) return
                      const next = await patchProfile(applyPurchase(item, profile))
                      setProfile(next)
                      if (item.kind === 'theme') applyTheme(item.payload)
                      pushToast(`已购买：${item.name}`, 'levelup')
                    }}
                  >
                    {check.ok
                      ? item.fragmentCost
                        ? `${item.fragmentCost} 碎片`
                        : `${item.price} 金币`
                      : (check.reason ?? '不可购买')}
                  </PixelButton>
                )}
              </li>
            )
          })}
        </ul>
        <p className="readable mt-2 text-px12 text-dim">
          基础听力短练、选词填空与整句听写均可直接练习，外观按积累阶段解锁。
        </p>
      </Panel>

      <Panel>
        <SectionHead>设置与数据</SectionHead>
        <p className="readable mb-2 text-px12 text-dim">
          词书、每日新词量、备考目标、计划考试日期、主题、音效和备份都在设置里。
        </p>
        <PixelButton className="w-full" variant="primary" icon="target" onClick={onOpenSettings}>
          打开设置
        </PixelButton>
        <p className="mt-2 text-px12 text-dim tnum">已记录 {reviewCount ?? 0} 条复习日志</p>
      </Panel>

      </>
      )}

      <p className="pb-2 text-center text-px12 leading-relaxed text-dim">
        词库 ECDICT (MIT) · 复习算法 ts-fsrs (MIT) · 字体 Fusion Pixel (OFL 1.1)
        <br />
        完全离线可用，无内购，无广告
      </p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-edge bg-panel-2 py-1 text-center">
      <div className="text-px12 text-bright tnum">{value}</div>
      <div className="text-px12 text-dim">{label}</div>
    </div>
  )
}

function Onboarding({ onDone }: { onDone: (patch: Record<string, unknown>) => Promise<void> }) {
  const [step, setStep] = useState(0)
  const [examType, setExamType] = useState<'cet4' | 'cet6'>('cet4')
  const [examDate, setExamDate] = useState('')
  const [customDate, setCustomDate] = useState(false)
  const [dailyNew, setDailyNew] = useState(20)
  const [name, setName] = useState('阿词')
  /** 提交中禁用「开始冒险」，防止双击重复写词书下载 */
  const [submitting, setSubmitting] = useState(false)
  const sessions = useMemo(() => upcomingExamSessions(4), [])
  const dateInfo = examDateInfo(examDate)

  const steps = [
    <div key="1" className="space-y-3">
      <div>
        <div className="mb-1 text-px12 text-bright">你准备考哪个</div>
        <div className="grid grid-cols-2 gap-2">
          {(['cet4', 'cet6'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setExamType(t)}
              aria-pressed={examType === t}
              className={`pixel-btn py-3 ${examType === t ? 'pixel-btn-primary' : ''}`}
            >
              {t === 'cet4' ? 'CET-4 四级' : 'CET-6 六级'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-px12 text-bright">选择计划考试日期</div>
        <p className="readable mb-2 text-px12 text-dim">
          已公布场次附官方来源；其他日期为预计，仅供规划。参加考试请按报名通知与准考证安排。
        </p>
        <div className="space-y-1">
          {sessions.map((s) => {
            const picked = examDate === s.date
            return (
              <button
                key={s.id}
                onClick={() => {
                  setExamDate(s.date)
                  setCustomDate(false)
                }}
                aria-pressed={picked}
                className={`flex w-full items-center justify-between gap-2 border-2 px-2 py-2 text-left text-px12 ${
                  picked ? 'border-gold bg-panel-2 text-bright' : 'border-edge text-dim'
                }`}
              >
                <span className="text-bright">{s.label} · {s.status === 'confirmed' ? '官方已公布' : '预计'}</span>
                <span className="tnum">
                  {s.date.slice(5)} · 还有 {s.daysLeft} 天
                </span>
              </button>
            )
          })}
          <button
            onClick={() => setCustomDate((v) => !v)}
            aria-expanded={customDate}
            className={`flex w-full items-center justify-between border-2 px-2 py-2 text-px12 ${
              customDate ? 'border-gold text-bright' : 'border-edge text-dim'
            }`}
          >
            <span>其他日期</span>
            <span>{customDate ? '收起' : '手动选择'}</span>
          </button>
          {customDate && (
            <input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="pixel-input w-full px-2 py-2"
              aria-label="自定义计划考试日期"
            />
          )}
        </div>
        {examDate && (
          <div className="mt-2 space-y-1 text-px12">
            <p className="text-gold">计划日期：{formatExamDate(examDate)}</p>
            <p className="text-dim">{dateInfo.label}</p>
            {dateInfo.source && <a className="text-gold underline" href={dateInfo.source} target="_blank" rel="noreferrer">官方通知 · 核对于 {dateInfo.checkedAt}</a>}
          </div>
        )}
      </div>
    </div>,
    <div key="2" className="space-y-2">
      <div className="text-px12 text-bright">每天想学多少新词</div>
      <div className="grid grid-cols-2 gap-2">
        {[10, 20, 40, 60].map((n) => (
          <button
            key={n}
            onClick={() => setDailyNew(n)}
            aria-pressed={dailyNew === n}
            className={`pixel-btn py-3 ${dailyNew === n ? 'pixel-btn-primary' : ''}`}
          >
            {n} 个
          </button>
        ))}
      </div>
      <p className="readable text-px12 text-dim">随时可改。到期复习永远优先于新词。</p>
    </div>,
    <div key="3" className="space-y-2">
      <div className="text-px12 text-bright">给你的吉祥物起个名</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 8))}
        className="pixel-input w-full px-3 py-2 text-center"
        placeholder="阿词"
        aria-label="吉祥物名字"
      />
      <div className="flex justify-center pt-1">
        <Mascot stage="蛋" size={72} mood="happy" />
      </div>
      <p className="readable text-center text-px12 text-dim">它会随词汇积累阶段成长，从蛋开始。</p>
    </div>,
  ]

  return (
    <Panel className="!border-gold">
      <SectionHead right={`${step + 1}/3`}>备考快速设置</SectionHead>
      {steps[step]}
      <div className="mt-3 flex gap-2">
        {step > 0 && (
          <PixelButton variant="ghost" className="flex-1" onClick={() => setStep((s) => s - 1)}>
            上一步
          </PixelButton>
        )}
        <PixelButton
          variant="primary"
          className="flex-1"
          disabled={submitting}
          onClick={() => {
            if (step < 2) setStep((s) => s + 1)
            else {
              setSubmitting(true)
              void onDone({
                examType,
                studyBook: examType === 'cet6' ? 'cet6-core' : 'cet4-core',
                examDate: examDate || undefined,
                dailyNewTarget: dailyNew,
                mascot: { name: name || '阿词', skin: 'default' },
              })
            }
          }}
        >
          {step < 2 ? '下一步' : submitting ? '正在准备词书…' : '开始冒险'}
        </PixelButton>
      </div>
    </Panel>
  )
}
