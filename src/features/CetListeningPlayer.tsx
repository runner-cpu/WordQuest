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
  const attempt = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout>>()
  const range = a !== undefined && b !== undefined ? normalizeLoop(a, b, duration) : groupLoop(group, duration)
  function clearTimer() { clearTimeout(timeout.current) }
  function fail(message: string) {
    clearTimer(); attempt.current++
    audio.current?.pause()
    setStatus(''); setError(message)
  }
  function watchLoading() {
    clearTimer()
    timeout.current = setTimeout(() => fail('录音载入超时，请检查网络后重试'), 12000)
  }
  useEffect(() => { setDuration(0) }, [src])
  useEffect(() => {
    const player = audio.current
    attempt.current++; clearTimer()
    player?.pause(); setLooping(false); setStatus(''); setError(''); setA(undefined); setB(undefined)
    return () => { attempt.current++; clearTimer(); player?.pause() }
  }, [src, group, active])
  async function playGroup() {
    const player = audio.current
    if (!player || group.startSeconds === undefined && !range) return
    const request = ++attempt.current
    setError(''); setStatus('正在载入录音…')
    watchLoading()
    try { player.currentTime = range?.start ?? group.startSeconds!; await player.play() }
    catch { if (request === attempt.current) fail('录音未能播放，请检查网络后重试') }
  }
  return <div className={`cet-ready-player readable ${active ? '' : 'cet-ready-player-secondary'}`}>
    <span className="text-dim">本套听力</span>
    <audio ref={audio} controls preload="metadata" src={src} aria-label="本套真题听力播放器"
      onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onCanPlay={() => { clearTimer(); if (audio.current?.paused) setStatus('录音已就绪') }}
      onPlaying={() => { clearTimer(); setStatus('正在播放'); setError('') }}
      onWaiting={event => { if (!event.currentTarget.paused) { setStatus('正在缓冲录音…'); watchLoading() } }}
      onPause={() => { clearTimer(); setStatus('已暂停') }}
      onEnded={event => {
        if (looping && range) { event.currentTarget.currentTime = range.start; void event.currentTarget.play().catch(() => setError('循环播放未能开始，请重试')) }
        else setStatus('本套播放结束')
      }}
      onError={() => fail('录音加载未完成，请检查网络并重试')}
      onTimeUpdate={event => {
        if (!looping || !range || event.currentTarget.paused) return
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
          <PixelButton disabled={a === undefined || !duration} onClick={() => {
            const next = audio.current?.currentTime ?? 0
            if (a !== undefined && next > a) { setB(next); setError('') }
            else setError('B 点需在 A 点之后，请先向后定位。')
          }}>标记 B</PixelButton>
          {a !== undefined && <><span className="text-dim">A {a.toFixed(1)} 秒 · B {b?.toFixed(1) ?? '待标记'}{b !== undefined && !range ? '（B 需晚于 A）' : ''}</span><PixelButton onClick={() => { setA(undefined); setB(undefined); setLooping(false) }}>清除手动区间</PixelButton></>}
        </div>
      <p className="text-dim">题组定位不含逐句字幕；手动 A/B 仅用于本次重听。</p>
      {status && <span role="status" className="text-dim">{status}</span>}
    </div>}
    {error && <div role="alert" className="cet-ready-audio-error text-fail">{error}<button type="button" onClick={() => { attempt.current++; setError(''); setStatus('正在载入录音…'); audio.current?.load(); watchLoading() }}>重试录音</button></div>}
  </div>
}
