import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useUi } from './state/ui'
import { useBattle } from './state/battle'
import { TodayPage } from './features/TodayPage'
import { PixelButton } from './ui/Pixel'
import { Icon, type IconName } from './ui/icons'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { patchProfile } from './core/profile'
import { maintainBooksInBackground, prepareLocalApp, refreshLocalProgress } from './core/bootstrap'
import { ownedThemeList } from './core/shop'
import { requestPersistentStorage } from './core/storage'
import { levelProgress, rankFromPower } from './core/game'
import { THEMES, applyTheme, readAppearance, restoreAppearance } from './ui/theme'

type Tab = 'today' | 'words' | 'listening' | 'stats' | 'me'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: '今日', icon: 'sword' },
  { id: 'words', label: '单词', icon: 'book' },
  { id: 'listening', label: '听力', icon: 'headphones' },
  { id: 'stats', label: '统计', icon: 'chart' },
  { id: 'me', label: '我的', icon: 'medal' },
]

// 重试时创建新的 lazy 包装，失败的分片请求才会真正重新发起。
function lazyPages() {
  return {
    WordsPage: lazy(() => import('./features/WordsPage').then((m) => ({ default: m.WordsPage }))),
    ListeningPage: lazy(() => import('./features/ListeningPage').then((m) => ({ default: m.ListeningPage }))),
    StatsPage: lazy(() => import('./features/StatsPage').then((m) => ({ default: m.StatsPage }))),
    MePage: lazy(() => import('./features/MePage').then((m) => ({ default: m.MePage }))),
    SettingsPage: lazy(() => import('./features/SettingsPage').then((m) => ({ default: m.SettingsPage }))),
    Battle: lazy(() => import('./features/Battle').then((m) => ({ default: m.Battle }))),
  }
}

const safeArea = {
  paddingTop: 'env(safe-area-inset-top)',
  paddingLeft: 'env(safe-area-inset-left)',
  paddingRight: 'env(safe-area-inset-right)',
}

