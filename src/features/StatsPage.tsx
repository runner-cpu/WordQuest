import { useLiveQuery } from 'dexie-react-hooks'
import { db, dateKeyOffset } from '../db/database'
import { EmptyState, Panel, PixelBar, PixelButton, SectionHead } from '../ui/Pixel'
import { levelProgress, rankFromPower } from '../core/game'
import { useUi } from '../state/ui'
import { reviewForecast } from '../core/learningReport'
import { useStudyClock } from '../state/useStudyClock'
import { CetProgressReport } from './CetProgressReport'

/**
 * 统计页。
 *
 * 图表只用 CSS 与 SVG 画，不引第三方图表库：数据量小、样式要跟着主题走，
 * 自己画反而更轻更一致。每个图表都回答一个具体问题，不放纯装饰性的可视化。
 */
export function StatsPage() {
  const profile = useUi((s) => s.profile)
  const setTab = useUi((s) => s.setTab)
  const clock = useStudyClock()
  const day = dateKeyOffset(0, new Date(clock))

  const daily = useLiveQuery(async () => {
    const keys = Array.from({ length: 182 }, (_, i) => dateKeyOffset(-i))
    const rows = await db.dailyLogs.bulkGet(keys)
    return keys.map((k, i) => ({ date: k, log: rows[i] ?? null })).reverse()
  }, [day])

  const totals = useLiveQuery(async () => {
    const [stats, logs, rlogs] = await Promise.all([
      db.stats.toArray(),
      db.dailyLogs.toArray(),
      db.reviewLogs.toArray(),
    ])
    const now = clock
    const learned = stats.filter((s) => s.fsrs.reps > 0)
    const mastered = stats.filter((s) => s.state === 'mastered')
    const due = learned.filter((s) => s.fsrs.due <= now)

    const forecast = reviewForecast(learned.map(s => s.fsrs.due), now)

    const dist = {
      new: stats.filter((s) => s.state === 'new').length,
      learning: stats.filter((s) => s.state === 'learning').length,
      review: stats.filter((s) => s.state === 'review').length,
      mastered: mastered.length,
    }

    // 词频难度分布：看用户是否总在背低频难词
    const words = await db.words.bulkGet(learned.map(s => s.wordId))
    const byId = new Map(words.filter(w => w !== undefined).map(w => [w.id, w]))
    const weightDist = { easy: 0, mid: 0, hard: 0 }
    for (const s of learned) {
      const w = byId.get(s.wordId)
      if (!w) continue
      if (w.difficultyWeight <= 1.0) weightDist.easy++
      else if (w.difficultyWeight <= 1.3) weightDist.mid++
      else weightDist.hard++
    }

    const answered = logs.reduce((a, l) => a + l.totalAnswered, 0)
    const correct = logs.reduce((a, l) => a + l.correctCount, 0)
    const effectiveDays = logs.filter((l) => l.effectiveDay).length
    const listeningMinutes = Math.round(logs.reduce((a, l) => a + l.listeningSeconds, 0) / 60)

    const DECAY = -0.5
    const FACTOR = 19 / 81
    const retention =
      learned.length > 0
        ? learned.reduce((acc, s) => {
            const st = Math.max(0.1, s.fsrs.stability)
            return acc + Math.min(1, Math.max(0, Math.pow(1 + (FACTOR * 30) / st, DECAY)))
          }, 0) / learned.length
        : 0

    // 时段效率：按复习日志的小时分组统计正确率与题量
    const hourBuckets = Array.from({ length: 24 }, () => ({ n: 0, ok: 0 }))
    for (const l of rlogs) {
      const h = new Date(l.reviewedAt).getHours()
      hourBuckets[h].n++
      if (l.correct) hourBuckets[h].ok++
    }
    const hourly = hourBuckets
      .map((b, h) => ({
        hour: h,
        n: b.n,
        acc: b.n >= 10 ? b.ok / b.n : null,
      }))
      .filter((b) => b.n > 0)

    const accuracyTrend = logs
      .filter((l) => l.totalAnswered >= 5)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-14)
      .map((l) => ({ date: l.date, acc: l.correctCount / l.totalAnswered }))

    const activeDates = new Set(logs.filter((l) => l.effectiveDay).map((l) => l.date))
    let streakDays = 0
    for (let i = 0; i < 400; i++) {
      if (activeDates.has(dateKeyOffset(-i))) streakDays++
      else if (i > 0) break
    }

    return {
      mastered: mastered.length,
      learned: learned.length,
      due: due.length,
      forecast,
      dist,
      weightDist,
      accuracy: answered > 0 ? correct / answered : 0,
      totalAnswers: answered,
      effectiveDays,
      listeningMinutes,
      retention,
      accuracyTrend,
      streakDays,
      hourly,
    }
  }, [clock])

  const lp = levelProgress(profile?.xp ?? 0)
  const rank = rankFromPower(profile?.powerPeak ?? 0)
  const hasData = (totals?.learned ?? 0) > 0

  const vocabCurve = (() => {
    if (!daily) return []
    let acc = Math.max(0, (totals?.learned ?? 0) - daily.reduce((sum, entry) => sum + (entry.log?.newLearned ?? 0), 0))
    return daily.map(({ date, log }) => {
      acc += log?.newLearned ?? 0
      return { date, total: acc }
    })
  })()

  const last30 = daily?.slice(-30) ?? []
  const max30 = Math.max(1, ...last30.map((d) => (d.log?.newLearned ?? 0) + (d.log?.reviewsDone ?? 0)))

  async function exportPoster() {
    const canvas = document.createElement('canvas')
    const W = 720
    const H = 960
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#ffe845'
    ctx.lineWidth = 4
    ctx.strokeRect(16, 16, W - 32, H - 32)
    ctx.fillStyle = '#ffe845'
    ctx.font = 'bold 44px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('WORD QUEST', W / 2, 100)
    ctx.font = '20px monospace'
    ctx.fillStyle = '#9494bf'
    ctx.fillText('LEARNING REPORT', W / 2, 136)

    const rows: [string, string][] = [
      ['词汇积累阶段', `${rank.rank.code} ${rank.rank.name}`],
      ['等级', `LV.${lp.level}`],
      ['词卡积累峰值', String(profile?.powerPeak ?? 0)],
      ['掌握词数', String(totals?.mastered ?? 0)],
      ['累计学习', String(totals?.learned ?? 0)],
      ['词汇练习正确率', `${Math.round((totals?.accuracy ?? 0) * 100)}%`],
      ['连续天数', String(profile?.streak ?? 0)],
      ['有效学习日', String(totals?.effectiveDays ?? 0)],
    ]
    ctx.textAlign = 'left'
    rows.forEach(([k, v], i) => {
      const y = 220 + i * 70
      ctx.fillStyle = '#9494bf'
      ctx.font = '18px monospace'
      ctx.fillText(k, 70, y)
      ctx.fillStyle = i === 0 ? '#ffe845' : '#e8e8f5'
      ctx.font = 'bold 30px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(v, W - 70, y)
      ctx.textAlign = 'left'
      ctx.strokeStyle = '#525285'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(70, y + 18)
      ctx.lineTo(W - 70, y + 18)
      ctx.stroke()
    })
    ctx.textAlign = 'center'
    ctx.fillStyle = '#3cdb6f'
    ctx.font = '20px monospace'
    ctx.fillText('学习过程记录 · 考试各项能力需另行评估', W / 2, H - 80)
    ctx.fillStyle = '#9494bf'
    ctx.font = '14px monospace'
    ctx.fillText(new Date().toLocaleDateString('zh-CN'), W / 2, H - 50)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wordquest-learning-report-${new Date().toISOString().slice(0, 10)}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!totals || !daily) return <div className="p-4 readable text-dim" role="status">正在读取学习报告…</div>

  if (!hasData) {
    return (
      <div className="space-y-3 p-3 pb-24 md:p-5 md:pb-8">
        <CetProgressReport />
        <Panel>
          <EmptyState
            icon="chart"
            title="词卡报告等待第一次练习"
            hint="真题记录在上方。完成词卡练习后，这里会显示词汇积累与到期复习量。"
          />
          {totals.listeningMinutes > 0 && <p className="readable text-dim">原创听力累计练习 {totals.listeningMinutes} 分钟。</p>}
          <PixelButton onClick={() => setTab('today')}>回到今日开始学习</PixelButton>
        </Panel>
      </div>
    )
  }

  const maxVocab = Math.max(1, ...vocabCurve.map((v) => v.total))

  const accY = (acc: number) => 40 - Math.min(1, Math.max(0, acc)) * 38

  return (
    <div className="space-y-3 p-3 pb-24 md:p-5 md:pb-8">
      <CetProgressReport />
      <Panel>
        <SectionHead>词卡学习报告</SectionHead>
        <p className="readable text-px12 text-dim">这里汇总所有词书的词卡练习与学习时长。词卡积累阶段、练习正确率和记忆估算用于安排复习；四六级听力、阅读、写作与翻译需分别训练和评估。</p>
      </Panel>
      <Panel className="!p-0">
        <div className="grid grid-cols-2 divide-x-2 divide-y-2 divide-edge md:grid-cols-4">
          <Metric label="累计掌握" value={totals?.mastered ?? 0} tone="gold" />
          <Metric label="待复习" value={totals?.due ?? 0} tone={(totals?.due ?? 0) > 0 ? 'fail' : 'bright'} />
          <Metric label="词汇练习正确率" value={`${Math.round((totals?.accuracy ?? 0) * 100)}%`} tone="pass" />
          <Metric label="连续有效天数" value={totals?.streakDays ?? 0} tone="bright" />
        </div>
      </Panel>

      <Panel>
        <SectionHead right={`共 ${totals?.learned ?? 0} 词`}>近半年词卡积累</SectionHead>
        <div className="h-32 w-full">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="已学词卡累计曲线">
            {[0, 10, 20, 30, 40].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--wq-edge)" strokeWidth="0.2" />
            ))}
            <path
              d={`M0,40 ${vocabCurve
                .map((p, i) => {
                  const x = (i / Math.max(1, vocabCurve.length - 1)) * 100
                  const y = 40 - (p.total / maxVocab) * 38
                  return `L${x.toFixed(2)},${y.toFixed(2)}`
                })
                .join(' ')} L100,40 Z`}
              fill="var(--wq-pass)"
              opacity="0.18"
            />
            <path
              d={vocabCurve
                .map((p, i) => {
                  const x = (i / Math.max(1, vocabCurve.length - 1)) * 100
                  const y = 40 - (p.total / maxVocab) * 38
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
                })
                .join(' ')}
              fill="none"
              stroke="var(--wq-pass)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="mt-1 flex justify-between text-px12 text-dim">
          <span>{vocabCurve[0]?.date.slice(5)}</span>
          <span>峰值 {maxVocab} 词</span>
          <span>{vocabCurve[vocabCurve.length - 1]?.date.slice(5)}</span>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel>
          <SectionHead>掌握状态分布</SectionHead>
          <StackBar
            segments={[
              { label: '已掌握', value: totals?.dist.mastered ?? 0, color: 'var(--wq-gold)' },
              { label: '复习中', value: totals?.dist.review ?? 0, color: 'var(--wq-pass)' },
              { label: '学习中', value: totals?.dist.learning ?? 0, color: 'var(--wq-accent)' },
            ]}
          />
        </Panel>

        <Panel>
          <SectionHead>在背的词频档位</SectionHead>
          <StackBar
            segments={[
              { label: '高频 (BNC 2k)', value: totals?.weightDist.easy ?? 0, color: 'var(--wq-pass)' },
              { label: '中频 (2k-5k)', value: totals?.weightDist.mid ?? 0, color: 'var(--wq-gold)' },
              { label: '低频 (>5k)', value: totals?.weightDist.hard ?? 0, color: 'var(--wq-fail)' },
            ]}
          />
        </Panel>
      </div>

      <Panel>
        <SectionHead right="只统计当日 5 题以上的日子">正确率趋势</SectionHead>
        {totals && totals.accuracyTrend.length >= 2 ? (
          <>
            <div className="h-28 w-full">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="正确率趋势">
                {[0, 20, 40].map((y) => (
                  <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--wq-edge)" strokeWidth="0.2" />
                ))}
                <line
                  x1="0"
                  y1={accY(0.8)}
                  x2="100"
                  y2={accY(0.8)}
                  stroke="var(--wq-gold)"
                  strokeWidth="0.3"
                  strokeDasharray="2 2"
                />
                <path
                  d={totals.accuracyTrend
                    .map((p, i) => {
                      const x = (i / Math.max(1, totals.accuracyTrend.length - 1)) * 100
                      const y = accY(p.acc)
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
                    })
                    .join(' ')}
                  fill="none"
                  stroke="var(--wq-gold)"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                />
                {totals.accuracyTrend.map((p, i) => {
                  const x = (i / Math.max(1, totals.accuracyTrend.length - 1)) * 100
                  const y = accY(p.acc)
                  return <circle key={p.date} cx={x} cy={y} r="0.8" fill="var(--wq-gold)" />
                })}
              </svg>
            </div>
            <div className="mt-1 flex justify-between text-px12 text-dim">
              <span>{totals.accuracyTrend[0].date.slice(5)}</span>
              <span>纵轴 0–100% · 虚线 80%</span>
              <span>{totals.accuracyTrend[totals.accuracyTrend.length - 1].date.slice(5)}</span>
            </div>
            <details className="readable mt-3 text-dim">
              <summary className="min-h-11 cursor-pointer">查看逐日正确率数据</summary>
              <ul>{totals.accuracyTrend.map(point => <li key={point.date}>{point.date}：{Math.round(point.acc * 100)}%</li>)}</ul>
            </details>
          </>
        ) : (
          <p className="readable text-px12 text-dim">至少完成两天（每天 5 题以上）才能看到趋势。</p>
        )}
      </Panel>

      <Panel>
        <SectionHead right="颜色越深，当日词卡练习越多">打卡热力图</SectionHead>
        <div className="no-scrollbar overflow-x-auto pb-1">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
            {daily?.map(({ date, log }) => {
              const v = log ? log.newLearned + log.reviewsDone : 0
              const level = v === 0 ? 0 : v < 5 ? 1 : v < 15 ? 2 : v < 30 ? 3 : 4
              // 用主题 pass 色做透明度梯度，任何主题（含浅色）下都协调
              const colors = [
                'var(--wq-panel-2)',
                'color-mix(in srgb, var(--wq-pass) 30%, var(--wq-panel))',
                'color-mix(in srgb, var(--wq-pass) 55%, var(--wq-panel))',
                'color-mix(in srgb, var(--wq-pass) 80%, var(--wq-panel))',
                'var(--wq-pass)',
              ]
              return (
                <div
                  key={date}
                  title={`${date}：${v} 词`}
                  className="h-3 w-3 border border-black"
                  style={{ background: colors[level] }}
                />
              )
            })}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHead right="今天包含逾期词卡">未来 7 天复习量</SectionHead>
        <div className="flex items-end justify-between gap-1">
          {totals?.forecast.map((n, i) => {
            const max = Math.max(1, ...(totals.forecast ?? [1]))
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-px12 text-dim tnum">{n}</span>
                <div
                  className="w-full border-2 border-black"
                  style={{ height: Math.max(4, (n / max) * 56), background: 'var(--wq-gold)' }}
                />
                <span className="text-px12 text-dim">{i === 0 ? '今天' : `+${i}`}</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel>
        <SectionHead>记忆体检</SectionHead>
        <div className="space-y-3">
          <MetricRow
            label="词卡 30 天回忆概率估算"
            value={`${Math.round((totals?.retention ?? 0) * 100)}%`}
            pct={totals?.retention ?? 0}
            tone={(totals?.retention ?? 0) >= 0.8 ? 'pass' : 'fail'}
          />
          <MetricRow label={`等级 LV.${lp.level}`} value={`${lp.into}/${lp.span} XP`} pct={lp.pct / 100} tone="gold" />
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Mini label="有效学习日" value={totals?.effectiveDays ?? 0} />
            <Mini label="累计答题" value={totals?.totalAnswers ?? 0} />
            <Mini label="精听分钟" value={totals?.listeningMinutes ?? 0} />
          </div>
          <p className="readable text-px12 text-dim">
            按词卡稳定性与 FSRS 遗忘曲线估算，用于复习参考。实际回忆情况请通过到期复习确认。
          </p>
        </div>
      </Panel>

      <Panel>
        <SectionHead right="柱高=词卡题量，颜色=正确率">词卡练习时段</SectionHead>
        {totals && totals.hourly.length >= 3 ? (
          <>
            <div className="flex h-28 items-end gap-[3px]">
              {totals.hourly.map(({ hour, n, acc }) => {
                const maxN = Math.max(...totals.hourly.map((b) => b.n))
                // 时段颜色：正确率高=绿，低=红；样本不足 10 题的中性色
                const color =
                  acc == null
                    ? 'var(--wq-panel-2)'
                    : acc >= 0.85
                      ? 'var(--wq-pass)'
                      : acc >= 0.7
                        ? 'var(--wq-gold)'
                        : 'var(--wq-fail)'
                return (
                  <div
                    key={hour}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={`${hour}:00 至 ${hour + 1}:00 · ${n} 题${acc != null ? ` · 正确率 ${Math.round(acc * 100)}%` : ''}`}
                  >
                    <div
                      className="w-full border border-black"
                      style={{ height: Math.max(3, (n / maxN) * 76), background: color }}
                    />
                    <span className="text-px12 text-dim tnum">{hour}</span>
                  </div>
                )
              })}
            </div>
            <p className="readable mt-2 text-px12 text-dim">
              颜色反映已有词卡作答的正确率。题型、词汇难度和样本量会影响结果，可结合自己的时间安排参考。
            </p>
          </>
        ) : (
          <p className="readable text-px12 text-dim">
            在 3 个以上时段留下词卡作答记录后，这里会显示各时段题量；每个时段达到 10 题才显示正确率颜色。
          </p>
        )}
      </Panel>

      <Panel>
        <SectionHead right="绿=新词，金=复习">近 30 天学习量</SectionHead>
        <div className="flex items-end gap-[2px]">
          {last30.map(({ date, log }) => {
            const newW = log?.newLearned ?? 0
            const rev = log?.reviewsDone ?? 0
            return (
              <div key={date} className="flex flex-1 flex-col justify-end" title={`${date}：新词 ${newW}，复习 ${rev}`}>
                <div className="w-full" style={{ height: Math.max(1, (rev / max30) * 40), background: 'var(--wq-gold)' }} />
                <div className="w-full" style={{ height: Math.max(1, (newW / max30) * 40), background: 'var(--wq-pass)' }} />
              </div>
            )
          })}
        </div>
      </Panel>

      <PixelButton variant="primary" className="w-full !py-3" icon="chart" onClick={() => void exportPoster()}>
        导出学习报告
      </PixelButton>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'gold' | 'pass' | 'fail' | 'bright'
}) {
  const color =
    tone === 'gold' ? 'text-gold' : tone === 'pass' ? 'text-pass' : tone === 'fail' ? 'text-fail' : 'text-bright'
  return (
    <div className="px-3 py-3">
      <div className={`text-px24 tnum ${color}`}>{value}</div>
      <div className="text-px12 text-dim">{label}</div>
    </div>
  )
}

function MetricRow({
  label,
  value,
  pct,
  tone = 'pass',
}: {
  label: string
  value: string
  pct: number
  tone?: 'pass' | 'fail' | 'gold'
}) {
  const color = tone === 'fail' ? 'var(--wq-fail)' : tone === 'gold' ? 'var(--wq-gold)' : 'var(--wq-pass)'
  return (
    <div>
      <div className="mb-1 flex justify-between text-px12">
        <span className="text-dim">{label}</span>
        <span className="text-bright tnum">{value}</span>
      </div>
      <PixelBar value={pct * 100} max={100} color={color} label={label} />
    </div>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-edge bg-panel-2 py-1 text-center">
      <div className="text-px12 text-bright tnum">{value}</div>
      <div className="text-px12 text-dim">{label}</div>
    </div>
  )
}

/** 单条堆叠条：比饼图省空间，也更容易比较长度 */
function StackBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0))
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden border-2 border-edge">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label} ${s.value}`}
          />
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-px12">
            <span className="h-3 w-3 shrink-0 border border-black" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-dim">{s.label}</span>
            <span className="text-bright tnum">{s.value}</span>
            <span className="w-10 text-right text-dim tnum">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
