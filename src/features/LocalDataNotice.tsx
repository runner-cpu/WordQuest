import { useId, useState } from 'react'
import { localDataNoticeState } from '../core/localDataNotice'
import { PixelButton } from '../ui/Pixel'

export function LocalDataLabel() {
  return <span className="readable whitespace-nowrap text-[14px] font-semibold text-gold">本机数据</span>
}

/** Inline and dismissible: the report remains usable while explaining its browser boundary. */
export function LocalDataNotice() {
  const [visible, setVisible] = useState(() => !localDataNoticeState.isAcknowledged())
  const title = useId()
  if (!visible) return null
  return <section className="pixel-frame border-gold bg-panel p-4" aria-labelledby={title}>
    <h2 id={title} className="readable text-[17px] font-semibold text-bright">本机数据说明</h2>
    <p className="readable mt-2 text-[16px] leading-relaxed text-dim">当前数据来自本浏览器，跨设备请使用迁移。</p>
    <PixelButton className="readable mt-3 min-h-11 !text-[16px]" onClick={() => {
      localDataNoticeState.acknowledge()
      setVisible(false)
    }}>知道了</PixelButton>
  </section>
}