export default function App() {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  const profile = useUi((s) => s.profile)
  const setProfile = useUi((s) => s.setProfile)
  const pushToast = useUi((s) => s.pushToast)
  const battle = useBattle()
  const [view, setView] = useState<'main' | 'settings'>('main')
  // 主题以 profile 为准：设置页改了主题，顶栏按钮要立刻跟着变。
  // localStorage 只作为首次渲染前的兜底。
  const theme = profile?.theme ?? readAppearance('wq:theme') ?? 'night'
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<Error | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [pageAttempt, setPageAttempt] = useState(0)
  const [themeSaving, setThemeSaving] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const { WordsPage, ListeningPage, StatsPage, MePage, SettingsPage, Battle } = useMemo(lazyPages, [pageAttempt])
  const retryPage = () => setPageAttempt((attempt) => attempt + 1)

  // 浏览器历史/多标签可区分页面；必须放在所有 early return 之前（Hook 规则）
  const pageTitle = view === 'settings' ? '设置' : (TABS.find((t) => t.id === tab)?.label ?? '')
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · 单词勇者 WordQuest` : '单词勇者 WordQuest'
  }, [pageTitle])

  useEffect(() => {
    let active = true
    restoreAppearance()
    void prepareLocalApp().then((fresh) => {
      if (!active) return
      restoreAppearance(fresh)
      setProfile(fresh)
      setBootError(null)
      setBooting(false)
    }).catch((error: unknown) => {
      if (!active) return
      setBootError(error instanceof Error ? error : new Error('本地学习记录读取失败'))
      setBooting(false)
    })
    return () => { active = false }
  }, [bootAttempt, setProfile])

  useEffect(() => {
    if (booting || bootError) return
    let active = true
    const refresh = () => {
      void refreshLocalProgress().then(({ profile: fresh, achievements }) => {
        if (!active) return
        setProfile(fresh)
        for (const name of achievements) pushToast(`成就解锁：${name}`, 'levelup')
      }).catch(() => {
        if (active) pushToast('学习进度读取失败，请稍后重试')
      })
    }
    const maintain = () => {
      const current = useUi.getState().profile
      if (!current) return
      void maintainBooksInBackground(current).then((messages) => {
        if (active && messages.length > 0) pushToast(messages.join('；'))
      }).catch(() => {
        if (active) pushToast('完整词书暂未下载，可在「单词」页重试')
      })
    }
    // 给已准备好的首页一次绘制机会，再扫描成就和请求网络。
    const timer = window.setTimeout(() => { refresh(); maintain() }, 100)
    window.addEventListener('online', maintain)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('online', maintain)
    }
  }, [booting, bootError, setProfile, pushToast])

  // 切回标签页：跨天/到期可能已变化，刷新 profile 与今日任务
  useEffect(() => {
    if (booting || bootError) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshLocalProgress().then(({ profile: fresh, achievements }) => {
        setProfile(fresh)
        for (const name of achievements) pushToast(`成就解锁：${name}`, 'levelup')
      }).catch(() => pushToast('学习进度读取失败，请稍后重试'))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [booting, bootError, setProfile, pushToast])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [tab, view, battle.isOpen, profile?.onboarded])

  // 申请持久存储：默认「尽力而为」模式下，浏览器磁盘紧张时可整库清退学习记录
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  /** 在已拥有的主题之间循环，顶栏一键换肤 */
  const ownedThemes = useMemo(() => {
    const owned = ownedThemeList(profile)
    return THEMES.filter((t) => owned.includes(t.id))
  }, [profile])

  const cycleTheme = () => {
    if (ownedThemes.length <= 1) {
      // 只有一个主题时循环没有意义，直接把用户带到能解锁的地方
      pushToast('更多主题可在商店用金币解锁')
      setView('settings')
      return
    }
    const idx = ownedThemes.findIndex((t) => t.id === theme)
    const next = ownedThemes[(idx + 1) % ownedThemes.length]
    if (themeSaving) return
    setThemeSaving(true)
    applyTheme(next.id, profile?.customHue)
    void patchProfile({ theme: next.id }).then(setProfile).catch(() => {
      applyTheme(theme, profile?.customHue)
      pushToast('主题未保存，请重试')
    }).finally(() => setThemeSaving(false))
  }

  const exitBattle = () => {
    battle.close()
    void refreshLocalProgress().then(({ profile: fresh, achievements }) => {
      setProfile(fresh)
      for (const name of achievements) pushToast(`成就解锁：${name}`, 'levelup')
    }).catch(() => pushToast('学习进度读取失败，请稍后重试'))
  }

  if (bootError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center" style={safeArea}>
        <Icon name="warning" size={32} className="text-fail" />
        <div className="text-px24 text-gold">学习记录暂时打不开</div>
        <p className="readable max-w-sm text-px12 text-dim">请检查浏览器是否允许本站保存数据，再重试读取。已有学习记录会保留。</p>
        <PixelButton variant="primary" onClick={() => {
          setBootError(null)
          setBooting(true)
          setBootAttempt((attempt) => attempt + 1)
        }}>重试读取</PixelButton>
        <details className="readable max-w-sm text-left text-px12 text-dim">
          <summary className="cursor-pointer">查看错误详情</summary>
          <p className="mt-2 break-words">{bootError.message}</p>
        </details>
        <ToastOverlay />
      </div>
    )
  }

  if (booting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6" style={safeArea} role="status" aria-live="polite">
        <div className="text-px24 text-gold">单词勇者</div>
        <div className="text-px12 text-dim">正在读取本地学习记录</div>
        <div className="h-3 w-48 border-2 border-edge" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse bg-gold" />
        </div>
        <ToastOverlay />
      </div>
    )
  }

  // 首次先选择备考目标与计划日期，再进入今日学习。
  if (profile && !profile.onboarded) {
    return (
      <>
        <div className="crt mx-auto h-full w-full max-w-lg overflow-y-auto" style={{ ...safeArea, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ErrorBoundary resetKey="onboarding" onReset={retryPage}>
            <Suspense fallback={<PageSkeleton page="me" />}>
              <MePage onOpenSettings={() => {}} __forceOnboarding __onOnboarded={setProfile} />
            </Suspense>
          </ErrorBoundary>
        </div>
        <ToastOverlay />
      </>
    )
  }

  if (battle.isOpen) {
    return (
      <>
        <div className="crt mx-auto h-full w-full max-w-2xl overflow-y-auto" style={{ ...safeArea, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ErrorBoundary label="战斗中出了点问题，本局已作答的题目都已保存" onReset={retryPage} onExit={exitBattle} exitLabel="回到今日">
            <Suspense fallback={<PageSkeleton page="battle" />}>
              <Battle reviews={battle.reviews} news={battle.news} pool={battle.pool} knownWords={battle.knownWords} onExit={exitBattle} />
            </Suspense>
          </ErrorBoundary>
        </div>
        <ToastOverlay />
      </>
    )
  }

  const currentTheme = THEMES.find((t) => t.id === theme)
  const lp = levelProgress(profile?.xp ?? 0)
  const rank = rankFromPower(profile?.powerPeak ?? 0)

  return (
    <div className="crt flex h-full min-h-0 overflow-hidden bg-ink" style={safeArea}>
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      {/* 桌面侧栏：移动端隐藏，避免占用宝贵的横向空间 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r-2 border-edge bg-panel md:flex">
        <div className="border-b-2 border-edge px-4 py-4">
          <div className="text-px24 text-gold">单词勇者</div>
          <div className="text-px12 text-dim">WordQuest · 四六级词汇与练习</div>
        </div>
        <nav className="flex-1 space-y-1 p-2" aria-label="主导航">
          {TABS.map((t) => {
            const active = view === 'main' && tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setView('main')
                  setTab(t.id)
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-2 border-2 px-2 py-2 text-left text-px12 ${
                  active ? 'border-gold bg-panel-2 text-gold' : 'border-transparent text-dim hover:text-bright'
                }`}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            )
          })}
          <button
            onClick={() => setView('settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
            className={`flex w-full items-center gap-2 border-2 px-2 py-2 text-left text-px12 ${
              view === 'settings' ? 'border-gold bg-panel-2 text-gold' : 'border-transparent text-dim hover:text-bright'
            }`}
          >
            <Icon name="settings" size={16} />
            设置
          </button>
        </nav>
        <div className="border-t-2 border-edge px-3 py-3 text-px12 text-dim">
          <div className="text-bright">
            LV.{lp.level} · {rank.rank.code} {rank.rank.name}
          </div>
          <div className="mt-1 flex items-center gap-3 tnum">
            <span className="flex items-center gap-1 text-gold">
              <Icon name="coin" size={16} />
              {profile?.coins ?? 0}
            </span>
            <span className="flex items-center gap-1 text-gold">
              <Icon name="flame" size={16} />
              {profile?.streak ?? 0}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <IOSInstallBanner />

        {/* 顶栏：主题切换与设置始终可达 */}
        <header className="flex shrink-0 items-center gap-2 border-b-2 border-edge bg-panel px-3 py-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-px12 text-bright md:text-px24">{pageTitle}</h1>
          </div>
          <button
            onClick={cycleTheme}
            disabled={themeSaving}
            aria-label={`切换主题，当前 ${currentTheme?.name ?? theme}`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 border-2 border-edge px-2 text-px12 text-dim"
          >
            <Icon name="palette" size={16} />
            <span className="hidden sm:inline">{currentTheme?.name ?? '主题'}</span>
          </button>
          <button
            onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
            aria-label="设置"
            aria-pressed={view === 'settings'}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 border-2 px-2 text-px12 ${
              view === 'settings' ? 'border-gold text-gold' : 'border-edge text-dim'
            }`}
          >
            <Icon name="settings" size={16} />
            <span className="hidden sm:inline">设置</span>
          </button>
        </header>

        <main id="main-content" tabIndex={-1} ref={mainRef} className="min-h-0 flex-1 overflow-y-auto" aria-label={pageTitle}>
          <div className="mx-auto w-full max-w-3xl xl:max-w-5xl">
            <ErrorBoundary resetKey={`${view}:${tab}:${pageAttempt}`} onReset={retryPage} onExit={() => { setView('main'); setTab('today'); retryPage() }} exitLabel="回到今日">
              <Suspense fallback={<PageSkeleton page={view === 'settings' ? 'settings' : tab} />}>
                {view === 'settings' ? (
                  <SettingsPage onBack={() => setView('main')} />
                ) : (
                  <>
                    {tab === 'today' && <TodayPage />}
                    {tab === 'words' && <WordsPage />}
                    {tab === 'listening' && <ListeningPage />}
                    {tab === 'stats' && <StatsPage />}
                    {tab === 'me' && <MePage onOpenSettings={() => setView('settings')} />}
                  </>
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {/* 移动端底部导航 */}
        <nav className="grid shrink-0 grid-cols-5 border-t-2 border-edge bg-panel md:hidden" aria-label="主导航" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {TABS.map((t) => {
            const active = view === 'main' && tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setView('main')
                  setTab(t.id)
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 border-t-2 text-px12 ${
                  active ? '-mt-[2px] border-gold bg-panel-2 text-gold' : 'border-transparent text-dim'
                }`}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      <UpdatePrompt />
      <ToastOverlay />
    </div>
  )
}

