import { useEffect, useRef, useState } from 'react'
import type { CetListeningGroup } from '../types/cetReadyPaper'
import { groupLoop, loopSeek, normalizeLoop } from '../core/intensiveListening'
import { PixelButton } from '../ui/Pixel'

/** Uses the original complete recording; seeking never changes the cached asset. */
export function CetListeningPlayer({ src, group, active }: { src: string; group: CetListeningGroup; active: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [duration, setDuration] = useState(0)
  const [looping, setLooping] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [a, setA] = useState<number>()
  const [b, setB] = useState<number>()
  const range = a !== undefined && b !== undefined ? normalizeLoop(a, b, duration) : groupLoop(group, duration)
  useEffect(() => {
    const player = audio.current
    player?.pause(); setLooping(false); setStatus(''); setA(undefined); setB(undefined)
    return () => { player?.pause() }
  }, [src, group, active])
  async function playGroup() {
    const player = audio.current
    if (!player || group.startSeconds === undefined && !range) return
    setError(''); setStatus('正在载入录音…')
    try { player.currentTime = range?.start ?? group.startSeconds!; await player.play() }
    catch { setStatus(''); setError('录音未能播放，请检查网络后重试') }
  }
  return <div className={`cet-ready-player readable ${active ? '' : 'cet-ready-player-secondary'}`}>
    <span className="text-dim">本套听力</span>
    <audio ref={audio} controls preload="metadata" src={src} aria-label="本套真题听力播放器"
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      onPlaying={() => { setStatus('正在播放'); setError('') }}
      onWaiting={() => setStatus('正在缓冲录音…')}
      onPause={() => setStatus('已暂停')}
      onEnded={event => {
        if (looping && range) { event.currentTarget.currentTime = range.start; void event.currentTarget.play().catch(() => setError('循环播放未能开始，请重试')) }
        else setStatus('本套播放结束')
      }}
      onError={() => { setStatus(''); setError('录音加载未完成，请检查网络并重试') }}
      onTimeUpdate={event => {
        if (!looping || !range) return
        const next = loopSeek(event.currentTarget.currentTime, range)
        if (next !== null) event.currentTarget.currentTime = next
      }} />
    {active && <div className="cet-ready-group-controls">
      {group.startSeconds === undefined && <p className="text-dim">本题组尚未定位，可手动拖动</p>}
      {group.startSeconds !== undefined && group.endSeconds === undefined && <p className="text-dim">本题组仅有起点，终点待补录；可手动标记 A/B。</p>}
      <div className="cet-ready-tools">
          <PixelButton disabled={group.startSeconds === undefined && !range} onClick={() => void playGroup()} icon="speaker">播放本段</PixelButton>
          <PixelButton disabled={!range} aria-pressed={looping} onClick={() => {
            setLooping(!looping)
            if (!looping) void playGroup()
          }}>{looping ? '关闭题组循环' : '题组循环'}</PixelButton>
          <PixelButton disabled={!duration} onClick={() => { setA(audio.current?.currentTime ?? 0); setB(undefined); setLooping(false) }}>标记 A</PixelButton>
          <PixelButton disabled={a === undefined || !duration} onClick={() => setB(audio.current?.currentTime ?? 0)}>标记 B</PixelButton>
          {a !== undefined && <><span className="text-dim">A {a.toFixed(1)} 秒 · B {b?.toFixed(1) ?? '待标记'}{b !== undefined && !range ? '（B 需晚于 A）' : ''}</span><PixelButton onClick={() => { setA(undefined); setB(undefined); setLooping(false) }}>清除手动区间</PixelButton></>}
        </div>
      <p className="text-dim">题组定位不含逐句字幕；手动 A/B 仅用于本次重听。</p>
      {status && <span role="status" className="text-dim">{status}</span>}
    </div>}
    {error && <div role="alert" className="cet-ready-audio-error text-fail">{error}<button type="button" onClick={() => { setError(''); setStatus('正在载入录音…'); audio.current?.load() }}>重试录音</button></div>}
  </div>
}
