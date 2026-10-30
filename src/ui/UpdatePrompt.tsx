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

  useEffect(() => {
    const fn = registerSW({
      immediate: false,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        // 启动后立刻检查一次，再每 10 分钟轮询：
        // 本地开发常常改了代码却因为 SW 缓存一直看到旧版
        void registration.update()
        setInterval(() => void registration.update(), 10 * 60 * 1000)
      },
    })
    setUpdate(() => fn)
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-md px-3 md:bottom-4 md:left-60 md:right-0">
      <div className="pixel-frame flex items-center gap-2 bg-panel px-3 py-2">
        <span className="flex-1 text-px12 text-bright">有新版本可用</span>
        <PixelButton
          variant="primary"
          size="sm"
          onClick={() => void update?.(true)}
        >
          更新
        </PixelButton>
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={() => setNeedRefresh(false)}
        >
          稍后
        </PixelButton>
      </div>
    </div>
  )
}
