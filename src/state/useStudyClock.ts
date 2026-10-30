import { useEffect, useState } from 'react'

/** 到期时间与日期不是数据库写入，保持前台页面的计数随真实时间更新。 */
export function useStudyClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return now
}
