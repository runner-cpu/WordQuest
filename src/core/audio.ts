/** Learning playback uses bundled recordings when available, then browser speech. */
let cachedVoice: SpeechSynthesisVoice | null = null
let voiceResolved = false
let muted = false
let playbackSerial = 0
let cancelPlayback: (() => void) | undefined

export function setMuted(value: boolean) {
  muted = value
  try { localStorage.setItem('wq:muted', value ? '1' : '0') } catch { /* private storage */ }
  if (value) stopSpeaking()
}

export function isMuted(): boolean {
  try { return muted || localStorage.getItem('wq:muted') === '1' } catch { return muted }
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  return (voice.localService ? 100 : 0) + (voice.lang === 'en-US' ? 40 : voice.lang === 'en-GB' ? 30 : 20) +
    (/natural|neural|google|samantha|aria|jenny|guy/i.test(voice.name) ? 15 : 0)
}

function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  try { return speechSynthesis.getVoices().filter((voice) => voice.lang?.toLowerCase().startsWith('en')) } catch { return [] }
}

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  const list = englishVoices()
  voiceResolved = true
  cachedVoice = list.find((voice) => voice.voiceURI === cachedVoice?.voiceURI) ?? list.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null
  return cachedVoice
}

export function hasEnglishVoice(): boolean { return englishVoices().length > 0 }
export function needsVoiceInstall(): boolean { return voiceResolved && !hasEnglishVoice() }

export function onVoicesChanged(callback: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => undefined
  const handler = () => { cachedVoice = null; voiceResolved = false; callback() }
  speechSynthesis.addEventListener('voiceschanged', handler)
  const timer = setTimeout(handler, 300)
  return () => { clearTimeout(timer); speechSynthesis.removeEventListener('voiceschanged', handler) }
}

async function waitForVoice(): Promise<SpeechSynthesisVoice | null> {
  const voice = pickEnglishVoice()
  if (voice || typeof speechSynthesis === 'undefined') return voice
  return new Promise((resolve) => {
    const synthesis = speechSynthesis
    let finished = false
    const finish = (voice: SpeechSynthesisVoice | null) => {
      if (finished) return
      finished = true
      clearTimeout(timeout); clearInterval(poll)
      synthesis.removeEventListener('voiceschanged', check)
      resolve(voice)
    }
    const check = () => { const voice = pickEnglishVoice(); if (voice) finish(voice) }
    const timeout = setTimeout(() => finish(pickEnglishVoice()), 1500)
    const poll = setInterval(check, 150)
    synthesis.addEventListener('voiceschanged', check)
    check()
  })
}

export type SpeakFailure = 'muted' | 'no-voice' | 'unsupported' | 'error' | 'audio-error' | 'cancelled'
export interface SpeakOptions {
  rate?: number
  /** Same-site recording path. Playback never requires an external TTS service. */
  src?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (reason: SpeakFailure) => void
}
export interface SpeakResult { ok: boolean; reason?: SpeakFailure }

export function speechErrorMessage(reason?: SpeakFailure): string {
  if (reason === 'muted') return '当前已关闭发音，可开启声音后重试。'
  if (reason === 'audio-error') return '录音未能播放，请检查网络后重试。'
  if (reason === 'no-voice') return '英语语音尚不可用，可使用听力页的内置录音练习。'
  if (reason === 'unsupported') return '此浏览器不支持朗读，可使用听力页的内置录音练习。'
  return '朗读未能开始，请点击播放重试。'
}

export function stopSpeaking() {
  playbackSerial++
  cancelPlayback?.()
  cancelPlayback = undefined
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function playRecording(src: string, opts: SpeakOptions, serial: number): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const base = import.meta.env?.BASE_URL || './'
    const player = new Audio(`${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`)
    const recordingUrl = player.src
    player.preload = 'auto'
    player.playbackRate = Math.min(2, Math.max(0.5, opts.rate ?? 1))
    let started = false
    let settled = false
    let finished = false
    const settle = (result: SpeakResult) => { if (!settled) { settled = true; resolve(result) } }
    const cleanup = () => { clearTimeout(timeout); player.onended = null; player.onerror = null; if (serial === playbackSerial) cancelPlayback = undefined }
    const fail = () => {
      if (finished || serial !== playbackSerial) return
      finished = true; cleanup(); player.pause()
      settle({ ok: false, reason: 'audio-error' })
      if (started) opts.onError?.('audio-error')
    }
    const timeout = setTimeout(fail, 12000)
    cancelPlayback = () => { finished = true; cleanup(); player.pause(); player.removeAttribute('src'); player.load(); settle({ ok: false, reason: 'cancelled' }) }
    player.onended = () => { if (finished || serial !== playbackSerial) return; finished = true; cleanup(); settle({ ok: true }); opts.onEnd?.() }
    player.onerror = fail
    try {
      void player.play().then(() => {
        if (finished || serial !== playbackSerial) return
        started = true; clearTimeout(timeout); settle({ ok: true }); opts.onStart?.()
        // Media requests can return 206. Cache a complete 200 response for offline range playback.
        if ('caches' in globalThis && typeof fetch !== 'undefined') void (async () => {
          const cache = await caches.open('wq-audio-v1')
          if ((await cache.match(recordingUrl))?.status === 200) return
          const response = await fetch(recordingUrl)
          if (response.status === 200) await cache.put(recordingUrl, response)
        })().catch(() => undefined)
      }).catch(fail)
    } catch { fail() }
  })
}