/** 与页面树并列，战斗、首启引导和页面出错时仍可看到操作反馈。 */
function ToastOverlay() {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div key={toast.id} className="pointer-events-none fixed left-1/2 z-50 w-[calc(100%-24px)] max-w-sm -translate-x-1/2 animate-pop" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <div
        className={`pixel-frame flex items-center gap-2 px-3 py-2 text-px12 ${
          toast.kind === 'levelup' ? '!border-gold text-gold' : toast.kind === 'xp' ? '!border-pass text-pass' : ''
        } bg-panel`}
        role="status"
        aria-live="polite"
      >
        {toast.kind === 'levelup' && <Icon name="trophy" size={16} />}
        {toast.kind === 'xp' && <Icon name="spark" size={16} />}
        {toast.text}
      </div>
    </div>
  )
}

/** 分片载入时保留当前页面的布局与主题。 */
function PageSkeleton({ page }: { page: Tab | 'settings' | 'battle' }) {
  const label = page === 'settings' ? '设置' : page === 'battle' ? '战斗' : TABS.find((t) => t.id === page)?.label
  const block = 'animate-pulse border-2 border-edge bg-panel-2'
  return (
    <div className="space-y-3 p-3 md:p-5" role="status" aria-label={`正在载入${label}`}>
      <div className="text-px12 text-dim">正在载入{label}</div>
      {page === 'battle' ? (
        <div aria-hidden="true" className="space-y-5">
          <div className={`${block} h-4 w-full`} />
          <div className="flex h-40 items-center justify-center"><div className={`${block} h-20 w-20`} /></div>
          <div className={`${block} mx-auto h-12 w-2/3`} />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-14`} />)}</div>
        </div>
      ) : (
        <div aria-hidden="true" className="space-y-3">
          {(page === 'words' || page === 'listening') && (
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className={`${block} h-11`} />)}</div>
          )}
          <div className="pixel-frame space-y-3 bg-panel p-3">
            {page === 'me' && <div className="flex items-center gap-3"><div className={`${block} h-[72px] w-[72px] shrink-0`} /><div className={`${block} h-8 w-1/2`} /></div>}
            <div className={`${block} h-4 w-1/3`} />
            {page === 'stats' || page === 'me' ? (
              <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-16`} />)}</div>
            ) : (
              [0, 1, 2].map((i) => <div key={i} className={`${block} ${page === 'settings' ? 'h-11' : 'h-16'}`} />)
            )}
          </div>
          <div className="pixel-frame space-y-3 bg-panel p-3">
            <div className={`${block} h-4 w-1/3`} />
            <div className={`${block} ${page === 'stats' ? 'h-40' : 'h-20'}`} />
          </div>
        </div>
      )}
    </div>
  )
}

