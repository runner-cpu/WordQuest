import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { PixelButton } from '../ui/Pixel'

/**
 * Service Worker 用 prompt-based 更新（§8.2）：
 * 提示「有新版本」，绝不在学习中强制刷新。
 */
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [update, setUpdate] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    let interval: ReturnType<typeof setInterval> | undefined
    let registration: ServiceWorkerRegistration | undefined
    const check = () => {
      if (!disposed && navigator.onLine && document.visibilityState === 'visible') void registration?.update().catch(() => undefined)
    }
    const fn = registerSW({
      immediate: false,
      onNeedRefresh() {
        if (!disposed) setNeedRefresh(true)
      },
      onRegisteredSW(_url, registered) {
        if (!registered || disposed) return
        registration = registered
        // 启动后立刻检查一次，再每 10 分钟轮询：
        // 本地开发常常改了代码却因为 SW 缓存一直看到旧版
        check()
        interval = setInterval(check, 10 * 60 * 1000)
      },
      onRegisterError() { /* Offline startup can still use existing cached lessons. */ },
    })
    setUpdate(() => fn)
    window.addEventListener('online', check)
    return () => { disposed = true; clearInterval(interval); window.removeEventListener('online', check) }
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-md px-3 md:bottom-4 md:left-60 md:right-0">
      <div className="pixel-frame flex flex-wrap items-center gap-2 bg-panel px-3 py-2" role="region" aria-label="应用更新">
        <span className="flex-1 text-px12 text-bright">有新版本可用，请先保存练习</span>
        <PixelButton
          variant="primary"
          size="sm"
          disabled={updating || !update}
          onClick={() => {
            if (!update || updating) return
            setUpdating(true); setError('')
            void update(true).catch(() => setError('更新暂未完成，请联网后重试，学习记录仍在本机。')).finally(() => setUpdating(false))
          }}
        >
          {updating ? '更新中…' : '更新'}
        </PixelButton>
        <PixelButton
          variant="ghost"
          size="sm"
          disabled={updating}
          onClick={() => setNeedRefresh(false)}
        >
          稍后
        </PixelButton>
        {error && <p role="alert" className="readable w-full text-fail">{error}</p>}
      </div>
    </div>
  )
}
