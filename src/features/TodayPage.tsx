import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, dateKeyOffset, todayKey } from '../db/database'
import { ensureProfile, getDaily } from '../core/profile'
import { planSession, todayProgress } from '../core/session'
import { claimChest, ensureTodayQuests, getTodayQuests } from '../core/progress'
import { levelProgress, rankFromPower } from '../core/game'
import { daysUntil, examDateInfo } from '../core/exam'
import { BOOKS, bookName, importedBookCounts, wordsForBook } from '../core/wordbook'
import { Mascot, Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { useUi } from '../state/ui'
import { useBattle } from '../state/battle'
import { useStudyClock } from '../state/useStudyClock'
import { buildWeeklyReport, markWeeklySeen, weeklySeen, type WeeklyReport } from '../core/weekly'
import type { BookId } from '../types/model'

const MASCOT_LINES = ['每天认几个词，慢慢就有了积累。', '今天也要加油哦。', '我闻到新单词的味道了。', '复习比新词更重要呢。', '准备好了就一起出发吧。']
const AdventureHub = lazy(() => import('./AdventureHub').then((module) => ({ default: module.AdventureHub })))
const CetPrepHub = lazy(() => import('./CetPrepHub').then((module) => ({ default: module.CetPrepHub })))
const AchievementTracker = lazy(() => import('./AchievementGallery').then((module) => ({ default: module.AchievementTracker })))

export function TodayPage() {
  const profile = useUi((s) => s.profile)
  const setProfile = useUi((s) => s.setProfile)
  const pushToast = useUi((s) => s.pushToast)
  const setTab = useUi((s) => s.setTab)
  const openCetPrep = useUi((s) => s.openCetPrep)
  const openBattle = useBattle((s) => s.open)
  const now = useStudyClock()
  const day = todayKey(new Date(now))
  const studyBook: BookId = BOOKS.find((b) => b.id === profile?.studyBook)?.id ?? (profile?.examType === 'cet6' ? 'cet6-core' : 'cet4-core')
  const startLock = useRef(false)
  const chestLock = useRef(false)
  const [starting, setStarting] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [startError, setStartError] = useState('')
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)
  const bookCounts = useLiveQuery(() => importedBookCounts(), [])
  const effectiveBook = (bookCounts?.get(studyBook) ?? 0) > 0
    ? studyBook
    : BOOKS.find((b) => (bookCounts?.get(b.id) ?? 0) > 0)?.id ?? studyBook
  const usingFallback = bookCounts !== undefined && effectiveBook !== studyBook
  const daily = useLiveQuery(() => getDaily(day), [day])
  const prog = useLiveQuery(() => todayProgress(), [now])
  const bookDue = useLiveQuery(async () => {
    const ids = new Set((await wordsForBook(effectiveBook)).map((w) => w.id))
    return db.stats.where('fsrs.due').belowOrEqual(now).filter((s) => s.fsrs.reps > 0 && ids.has(s.wordId)).count()
  }, [effectiveBook, now])
  const quests = useLiveQuery(() => getTodayQuests(), [day, now])
  const recentDays = useLiveQuery(async () => {
    const keys = Array.from({ length: 7 }, (_, i) => dateKeyOffset(i - 6, new Date(now)))
    const rows = await db.dailyLogs.bulkGet(keys)
    return keys.map((date, i) => ({ date, log: rows[i] }))
  }, [day])

  useEffect(() => {
    void ensureTodayQuests().catch(() => pushToast('今日任务暂时无法读取，请刷新后重试'))
    if (!weeklySeen()) void buildWeeklyReport().then((r) => { if (r && r.answered > 0) setWeekly(r) }).catch(() => {})
  }, [day, pushToast])

  const rank = rankFromPower(profile?.powerPeak ?? 0)
  const lp = levelProgress(profile?.xp ?? 0)
  const daysLeft = daysUntil(profile?.examDate, new Date(now))
  const dateInfo = examDateInfo(profile?.examDate)
  const questsDone = quests?.progress.filter((p, i) => p >= quests.defs[i].target).length ?? 0
  const due = bookDue ?? 0
  const target = profile?.dailyNewTarget ?? 20
  const learned = daily?.newLearned ?? 0
  const loading = bookCounts === undefined || daily === undefined || prog === undefined || bookDue === undefined
  const complete = !loading && learned >= target && due === 0
  const line = MASCOT_LINES[Number(day.split('-').join('')) % MASCOT_LINES.length]
  const recentTotal = recentDays?.reduce((sum, d) => sum + (d.log ? d.log.newLearned + d.log.reviewsDone : 0), 0) ?? 0
  const recentMax = Math.max(1, ...(recentDays?.map((d) => (d.log?.newLearned ?? 0) + (d.log?.reviewsDone ?? 0)) ?? []))

  async function start() {
    if (startLock.current) return
    startLock.current = true
    setStarting(true)
    setStartError('')
    try {
      if ((bookCounts?.get(effectiveBook) ?? 0) === 0) { pushToast('还没有词书，先下载一本'); setTab('words'); return }
      const plan = await planSession([effectiveBook], target)
      if (plan.reviews.length === 0 && plan.news.length === 0) {
        pushToast(learned >= target ? '今日新词目标已完成，可以去练听力啦' : '这本词书暂时没有待学内容，可到「单词」页查看')
        return
      }
      const reviews = plan.reviews.slice(0, 24)
      const news = plan.news.slice(0, Math.max(0, 24 - reviews.length))
      const remaining = plan.reviews.length + plan.news.length - reviews.length - news.length
      if (remaining > 0) pushToast(`本轮 ${reviews.length + news.length} 题，还有 ${remaining} 题可再来一轮`)
      const pool = await wordsForBook(effectiveBook, 400)
      const reviewIds = new Set(reviews.map((w) => w.id))
      const knownIds = new Set((await db.stats.filter((s) => s.fsrs.reps > 0).toArray()).map((s) => s.wordId))
      openBattle({ reviews, news, pool, knownWords: pool.filter((w) => knownIds.has(w.id) && !reviewIds.has(w.id)) })
    } catch { setStartError('学习队列暂时无法准备，请重试。已保存的学习记录会保留。') }
    finally { startLock.current = false; setStarting(false) }
  }

  async function openChest() {
    if (chestLock.current) return
    chestLock.current = true
    setClaiming(true)
    try {
      const res = await claimChest()
      if (res) {
        setProfile(await ensureProfile())
        pushToast(`宝箱开启：+${res.coins} 金币${res.fragment ? '，另得主题碎片' : ''}`, 'levelup')
      }
    } catch { pushToast('宝箱暂时无法开启，请稍后重试') }
    finally { chestLock.current = false; setClaiming(false) }
  }

  return (
    <div className="space-y-4 p-3 pb-6 md:p-5 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-edge pb-3">
        <div className="flex items-center gap-3">
          <span className="text-px12 text-bright">LV.{lp.level} · {rank.rank.code} {rank.rank.name}</span>
          <div className="w-20"><PixelBar value={lp.into} max={lp.span} color="var(--wq-gold)" label="等级经验" /></div>
        </div>
        <span className="flex items-center gap-1 text-px12 text-gold tnum" aria-label={`${profile?.coins ?? 0} 金币`}><Icon name="coin" size={16} />{profile?.coins ?? 0}</span>
      </div>

      <p className="text-px12 text-dim">备考目标 {profile?.examType === 'cet6' ? 'CET-6' : 'CET-4'} · 主学词书 {bookName(effectiveBook)}</p>

      <div className="today-layout">
        <Panel className="flex flex-col !border-gold !p-4 md:!p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-px24 text-bright">今天的学习</h2>
            <button type="button" className="flex min-h-11 items-center gap-1 text-px12 text-dim hover:text-gold" onClick={() => setTab('words')}>
              <Icon name="book" size={16} />{bookName(effectiveBook)}<Icon name="arrow-right" size={16} />
            </button>
          </div>
          {usingFallback && <p className="readable mt-1 text-px12 text-dim">{bookName(studyBook)}尚未下载，当前使用已下载词书。</p>}
          <div className="my-4 flex items-center gap-3">
            <Mascot stage={rank.rank.mascotStage} size={64} mood={complete ? 'happy' : 'idle'} skin={profile?.mascot.skin} />
            <div className="min-w-0">
              <div className="mb-1 text-px12 text-gold">{profile?.mascot.name ?? '阿词'}</div>
              <p className="readable text-px12 text-dim">{complete ? '今日目标已完成，记得让眼睛休息一下。' : due > 0 ? `有 ${due} 个词想你了，先复习再学新词。` : line}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x-2 divide-edge border-y-2 border-edge py-3" aria-busy={loading}>
            <StudyStat label="待复习" value={loading ? '…' : due} tone={due > 0 ? 'text-gold' : 'text-bright'} />
            <StudyStat label="今日新词" value={loading ? '…' : learned} tone="text-pass" />
            <StudyStat label="累计掌握" value={loading ? '…' : prog?.masteredCount ?? 0} />
          </div>
          <div className="mb-4 mt-3 space-y-2">
            <div className="flex justify-between gap-2 text-px12 text-dim"><span>每日新词目标</span><span className="tnum">{learned}/{target}</span></div>
            <PixelBar value={learned} max={target} color="var(--wq-gold)" label="每日新词目标" />
          </div>
          <PixelButton variant="primary" className="mt-auto w-full !py-3" icon={complete ? 'target' : 'sword'} onClick={() => { if (complete) openCetPrep(); else void start() }} disabled={starting || loading} aria-busy={starting}>
            {starting ? '正在准备学习…' : loading ? '正在读取进度…' : complete ? '选择一项备考训练' : due > 0 ? '继续学习' : '开始今日学习'}
          </PixelButton>
          <p className="mt-2 text-center text-px12 text-dim">{complete ? '新词与到期复习均已完成' : '复习优先，每轮最多 24 题'}</p>
          {startError && <p className="readable mt-3 text-px12 text-fail" role="alert">{startError}</p>}
        </Panel>

        <Panel className="flex flex-col !p-4 md:!p-5">
          <SectionHead right={`${questsDone}/3`}>今日任务</SectionHead>
          <ul className="mb-4 space-y-4" aria-busy={!quests}>
            {quests ? quests.defs.map((d, i) => {
              const p = quests.progress[i]
              const done = p >= d.target
              return <li key={d.id}>
                <div className="mb-2 flex items-start justify-between gap-2 text-px12">
                  <span className={`flex items-center gap-2 ${done ? 'text-pass' : 'text-bright'}`}><Icon name={done ? 'check' : 'target'} size={16} />{d.name}</span>
                  <span className="shrink-0 text-dim tnum">{done && d.target === 0 ? '已完成' : `${Math.round(p)}/${d.target}`}</span>
                </div>
                <PixelBar value={done && d.target === 0 ? 1 : p} max={Math.max(1, d.target)} color={done ? 'var(--wq-pass)' : 'var(--wq-gold)'} label={d.name} />
              </li>
            }) : [0, 1, 2].map((i) => <li key={i} className="h-12 bg-panel-2" aria-hidden />)}
          </ul>
          <PixelButton className="mt-auto w-full" icon="gift" onClick={() => void openChest()} disabled={questsDone < 3 || Boolean(quests?.row.chestOpened) || claiming} aria-busy={claiming}>
            {claiming ? '正在开启…' : quests?.row.chestOpened ? '今日宝箱已开启' : questsDone === 3 ? '开启每日宝箱' : '全部完成可开宝箱'}
          </PixelButton>
          <p className="mt-2 text-center text-px12 text-dim">累计开启 5 次可获得主题碎片</p>
        </Panel>
      </div>

      <div id="cet-prep"><Suspense fallback={<Panel className="!p-4"><p className="text-px12 text-dim" role="status">正在打开备考台…</p></Panel>}><CetPrepHub /></Suspense></div>

      <Suspense fallback={<Panel className="!p-4"><p className="text-px12 text-dim" role="status">正在展开冒险地图…</p></Panel>}>
        <AdventureHub />
        <AchievementTracker />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="!p-4">
          <SectionHead>学习概览</SectionHead>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <div>
              <div className="mb-1 flex items-center gap-1 text-px12 text-dim"><Icon name="clock" size={16} />计划考试倒计时</div>
              <div className="text-px24 text-gold tnum">{daysLeft == null ? '未设置' : daysLeft < 0 ? '已结束' : daysLeft === 0 ? '就是今天' : `${daysLeft} 天`}</div>
              <div className="mt-1 text-px12 text-dim">{profile?.examDate ?? '可在设置中选择日期'}</div>
              {profile?.examDate && <div className="readable mt-1 text-px12 text-dim">{dateInfo.label}</div>}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-px12 text-dim"><Icon name="flame" size={16} />连续打卡</div>
              <div className="text-px24 text-pass tnum">{profile?.streak ?? 0} 天</div>
              <div className="mt-1 text-px12 text-dim">{profile?.freezes ? `冻结券 ${profile.freezes} 张` : '连续 7 天得冻结券'}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-edge pt-3 text-px12 text-dim">
            <span>今日复习 <b className="text-bright tnum">{daily?.reviewsDone ?? 0}</b></span>
            <span>词汇练习正确率 <b className="text-bright tnum">{prog?.accuracy == null ? '暂无' : `${Math.round(prog.accuracy * 100)}%`}</b></span>
          </div>
        </Panel>
        <Panel className="!p-4">
          <SectionHead right={`共 ${recentTotal} 词次`}>最近 7 天</SectionHead>
          <div className="today-history min-h-28">
            {recentDays?.map(({ date, log }) => {
              const v = (log?.newLearned ?? 0) + (log?.reviewsDone ?? 0)
              return <div key={date} className="flex min-w-0 flex-col items-center gap-1" role="img" aria-label={`${date}，学习 ${v} 词次`}>
                <span className="text-px12 text-dim tnum" aria-hidden>{v}</span>
                <div className="w-full border-2 border-edge" style={{ height: Math.max(4, (v / recentMax) * 44), background: v > 0 ? 'var(--wq-pass)' : 'var(--wq-panel-2)' }} />
                <span className={`text-px12 ${date === day ? 'text-gold' : 'text-dim'}`} aria-hidden>{date === day ? '今' : date.slice(8)}</span>
              </div>
            })}
          </div>
          {recentTotal === 0 && <p className="readable mt-3 text-px12 text-dim">开始学习后，这里会记录每天的积累。</p>}
        </Panel>
      </div>
      {weekly && <Panel>
        <SectionHead right={<PixelButton size="sm" variant="ghost" ariaLabel="关闭周报" onClick={() => { markWeeklySeen(); setWeekly(null) }}><Icon name="cross" size={16} /></PixelButton>}>本周战报</SectionHead>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StudyStat label="新词" value={weekly.newWords} /><StudyStat label="复习" value={weekly.reviews} />
          <StudyStat label="精听分钟" value={weekly.listeningMinutes} /><StudyStat label="正确率" value={`${Math.round(weekly.avgAccuracy * 100)}%`} />
        </div>
        <p className="readable mt-3 text-px12 text-bright">{weekly.comment}</p>
        <p className="mt-1 text-px12 text-dim">有效学习 {weekly.activeDays}/7 天</p>
      </Panel>}
    </div>
  )
}

function StudyStat({ label, value, tone = 'text-bright' }: { label: string; value: number | string; tone?: string }) {
  return <div className="min-w-0 text-center"><div className={`text-px24 tnum ${tone}`}>{value}</div><div className="mt-1 text-px12 text-dim">{label}</div></div>
}