/** iOS 安装入口保留在应用壳，不遮挡学习内容。 */
function IOSInstallBanner() {
  const [show, setShow] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (isIOS && !standalone && readAppearance('wq:ios-banner-dismissed') !== '1') setShow(true)
  }, [])

  if (!show) return null

  return (
    <div className="shrink-0 border-b-2 border-gold bg-panel px-3 py-2">
      <button
        className="flex min-h-[44px] w-full items-start gap-2 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="mt-[2px] text-gold">
          <Icon name="warning" size={16} />
        </span>
        <span className="flex-1 text-px12 leading-snug text-gold">
          添加到主屏幕，方便离线学习。建议定期在「我的」导出学习备份。
        </span>
      </button>
      {expanded && (
        <div className="readable mt-2 space-y-1 text-px12 text-dim">
          <p>① 点击 Safari 底部的「分享」按钮</p>
          <p>② 选择「添加到主屏幕」</p>
          <p>③ 从主屏图标打开本应用</p>
          <p className="text-gold">学习记录保存在当前设备，请定期在「我的」导出 JSON 备份。</p>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <PixelButton size="sm" className="flex-1" onClick={() => setExpanded(true)}>
          查看步骤
        </PixelButton>
        <PixelButton
          size="sm"
          variant="ghost"
          onClick={() => {
            try { localStorage.setItem('wq:ios-banner-dismissed', '1') } catch { /* 当前页面仍可收起提示。 */ }
            setShow(false)
          }}
        >
          我已知晓
        </PixelButton>
      </div>
    </div>
  )
}
