import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { ACHIEVEMENTS, achievementProgress, buildAchievementCtx, type AchievementCategory, type AchievementCtx, type AchievementDef } from '../core/progress'
import { achievementTarget } from '../core/achievements'
import { COIN_RULES } from '../core/game'
import { useUi } from '../state/ui'
import type { AchievementUnlock } from '../types/model'
import { EmptyState, Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'

const TRACKED_KEY = 'wq:tracked-achievement'
const TRACKED_EVENT = 'wq:achievement-tracker-change'
const CATEGORIES: AchievementCategory[] = ['坚持', '词汇', '复习', '拼写', '听力', '运用']
type GalleryFilter = 'all' | 'near' | 'unlocked'

function readTracked() {
  try { return localStorage.getItem(TRACKED_KEY) ?? '' } catch { return '' }
}

function useTrackedAchievement() {
  const [tracked, setTracked] = useState(readTracked)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === TRACKED_KEY) setTracked(event.newValue ?? '') }
    const onPreference = (event: Event) => setTracked((event as CustomEvent<string>).detail ?? '')
    window.addEventListener('storage', onStorage)
    window.addEventListener(TRACKED_EVENT, onPreference)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(TRACKED_EVENT, onPreference) }
  }, [])
  function track(id: string) {
    setTracked(id)
    try { if (id) localStorage.setItem(TRACKED_KEY, id); else localStorage.removeItem(TRACKED_KEY) } catch { /* 本次页面仍可追踪。 */ }
    window.dispatchEvent(new CustomEvent(TRACKED_EVENT, { detail: id }))
  }
  return [tracked, track] as const
}

function useAchievementSnapshot(refresh = 0) {
  return useLiveQuery(async () => {
    try {
      const [ctx, unlocks] = await Promise.all([buildAchievementCtx(), db.achievements.toArray()])
      return { ctx, unlocks, error: '' }
    } catch {
      return { ctx: null, unlocks: [] as AchievementUnlock[], error: '成就暂时没能读取，可以重试。' }
    }
  }, [refresh])
}

function ProgressLine({ achievement, ctx, complete = false }: { achievement: AchievementDef; ctx: AchievementCtx; complete?: boolean }) {
  const progress = achievementProgress(achievement, ctx)
  const current = complete ? progress.target : progress.current
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap justify-between gap-x-2 text-px12 text-dim tnum">
        <span>{current.toLocaleString('zh-CN')} / {progress.target.toLocaleString('zh-CN')} {achievement.unit}</span>
        <span>{complete ? '已完成' : `还差 ${Number(progress.remaining.toFixed(1)).toLocaleString('zh-CN')} ${achievement.unit}`}</span>
      </div>
      <PixelBar value={current} max={progress.target} label={`${achievement.name}进度`} />
    </div>
  )
}

function TargetContent({ ctx, unlocked, tracked, onClear }: {
  ctx: AchievementCtx; unlocked: ReadonlySet<string>; tracked: string; onClear: () => void
}) {
  const target = achievementTarget(ctx, unlocked, tracked)
  if (!target) return <p className="readable text-px12 text-dim">公开成就已全部点亮。继续按自己的节奏练习，也许会遇到新的惊喜。</p>
  const done = unlocked.has(target.id)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-px12">
        <span className="flex items-center gap-2 text-gold"><Icon name={done ? 'check' : 'target'} size={16} />{done ? '目标已达成' : tracked === target.id ? '正在追踪' : '下一枚推荐'} · {target.name}</span>
        <span className="tnum text-dim">{done ? '已领' : '解锁'} +{COIN_RULES.achievement} 金币</span>
      </div>
      <p className="readable mt-1 text-px12 text-dim">{target.desc}</p>
      <ProgressLine achievement={target} ctx={ctx} complete={done} />
      {tracked === target.id && <PixelButton size="sm" variant="ghost" className="mt-2" onClick={onClear}>改为自动推荐</PixelButton>}
    </div>
  )
}

/** 今日页也可直接使用；追踪只保存偏好，进度来自 IndexedDB。 */
export function AchievementTracker() {
  const snapshot = useAchievementSnapshot()
  const [tracked, track] = useTrackedAchievement()
  const setTab = useUi((state) => state.setTab)
  if (!snapshot?.ctx || snapshot.error) return null
  const unlocked = new Set(snapshot.unlocks.map((row) => row.id))
  return (
    <Panel>
      <SectionHead right={<button className="pixel-btn pixel-btn-sm" onClick={() => setTab('me')}>成就馆 <Icon name="arrow-right" size={12} /></button>}>再近一步</SectionHead>
      <TargetContent ctx={snapshot.ctx} unlocked={unlocked} tracked={tracked} onClear={() => track('')} />
    </Panel>
  )
}