async function playSpeech(text: string, opts: SpeakOptions, long: boolean): Promise<SpeakResult> {
  if (isMuted()) return { ok: false, reason: 'muted' }
  stopSpeaking()
  const serial = playbackSerial
  if (opts.src) return playRecording(opts.src, opts, serial)
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return { ok: false, reason: 'unsupported' }
  const voice = await waitForVoice()
  if (serial !== playbackSerial) return { ok: false, reason: 'cancelled' }
  if (!voice) return { ok: false, reason: 'no-voice' }
  const chunks = (long ? text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text] : [text]).map((chunk) => chunk.trim()).filter(Boolean)
  if (!chunks.length) return { ok: false, reason: 'error' }
  const synthesis = speechSynthesis
  return new Promise((resolve) => {
    let position = 0
    let settled = false
    let started = false
    let finished = false
    // Keep a strong reference until the current utterance finishes.
    let utterance: SpeechSynthesisUtterance | undefined
    let timeout: ReturnType<typeof setTimeout>
    const settle = (result: SpeakResult) => { if (!settled) { settled = true; resolve(result) } }
    const cleanup = () => { clearTimeout(timeout); if (utterance) { utterance.onstart = null; utterance.onend = null; utterance.onerror = null }; utterance = undefined; if (serial === playbackSerial) cancelPlayback = undefined }
    const fail = () => {
      if (finished || serial !== playbackSerial) return
      finished = true; cleanup(); synthesis.cancel(); settle({ ok: false, reason: 'error' })
      if (started) opts.onError?.('error')
    }
    cancelPlayback = () => { finished = true; cleanup(); settle({ ok: false, reason: 'cancelled' }) }
    const next = () => {
      if (finished || serial !== playbackSerial) return
      utterance = new SpeechSynthesisUtterance(chunks[position])
      utterance.voice = voice; utterance.lang = voice.lang
      utterance.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1)); utterance.pitch = 1
      utterance.onstart = () => { clearTimeout(timeout); if (!started) { started = true; settle({ ok: true }); opts.onStart?.() } }
      utterance.onerror = fail
      utterance.onend = () => {
        clearTimeout(timeout)
        if (finished || serial !== playbackSerial) return
        if (++position < chunks.length) next()
        else { finished = true; cleanup(); settle({ ok: true }); opts.onEnd?.() }
      }
      timeout = setTimeout(fail, 7000)
      try { if (synthesis.paused) synthesis.resume(); synthesis.speak(utterance) } catch { fail() }
    }
    next()
  })
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> { return playSpeech(text, opts, false) }
export function speakLong(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> { return playSpeech(text, opts, true) }

/** 8-bit 音效：用 Web Audio 合成，零素材体积（§7.1） */
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export type SfxName = 'correct' | 'wrong' | 'levelUp' | 'chest' | 'tap' | 'kill' | 'boss'

const SFX: Record<SfxName, { freq: number[]; dur: number; type: OscillatorType }> = {
  correct: { freq: [880, 1320], dur: 0.09, type: 'square' },
  wrong: { freq: [220, 165], dur: 0.13, type: 'square' },
  levelUp: { freq: [523, 659, 784, 1047], dur: 0.12, type: 'square' },
  chest: { freq: [659, 880, 1175], dur: 0.1, type: 'triangle' },
  tap: { freq: [440], dur: 0.04, type: 'square' },
  kill: { freq: [1175, 1568, 2093], dur: 0.08, type: 'square' },
  boss: { freq: [131, 165, 196, 262], dur: 0.16, type: 'sawtooth' },
}

export function playSfx(name: SfxName, pitchMul = 1) {
  if (isMuted()) return
  const ac = audioCtx()
  if (!ac) return
  const { freq, dur, type } = SFX[name]
  freq.forEach((f, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    // 连击越高音调越高，用音高直接表达「手感在变热」
    osc.frequency.value = Math.min(8000, f * pitchMul)
    const t0 = ac.currentTime + i * dur
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.01)
  })
}
