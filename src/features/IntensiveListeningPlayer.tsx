import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { isMuted, setMuted, speakLong, speechErrorMessage, stopSpeaking } from '../core/audio'
import { originalAudioPath } from '../core/originalAudio'
import { estimateTimeline, loopSeek, normalizeLoop, playbackRate, resolveListeningTimeline, splitListeningSentences } from '../core/intensiveListening'
import { Panel, PixelButton } from '../ui/Pixel'

export interface IntensiveListeningHandle {
  playWhole: () => void
  playSentence: () => void
  stop: () => void
}

interface Props {
  /** Keep the original script unchanged: bundled filenames are matched by exact text. */
  text: string
  sourceUrl?: string
  range?: { start: number; end: number }
  playLabel?: string
  previous?: () => void
  next?: () => void
  previousDisabled?: boolean
  nextDisabled?: boolean
  sentenceLabel?: string
  contextKey?: string
}

type Track = { kind: 'whole' | 'sentence'; index: number; start: number; end?: number; bundled: boolean }

function recordingUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function clock(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

/** Preserve the existing complete-response cache used by offline range playback. */
async function cacheRecording(url: string) {
  if (!('caches' in globalThis) || typeof fetch === 'undefined') return
  const cache = await caches.open('wq-audio-v1')
  if ((await cache.match(url))?.status === 200) return
  const response = await fetch(url)
  if (response.status === 200) await cache.put(url, response)
}

/** Original practice reference, with honest estimated timing and real media state. */
export const IntensiveListeningPlayer = forwardRef<IntensiveListeningHandle, Props>(function IntensiveListeningPlayer({
  text, sourceUrl, range, playLabel = '播放原文', previous, next,
  previousDisabled = false, nextDisabled = false, sentenceLabel, contextKey,
}, ref) {
  const fullPath = originalAudioPath(text)
  const fullUrl = sourceUrl || (fullPath ? recordingUrl(fullPath) : undefined)
  const sentences = useMemo(() => splitListeningSentences(text), [text])
  const [index, setIndex] = useState(0)
  const [rate, setRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [wholeDuration, setWholeDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [trackKind, setTrackKind] = useState<'whole' | 'sentence'>('whole')
  const [sentenceLoop, setSentenceLoop] = useState(false)
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)
  const [abLoop, setAbLoop] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const player = useRef<HTMLAudioElement | null>(null)
  const serial = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout>>()
  const track = useRef<Track>({ kind: 'whole', index: 0, start: range?.start || 0, end: range?.end, bundled: Boolean(fullPath && !sourceUrl) })
  const running = useRef({ playing: false, starting: false })
  const runtime = useRef({ rate, sentenceLoop, abLoop, a, b, index })
  runtime.current = { rate, sentenceLoop, abLoop, a, b, index }
  const rangeStart = range?.start ?? 0
  const rangeEnd = range?.end
  const timeline = useMemo(() => {
    if (sourceUrl && rangeEnd !== undefined && rangeEnd > rangeStart && wholeDuration > 0) {
      const end = Math.min(wholeDuration, rangeEnd)
      return { estimated: true, segments: estimateTimeline(text, end - rangeStart).map(segment => ({ ...segment, start: segment.start + rangeStart, end: segment.end + rangeStart })) }
    }
    return resolveListeningTimeline(fullPath, text, wholeDuration)
  }, [fullPath, text, wholeDuration, sourceUrl, rangeStart, rangeEnd])
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  function state(isPlaying: boolean, isStarting: boolean) {
    running.current = { playing: isPlaying, starting: isStarting }
    setPlaying(isPlaying)
    setStarting(isStarting)
  }

  function clearTimer() { clearTimeout(timeout.current) }

  function stop(release = false) {
    serial.current++
    clearTimer()
    stopSpeaking()
    if (player.current) {
      player.current.pause()
      if (release) {
        const current = player.current
        player.current = null
        current.onplaying = current.onwaiting = current.onpause = current.onended = current.onerror = current.onloadedmetadata = current.ontimeupdate = null
        current.removeAttribute('src')
        current.load()
      }
    }
    state(false, false)
  }

  function fail(message = '录音未能播放，请检查网络后点击重试。') {
    clearTimer()
    player.current?.pause()
    state(false, false)
    setError(message)
  }

  function activeLoop(audio: HTMLAudioElement) {
    const current = runtime.current
    if (current.abLoop) return normalizeLoop(current.a, current.b, audio.duration)
    if (current.sentenceLoop && track.current.kind === 'sentence') return normalizeLoop(track.current.start, track.current.end ?? audio.duration, audio.duration)
    return null
  }

  function prepare(url: string, nextTrack: Track) {
    const existing = player.current
    const absolute = new URL(url, document.baseURI).href
    track.current = nextTrack
    setTrackKind(nextTrack.kind)
    if (existing?.src === absolute) return existing
    stop(true)
    setA(null); setB(null); setAbLoop(false)
    const audio = new Audio(url)
    player.current = audio
    audio.preload = 'metadata'
    audio.playbackRate = playbackRate(runtime.current.rate)
    setDuration(0); setPosition(nextTrack.start)
    audio.onloadedmetadata = () => {
      if (player.current !== audio) return
      const length = Number.isFinite(audio.duration) ? audio.duration : 0
      setDuration(length)
      if (track.current.kind === 'whole' || audio.src === (fullUrl ? new URL(fullUrl, document.baseURI).href : '')) setWholeDuration(length)
    }
    audio.onplaying = () => {
      if (player.current !== audio) return
      clearTimer(); state(true, false)
      if (track.current.bundled) void cacheRecording(audio.src).catch(() => undefined)
    }
    audio.onwaiting = () => {
      if (player.current !== audio || audio.paused) return
      state(false, true)
      clearTimer()
      timeout.current = setTimeout(() => { if (player.current === audio && !audio.paused) fail('录音载入超时，请检查网络后点击重试。') }, 12000)
    }
    audio.onpause = () => { if (player.current === audio) { clearTimer(); state(false, false) } }
    audio.onerror = () => { if (player.current === audio) fail() }
    audio.ontimeupdate = () => {
      if (player.current !== audio) return
      setPosition(audio.currentTime)
      const loop = activeLoop(audio)
      const seek = loopSeek(audio.currentTime, loop)
      if (seek != null && !audio.paused) {
        audio.currentTime = seek
        setPosition(seek)
        return
      }
      const end = track.current.end
      if (!loop && end != null && audio.currentTime >= end && !audio.paused) { audio.pause(); state(false, false); return }
      if (track.current.kind === 'whole') {
        const found = timelineRef.current.segments.findIndex((sentence) => audio.currentTime >= sentence.start && audio.currentTime < sentence.end)
        if (found >= 0) setIndex(found)
      }
    }
    audio.onended = () => {
      if (player.current !== audio) return
      const loop = activeLoop(audio)
      if (loop) { audio.currentTime = loop.start; void begin(audio) }
      else state(false, false)
    }
    return audio
  }

  async function begin(audio: HTMLAudioElement) {
    const attempt = ++serial.current
    setError(null)
    state(false, true)
    audio.playbackRate = playbackRate(runtime.current.rate)
    const seek = loopSeek(audio.currentTime, activeLoop(audio))
    if (seek != null) audio.currentTime = seek
    clearTimer()
    timeout.current = setTimeout(() => { if (attempt === serial.current && player.current === audio) fail('录音载入超时，请检查网络后点击重试。') }, 12000)
    try { await audio.play() }
    catch { if (attempt === serial.current && player.current === audio) fail() }
  }

  async function speech(content: string, kind: 'whole' | 'sentence', selected: number) {
    stop(true)
    const attempt = ++serial.current
    track.current = { kind, index: selected, start: 0, bundled: false }
    setTrackKind(kind); setDuration(0); setPosition(0); setError(null)
    state(false, true)
    const result = await speakLong(content, {
      rate: runtime.current.rate,
      onStart: () => { if (attempt === serial.current) state(true, false) },
      onEnd: () => {
        if (attempt !== serial.current) return
        state(false, false)
        if (runtime.current.sentenceLoop && kind === 'sentence') void speech(content, kind, selected)
      },
      onError: (reason) => { if (attempt === serial.current) { state(false, false); setError(speechErrorMessage(reason)) } },
    })
    if (attempt !== serial.current) return
    if (!result.ok && result.reason !== 'cancelled') { state(false, false); setError(speechErrorMessage(result.reason)) }
  }

  function permitted() {
    if (!isMuted()) return true
    setError(speechErrorMessage('muted'))
    return false
  }

  function playWhole() {
    if (!permitted()) return
    setSentenceLoop(false)
    if (!fullUrl) { void speech(text, 'whole', 0); return }
    const current = player.current
    const resume = track.current.kind === 'whole' && current && !current.ended
    stop()
    const audio = prepare(fullUrl, { kind: 'whole', index: 0, start: rangeStart, end: rangeEnd, bundled: Boolean(fullPath && !sourceUrl) })
    const loop = activeLoop(audio)
    const end = rangeEnd ?? audio.duration
    if (!resume || audio.ended || (Number.isFinite(end) && audio.currentTime >= end)) audio.currentTime = loop?.start ?? rangeStart
    void begin(audio)
  }

  function playSentence(selected = index) {
    if (!permitted()) return
    const sentence = sentences[selected]
    if (!sentence) return
    const path = originalAudioPath(sentence)
    if (path && !sourceUrl) {
      stop()
      const audio = prepare(recordingUrl(path), { kind: 'sentence', index: selected, start: 0, bundled: true })
      audio.currentTime = 0
      void begin(audio)
      return
    }
    const segment = timelineRef.current.segments[selected]
    const start = sentences.length === 1 && range ? range.start : segment?.start
    const end = sentences.length === 1 && range ? range.end : segment?.end
    if (fullUrl && start != null && end != null && end > start) {
      stop()
      const audio = prepare(fullUrl, { kind: 'sentence', index: selected, start, end, bundled: Boolean(fullPath && !sourceUrl) })
      audio.currentTime = start
      void begin(audio)
    } else if (fullUrl) setError('录音时间轴尚未载入，请先播放原文，再重试逐句播放。')
    else void speech(sentence, 'sentence', selected)
  }

  function toggle() {
    if (running.current.playing || running.current.starting) stop()
    else if (track.current.kind === 'sentence') playSentence()
    else playWhole()
  }

  function changeSentence(nextIndex: number) {
    stop()
    setIndex(Math.max(0, Math.min(sentences.length - 1, nextIndex)))
    setSentenceLoop(false); setAbLoop(false); setA(null); setB(null); setError(null)
  }

  function previousSentence() { if (previous) { stop(); previous() } else changeSentence(index - 1) }
  function nextSentence() { if (next) { stop(); next() } else changeSentence(index + 1) }

  useImperativeHandle(ref, () => ({ playWhole, playSentence: () => playSentence(), stop: () => stop() }))

  useEffect(() => {
    setIndex(0); setWholeDuration(0); setDuration(0); setPosition(rangeStart); setError(null)
    setSentenceLoop(false); setA(null); setB(null); setAbLoop(false); setReferenceOpen(false)
    if (fullUrl) prepare(fullUrl, { kind: 'whole', index: 0, start: rangeStart, end: rangeEnd, bundled: Boolean(fullPath && !sourceUrl) })
    return () => stop(true)
    // Playback lifetime is the exact script and recording, independent of media events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fullUrl, rangeStart, rangeEnd, contextKey])

  useEffect(() => { if (player.current) player.current.playbackRate = playbackRate(rate) }, [rate])

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (event.code === 'Space' && !target?.closest('button, a, summary')) { event.preventDefault(); toggle() }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); previousSentence() }
      else if (event.key === 'ArrowRight') { event.preventDefault(); nextSentence() }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  })

  const mediaReady = duration > 0 && Boolean(player.current)
  const loop = normalizeLoop(a, b, duration)
  const lower = trackKind === 'whole' ? rangeStart : 0
  const upper = trackKind === 'whole' && rangeEnd != null ? Math.min(rangeEnd, duration) : duration
  const referenceSentence = sentences[index]
  const previousUnavailable = previous ? previousDisabled : index === 0
  const nextUnavailable = next ? nextDisabled : index + 1 >= sentences.length

  return <Panel className="intensive-listening">
    <div className="intensive-main-controls">
      <PixelButton variant="primary" icon="speaker" aria-busy={starting} onClick={() => { if (running.current.playing || running.current.starting) stop(); else playWhole() }}>{starting ? '取消载入' : playing ? '暂停播放' : error ? '重试播放' : playLabel}</PixelButton>
      <div className="intensive-rates" role="group" aria-label="播放速度">{[0.75, 1, 1.25, 1.5].map((value) => <PixelButton key={value} size="sm" aria-pressed={rate === value} variant={rate === value ? 'primary' : 'default'} onClick={() => setRate(value)}>{value}×</PixelButton>)}</div>
    </div>
    <p className="intensive-status readable text-dim" role="status" aria-live="polite">{starting ? '正在载入录音…' : playing ? '正在播放' : '已暂停'} · {trackKind === 'sentence' && originalAudioPath(sentences[index] || '') && !sourceUrl ? '独立句子录音' : fullPath && !sourceUrl ? '内置英语合成录音' : sourceUrl ? '本机录音' : '浏览器英语朗读'}</p>
    {fullUrl && <div className="intensive-progress">
      <label className="text-px12 text-dim" htmlFor={`intensive-progress-${fullPath ?? 'local'}`}>{trackKind === 'sentence' ? '本句录音进度' : '原文录音进度'} <span className="tnum">{clock(position)} / {mediaReady ? clock(upper) : '待载入'}</span></label>
      <input id={`intensive-progress-${fullPath ?? 'local'}`} type="range" min={lower} max={Math.max(lower + 0.1, upper)} step="0.1" value={Math.min(Math.max(position, lower), Math.max(lower, upper))} disabled={!mediaReady} aria-label="录音播放位置" onChange={(event) => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setPosition(value) }} />
    </div>}
    {timeline.estimated && sentences.length > 1 && fullUrl && <p className="intensive-help readable text-dim">时间轴为机器估算/待校对。逐句边界可能落在句中，可用 A/B 手动调整。</p>}
    <div className="intensive-sentence-controls">
      <PixelButton size="sm" disabled={previousUnavailable} onClick={previousSentence}>上一句</PixelButton>
      <span className="text-px12 text-dim tnum">{sentenceLabel || `${index + 1}/${sentences.length} 句`}</span>
      <PixelButton size="sm" disabled={nextUnavailable} onClick={nextSentence}>下一句</PixelButton>
      <PixelButton size="sm" onClick={() => playSentence()}>播放本句</PixelButton>
      <PixelButton size="sm" aria-pressed={sentenceLoop} variant={sentenceLoop ? 'primary' : 'default'} onClick={() => { const enabled = !sentenceLoop; setSentenceLoop(enabled); setAbLoop(false); runtime.current.abLoop = false; runtime.current.sentenceLoop = enabled; if (enabled) playSentence() }}>单句循环{sentenceLoop ? '开' : '关'}</PixelButton>
    </div>
    <div className="intensive-ab-controls" role="group" aria-label="手动 A B 循环">
      <PixelButton size="sm" disabled={!mediaReady} onClick={() => { setA(player.current?.currentTime ?? 0); setB(null); setAbLoop(false); setError(null) }}>设 A{a == null ? '' : ` ${clock(a)}`}</PixelButton>
      <PixelButton size="sm" disabled={!mediaReady || a == null} onClick={() => { const value = player.current?.currentTime ?? 0; if (a != null && value > a) { setB(value); setAbLoop(true); setSentenceLoop(false); setError(null) } else setError('B 点需在 A 点之后，请先向后定位。') }}>设 B{b == null ? '' : ` ${clock(b)}`}</PixelButton>
      <PixelButton size="sm" disabled={!loop} aria-pressed={abLoop} variant={abLoop ? 'primary' : 'default'} onClick={() => { setAbLoop(!abLoop); setSentenceLoop(false) }}>A/B 循环{abLoop ? '开' : '关'}</PixelButton>
      <PixelButton size="sm" disabled={a == null && b == null} onClick={() => { setA(null); setB(null); setAbLoop(false) }}>清除 A/B</PixelButton>
    </div>
    {error && <div className="intensive-error readable" role="alert"><p className="text-fail">{error}</p><PixelButton size="sm" onClick={() => { if (isMuted()) setMuted(false); if (track.current.kind === 'sentence') playSentence(); else playWhole() }}>{isMuted() ? '开启声音并重试' : '重试播放'}</PixelButton></div>}
    <p className="intensive-help readable text-dim">空格播放或暂停，左右方向键切句。输入时保留编辑按键。A/B 使用当前录音的位置。</p>
    <details open={referenceOpen} className="intensive-reference" onToggle={(event) => setReferenceOpen(event.currentTarget.open)}>
      <summary>精听参考</summary>
      <p className="readable text-dim">不是考试字幕。可先独立听辨，再展开原文核对。</p>
      <ol>{sentences.map((sentence, sentenceIndex) => <li key={sentenceIndex} className={sentenceIndex === index ? 'is-current' : ''}>
        <button type="button" aria-current={sentenceIndex === index ? 'true' : undefined} onClick={() => changeSentence(sentenceIndex)}><span className="text-px12 text-dim tnum">{sentenceIndex + 1}{timeline.segments[sentenceIndex] && sentences.length > 1 ? ` · ${timeline.estimated ? '约 ' : ''}${clock(timeline.segments[sentenceIndex].start)}` : ''}</span><span className="readable">{sentence}</span></button>
      </li>)}</ol>
      {!referenceSentence && <p className="readable text-dim">当前材料尚无可用原文。</p>}
    </details>
  </Panel>
})