export function AchievementGallery() {
  const [refresh, setRefresh] = useState(0)
  const snapshot = useAchievementSnapshot(refresh)
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const [category, setCategory] = useState<AchievementCategory | '全部方向'>('全部方向')
  const [visibleCount, setVisibleCount] = useState(12)
  const [tracked, track] = useTrackedAchievement()
  const unlocked = useMemo(() => new Set(snapshot?.unlocks.map((row) => row.id) ?? []), [snapshot?.unlocks])
  const latest = useMemo(() => [...(snapshot?.unlocks ?? [])].sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 3), [snapshot?.unlocks])
  const visible = useMemo(() => {
    const ctx = snapshot?.ctx
    if (!ctx) return []
    return ACHIEVEMENTS.filter((achievement) => {
      const isUnlocked = unlocked.has(achievement.id)
      if (achievement.hidden && !isUnlocked) return false
      if (category !== '全部方向' && achievement.category !== category) return false
      if (filter === 'unlocked') return isUnlocked
      if (filter === 'near') return !isUnlocked && achievementProgress(achievement, ctx).ratio > 0
      return true
    }).sort((a, b) => {
      if (filter === 'unlocked') {
        const time = (id: string) => snapshot.unlocks.find((row) => row.id === id)?.unlockedAt ?? 0
        return time(b.id) - time(a.id)
      }
      const done = Number(unlocked.has(a.id)) - Number(unlocked.has(b.id))
      return done || achievementProgress(b, ctx).ratio - achievementProgress(a, ctx).ratio
    })
  }, [snapshot, unlocked, filter, category])
  const hiddenRemaining = ACHIEVEMENTS.filter((achievement) => achievement.hidden && !unlocked.has(achievement.id)).length
  const knownUnlocks = ACHIEVEMENTS.filter((achievement) => unlocked.has(achievement.id)).length
  useEffect(() => { setVisibleCount(12) }, [filter, category])

  return (
    <Panel>
      <SectionHead right={`${knownUnlocks}/${ACHIEVEMENTS.length}`}>成就馆</SectionHead>
      <p className="readable mb-3 text-px12 text-dim">每一枚记录一次学习进展。解锁固定获得 <span className="text-gold">{COIN_RULES.achievement} 金币</span>，自动入账。</p>
      {!snapshot && <p role="status" className="py-4 text-center text-px12 text-dim">正在整理你的学习足迹…</p>}
      {snapshot?.error && <div role="status" className="space-y-2"><p className="readable text-px12 text-dim">{snapshot.error}</p><PixelButton onClick={() => setRefresh((value) => value + 1)}>重试读取</PixelButton></div>}
      {snapshot?.ctx && <>
        <div className="border-2 border-gold bg-panel-2 p-3">
          <TargetContent ctx={snapshot.ctx} unlocked={unlocked} tracked={tracked} onClear={() => track('')} />
        </div>
        {latest.length > 0 && <div className="mt-3 border-b-2 border-edge pb-3">
          <h3 className="mb-2 text-px12 text-bright">最近点亮</h3>
          <ul className="space-y-1">
            {latest.map((row) => {
              const achievement = ACHIEVEMENTS.find((item) => item.id === row.id)
              if (!achievement) return null
              return <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-2 text-px12"><span className="flex items-center gap-2 text-gold"><Icon name="medal" size={16} />{achievement.name}</span><span className="text-dim tnum">{new Date(row.unlockedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · +{COIN_RULES.achievement} 金币</span></li>
            })}
          </ul>
        </div>}
        <div className="mt-3 grid grid-cols-3 gap-1" role="group" aria-label="成就完成状态">
          {([['all', '全部'], ['near', '接近达成'], ['unlocked', '已解锁']] as const).map(([value, label]) => <PixelButton key={value} size="sm" variant={filter === value ? 'primary' : 'ghost'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</PixelButton>)}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-px12 text-dim">学习方向<select className="pixel-input min-h-11 px-2 py-1 text-px12" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option>全部方向</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <span className="text-px12 text-dim tnum">{visible.length} 枚</span>
        </div>
        {visible.length === 0 && <EmptyState icon="medal" title={filter === 'unlocked' ? '这一方向还没点亮成就' : '新的足迹从一次练习开始'} hint={filter === 'near' ? '完成一次单词、听力或情景练习，就会看到正在接近的目标。' : '换个方向看看，或选一枚公开成就开始追踪。'} />}
        <div className="mt-2 space-y-3">
          {CATEGORIES.map((dimension) => {
            const items = visible.slice(0, visibleCount).filter((achievement) => achievement.category === dimension)
            if (items.length === 0) return null
            return <section key={dimension} aria-label={`${dimension}成就`}>
              <h3 className="border-b-2 border-edge py-2 text-px12 text-bright">{dimension}</h3>
              <ul className="divide-y divide-edge">
                {items.map((achievement) => {
                  const done = unlocked.has(achievement.id)
                  const pinned = tracked === achievement.id
                  return <li key={achievement.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <span className={done ? 'mt-1 text-gold' : 'mt-1 text-dim'}><Icon name={done ? 'medal' : 'target'} size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-px12"><span className={done ? 'text-gold' : 'text-bright'}>{achievement.name}</span><span className="text-dim tnum">{done ? '已领' : '解锁'} +{COIN_RULES.achievement} 金币</span></div>
                        <p className="readable mt-1 text-px12 text-dim">{achievement.desc}</p>
                        <ProgressLine achievement={achievement} ctx={snapshot.ctx!} complete={done} />
                        {!done && <PixelButton size="sm" variant={pinned ? 'primary' : 'ghost'} className="mt-2" aria-pressed={pinned} onClick={() => track(pinned ? '' : achievement.id)}>{pinned ? '正在追踪' : '追踪这一项'}</PixelButton>}
                      </div>
                    </div>
                  </li>
                })}
              </ul>
            </section>
          })}
        </div>
        {visible.length > visibleCount && <PixelButton className="mt-3 w-full" variant="ghost" onClick={() => setVisibleCount((count) => count + 12)}>再看 {Math.min(12, visible.length - visibleCount)} 枚（还有 {visible.length - visibleCount} 枚）</PixelButton>}
        {hiddenRemaining > 0 && <div className="mt-3 flex items-center gap-2 border-t-2 border-edge pt-3 text-px12 text-dim"><Icon name="lock" size={16} /><p className="readable">还有 {hiddenRemaining} 枚隐藏成就。条件会在点亮时揭晓。</p></div>}
      </>}
    </Panel>
  )
}
