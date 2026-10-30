import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { exportBackup, todayKey } from '../db/database'
import { BOOKS, ensureSeedBook, importedBookCounts } from '../core/wordbook'
import { ensureProfile, patchProfile } from '../core/profile'
import { importBackup } from '../core/backup'
import { buildStudyReminderIcs, downloadIcs } from '../core/ics'
import { examDateInfo, formatExamDate, upcomingExamSessions } from '../core/exam'
import { Panel, PixelButton, SectionHead } from '../ui/Pixel'
import { Icon } from '../ui/icons'
import { useUi } from '../state/ui'
import { isMuted, setMuted } from '../core/audio'
import { ownedThemeList, ownsTheme } from '../core/shop'
import { formatBytes, storageInfo, type StorageInfo } from '../core/storage'
import { HUE_PRESETS, applyCustomHue, clearCustomHue, customTokens } from '../core/customTheme'
import type { BookId } from '../types/model'

import { THEMES, STYLES, applyTheme, applyStyle } from '../ui/theme'
export { THEMES, STYLES, applyTheme, applyStyle } from '../ui/theme'

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const profile = useUi((s) => s.profile)
  const setProfile = useUi((s) => s.setProfile)
  const pushToast = useUi((s) => s.pushToast)
  const [muted, setMutedState] = useState(isMuted())
  const [scanlines, setScanlines] = useState(localStorage.getItem('wq:scanlines') !== 'off')
  const [customDate, setCustomDate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState<BookId | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null)
  const [dataBusy, setDataBusy] = useState<'export' | 'import' | null>(null)
  const [dataFeedback, setDataFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dataLock = useRef(false)
  const studyChangeLock = useRef(false)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  const sessions = useMemo(() => upcomingExamSessions(4), [])
  const downloaded = useLiveQuery(importedBookCounts, [])

  useEffect(() => {
    void ensureProfile().then(setProfile)
  }, [setProfile])

  useEffect(() => {
    void storageInfo().then(setStorage)
  }, [])

  async function save(patch: Parameters<typeof patchProfile>[0]) {
    try {
      const next = await patchProfile(patch)
      setProfile(next)
      return next
    } catch {
      pushToast('设置未能保存，请重试')
      return null
    }
  }

  async function switchBook(bookId: BookId) {
    if (studyChangeLock.current) return
    studyChangeLock.current = true
    setBusy(true)
    setDownloading(bookId)
    setDownloadProgress(null)
    try {
      // 已下载的词书可直接离线切换，缺失单元仍由后台维护补齐。
      if ((downloaded?.get(bookId) ?? 0) === 0) {
        await ensureSeedBook(bookId, (done, total) => setDownloadProgress({ done, total }))
      }
      if (await save({ studyBook: bookId })) pushToast(`已切换到${BOOKS.find((b) => b.id === bookId)?.name ?? bookId}`)
    } catch {
      pushToast('词书下载失败，请检查网络后重试')
    } finally {
      studyChangeLock.current = false
      setBusy(false)
      setDownloading(null)
      setDownloadProgress(null)
    }
  }

  async function switchExamType(examType: 'cet4' | 'cet6') {
    if (studyChangeLock.current) return
    studyChangeLock.current = true
    const bookId = examType === 'cet6' ? 'cet6-core' : 'cet4-core'
    const targetName = examType === 'cet6' ? 'CET-6' : 'CET-4'
    const name = BOOKS.find((book) => book.id === bookId)!.name
    setBusy(true)
    setDownloading(bookId)
    setDownloadProgress(null)
    try {
      if (!await save({ examType, studyBook: bookId })) return
      try {
        await ensureSeedBook(bookId, (done, total) => setDownloadProgress({ done, total }))
        pushToast(`备考目标已切换为 ${targetName}，${name}已就绪`)
      } catch {
        pushToast(`目标已切换为 ${targetName}，${name}尚未准备好，请到「单词」页重试下载`)
      }
    } finally {
      studyChangeLock.current = false
      setBusy(false)
      setDownloading(null)
      setDownloadProgress(null)
    }
  }

  async function doExport() {
    if (dataLock.current) return
    dataLock.current = true
    setDataBusy('export')
    setDataFeedback(null)
    try {
      const data = await exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wordquest-backup-${todayKey()}.json`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const skipped = data.mediaSkipped ?? 0
      setDataFeedback({ text: skipped > 0 ? `备份已生成，${skipped} 个音频或文档附件因体积上限未包含。请确认下载已保存。` : '备份已生成，包含学习记录、设置、库存、真题档案及导入文件。请确认下载已保存。', error: false })
    } catch {
      setDataFeedback({ text: '备份生成失败，请检查可用存储空间后重试。', error: true })
    } finally { dataLock.current = false; setDataBusy(null) }
  }

  async function doImport(file: File) {
    if (dataLock.current) return
    dataLock.current = true
    setDataBusy('import')
    setDataFeedback(null)
    try {
      const res = await importBackup(file)
      if (!res.ok) { setDataFeedback({ text: res.error ?? '导入失败，请检查备份文件后重试。', error: true }); return }
      const fresh = await ensureProfile()
      setProfile(fresh)
      applyTheme(fresh.theme, fresh.customHue)
      applyStyle(fresh.styleId ?? 'pixel')
      setDataFeedback({ text: `已合并 ${res.addedLogs} 条复习记录，恢复 ${res.addedWords} 个词条、${res.addedCetPapers} 份真题档案、${res.addedExams} 个听力练习包与 ${res.addedMedia} 个音频或文档附件。已有记录会保留。`, error: false })
      void storageInfo().then(setStorage)
    } catch {
      setDataFeedback({ text: '备份导入失败，请检查文件和可用存储空间后重试。', error: true })
    } finally { dataLock.current = false; setDataBusy(null) }
  }

  const ownedThemes = ownedThemeList(profile)
  const theme = profile?.theme ?? localStorage.getItem('wq:theme') ?? 'night'
  const studyBook = profile?.studyBook ?? (profile?.examType === 'cet6' ? 'cet6-core' : 'cet4-core')
  const dateInfo = examDateInfo(profile?.examDate)

  return (
    <div className="space-y-4 p-3 pb-6 md:p-5 md:pb-8">
      <div className="md:hidden">
        <PixelButton size="sm" variant="ghost" onClick={onBack} ariaLabel="返回">
          <Icon name="arrow-right" size={16} className="rotate-180" />
          返回
        </PixelButton>
      </div>

      {/* 学习 */}
      <Panel>
        <SectionHead>学习</SectionHead>
        <div className="space-y-3">
          <Field label={`主学词书（当前 ${BOOKS.find((b) => b.id === studyBook)?.name ?? '未设置'}）`}>
            <div className="space-y-1">
              {BOOKS.map((b) => {
                const count = downloaded?.get(b.id) ?? 0
                const active = studyBook === b.id
                return (
                  <button
                    key={b.id}
                    disabled={busy}
                    onClick={() => void switchBook(b.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-2 border-2 px-2 py-2 text-left text-px12 ${
                      active ? 'border-gold bg-panel-2 text-bright' : 'border-edge text-dim'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">{b.name}</span>
                      <span className="readable block text-dim">{b.desc}</span>
                    </span>
                    <span className="shrink-0 text-dim tnum">
                      {downloading === b.id ? (downloadProgress ? `下载 ${downloadProgress.done}/${downloadProgress.total}` : '正在准备…') : active ? '使用中' : count > 0 ? `本地 ${count} 词` : '未下载'}
                    </span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label={`每日新词量（当前 ${profile?.dailyNewTarget ?? 20}，可自定义 5-300）`}>
            <div className="grid grid-cols-4 gap-1">
              {[10, 20, 40, 60].map((n) => (
                <button
                  key={n}
                  onClick={() => void save({ dailyNewTarget: n })}
                  aria-pressed={(profile?.dailyNewTarget ?? 20) === n}
                  className={`pixel-btn pixel-btn-sm ${
                    (profile?.dailyNewTarget ?? 20) === n ? 'pixel-btn-primary' : ''
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={300}
                defaultValue={profile?.dailyNewTarget ?? 20}
                key={profile?.dailyNewTarget ?? 20}
                onBlur={(e) => {
                  if (e.target.value.trim() === '') {
                    e.target.value = String(profile?.dailyNewTarget ?? 20)
                    return
                  }
                  const v = Number(e.target.value)
                  if (!Number.isFinite(v)) return
                  const clamped = Math.min(300, Math.max(5, Math.round(v)))
                  e.target.value = String(clamped)
                  if (clamped !== (profile?.dailyNewTarget ?? 20)) void save({ dailyNewTarget: clamped })
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="pixel-input w-24 px-2 py-1 text-px12"
                aria-label="自定义每日新词量"
              />
              <span className="text-px12 text-dim">个/天（5-300，失焦生效）</span>
            </div>
          </Field>
        </div>
      </Panel>

      {/* 考试 */}
      <Panel>
        <SectionHead>备考目标</SectionHead>
        <div className="space-y-3">
          <Field label="目标级别（切换时同步主学核心词书）">
            <div className="grid grid-cols-2 gap-1">
              {(['cet4', 'cet6'] as const).map((t) => (
                <button
                  key={t}
                  disabled={busy}
                  onClick={() => void switchExamType(t)}
                  aria-pressed={profile?.examType === t}
                  className={`pixel-btn pixel-btn-sm ${profile?.examType === t ? 'pixel-btn-primary' : ''}`}
                >
                  {t === 'cet4' ? 'CET-4' : 'CET-6'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="计划考试日期">
            <p className="readable mb-2 text-px12 text-dim">已公布场次附官方来源，预计场次仅供规划。参加考试请按报名通知与准考证安排。</p>
            <div className="space-y-1">
              {sessions.map((s) => {
                const picked = profile?.examDate === s.date
                return (
                  <button
                    key={s.id}
                    onClick={() => void save({ examDate: s.date })}
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
                  type="date"
                  value={profile?.examDate ?? ''}
                  onChange={(e) => void save({ examDate: e.target.value || undefined })}
                  className="pixel-input w-full px-2 py-2"
                  aria-label="自定义计划考试日期"
                />
              )}
            </div>
            {profile?.examDate && (
              <div className="mt-2 space-y-1 text-px12">
                <p className="text-gold">计划日期：{formatExamDate(profile.examDate)}</p>
                <p className="text-dim">{dateInfo.label}</p>
                {dateInfo.source && <a className="text-gold underline" href={dateInfo.source} target="_blank" rel="noreferrer">官方通知 · 核对于 {dateInfo.checkedAt}</a>}
              </div>
            )}
          </Field>
        </div>
      </Panel>

      {/* 外观 */}
      <Panel>
        <SectionHead right={`已拥有 ${ownedThemes.length}/${THEMES.length}`}>外观</SectionHead>
        <div className="mb-3">
          <div className="mb-1 text-px12 text-dim">视觉风格（形状与字体）</div>
          <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
            {STYLES.map((st) => {
              const active = (profile?.styleId ?? 'pixel') === st.id
              return (
                <button
                  key={st.id}
                  onClick={() => {
                    applyStyle(st.id)
                    void save({ styleId: st.id })
                  }}
                  aria-pressed={active}
                  className={`border-2 px-2 py-2 text-left text-px12 ${
                    active ? 'border-gold bg-panel-2' : 'border-edge'
                  }`}
                >
                  <div className={active ? 'text-gold' : 'text-bright'}>{st.name}</div>
                  <div className="text-px12 text-dim">{st.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="mb-1 text-px12 text-dim">配色主题</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {THEMES.map((t) => {
            const owned = ownsTheme(profile, t.id)
            const active = profile?.theme === t.id
            return (
              <button
                key={t.id}
                disabled={!owned}
                onClick={() => {
                  applyTheme(t.id)
                  if (t.id === 'custom') {
                    const hue = profile?.customHue ?? 210
                    applyCustomHue(hue)
                    localStorage.setItem('wq:custom-hue', String(hue))
                  } else {
                    clearCustomHue()
                  }
                  void save({ theme: t.id })
                }}
                aria-pressed={active}
                className={`flex items-center gap-2 border-2 px-2 py-2 text-left text-px12 ${
                  active ? 'border-gold' : 'border-edge'
                } ${owned ? '' : 'opacity-45'}`}
              >
                <span
                  className="h-6 w-6 shrink-0 border-2 border-black"
                  style={{ background: t.bg, boxShadow: `inset 0 0 0 3px ${t.accent}` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-bright">{t.name}</span>
                  <span className="block text-dim">{owned ? (active ? '使用中' : '点击切换') : '商店解锁'}</span>
                </span>
              </button>
            )
          })}
        </div>
        {theme === 'custom' && (
          <div className="mt-3 border-t-2 border-edge pt-3">
            <div className="mb-1 text-px12 text-bright">色相（拖动调整）</div>
            <input
              type="range"
              min={0}
              max={359}
              value={profile?.customHue ?? 210}
              onChange={(e) => {
                const hue = Number(e.target.value)
                applyCustomHue(hue)
                localStorage.setItem('wq:custom-hue', String(hue))
                void save({ customHue: hue, theme: 'custom' })
              }}
              className="h-8 w-full accent-[var(--wq-gold)]"
              aria-label="自定义色相"
            />
            <div className="mb-2 flex flex-wrap gap-1">
              {HUE_PRESETS.map((p) => (
                <button
                  key={p.hue}
                  onClick={() => {
                    applyCustomHue(p.hue)
                    localStorage.setItem('wq:custom-hue', String(p.hue))
                    void save({ customHue: p.hue, theme: 'custom' })
                  }}
                  className="flex items-center gap-1 border-2 border-edge px-2 py-1 text-px12 text-dim"
                >
                  <span
                    className="inline-block h-3 w-3 border border-black"
                    style={{ background: customTokens(p.hue).gold }}
                    aria-hidden
                  />
                  {p.name}
                </button>
              ))}
            </div>
            <p className="readable text-px12 text-dim">
              绿色（正确）与红色（错误）是语义色，不跟随色相变化。
            </p>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <ToggleRow
            label="音效与发音"
            on={!muted}
            onLabel="开启"
            offLabel="已静音"
            onToggle={() => {
              const next = !muted
              setMuted(next)
              setMutedState(next)
            }}
          />
          <ToggleRow
            label="CRT 扫描线"
            on={scanlines}
            onLabel="开启"
            offLabel="关闭"
            onToggle={() => {
              const next = !scanlines
              setScanlines(next)
              localStorage.setItem('wq:scanlines', next ? 'on' : 'off')
              document.documentElement.dataset.scanlines = next ? 'on' : 'off'
            }}
          />
        </div>
      </Panel>

      {/* 数据 */}
      <Panel>
        <SectionHead>数据</SectionHead>
        <div className="space-y-2">
          <PixelButton className="w-full" onClick={() => void doExport()} disabled={dataBusy !== null} aria-busy={dataBusy === 'export'}>
            {dataBusy === 'export' ? '正在生成备份…' : '导出数据备份（JSON）'}
          </PixelButton>
          <PixelButton className="w-full" onClick={() => fileInput.current?.click()} disabled={dataBusy !== null} aria-busy={dataBusy === 'import'}>
            {dataBusy === 'import' ? '正在合并备份…' : '导入备份并合并'}
          </PixelButton>
          <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="选择 WordQuest 备份文件"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ''
                if (file) void doImport(file)
              }}
          />
          {dataFeedback && <p className={`readable border-2 border-edge bg-panel-2 p-3 text-px12 ${dataFeedback.error ? 'text-fail' : 'text-pass'}`} role={dataFeedback.error ? 'alert' : 'status'}>{dataFeedback.text}</p>}
          <PixelButton
            className="w-full"
            onClick={() => {
              const ics = buildStudyReminderIcs({ examDate: profile?.examDate, examType: profile?.examType })
              downloadIcs('wordquest-reminder.ics', ics)
              pushToast('已生成日历文件，导入系统日历即可每天提醒')
            }}
          >
            订阅日历提醒（.ics）
          </PixelButton>
          <p className="readable text-px12 text-dim">
            学习记录只保存在本机浏览器。换设备或清理浏览器前，请先导出备份（含真题档案与导入文件；音频、文档合计超过 100MB 时跳过超额附件）。
          </p>
          {storage?.supported && (
            <p className="readable text-px12 text-dim">
              本地存储：已用 {formatBytes(storage.usage)}，配额 {formatBytes(storage.quota)}
              {storage.persisted
                ? ' · 已获持久存储许可，系统不会自动清退数据'
                : ' · 未获持久存储许可（重启浏览器或磁盘紧张时系统可能清理数据，建议定期导出备份）'}
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHead>关于</SectionHead>
        <div className="space-y-1 text-px12 text-dim">
          <p>单词勇者 WordQuest · 四六级学习应用</p>
          <p>词库 ECDICT（MIT）· 复习算法 ts-fsrs（MIT）· 字体 Fusion Pixel（OFL 1.1）</p>
          <p>完全离线可用，无内购，无广告。</p>
        </div>
      </Panel>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-px12 text-dim">{label}</legend>
      {children}
    </fieldset>
  )
}

function ToggleRow({
  label,
  on,
  onLabel,
  offLabel,
  onToggle,
}: {
  label: string
  on: boolean
  onLabel: string
  offLabel: string
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-px12 text-dim">{label}</span>
      <PixelButton size="sm" variant={on ? 'primary' : 'ghost'} aria-pressed={on} onClick={onToggle}>
        {on ? onLabel : offLabel}
      </PixelButton>
    </div>
  )
}
