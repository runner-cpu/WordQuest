/**
 * 发音与音效。
 *
 * 关于发音：本项目不打包单词音频（四六级词库音频有版权，开源语料又与
 * 考试题材偏离），实际使用浏览器内置的语音合成（Web Speech API）。
 *
 * 一个真实的坑：很多中文 Windows 只装了中文语音包。此时 speechSynthesis
 * 拿不到任何英语 voice，如果仍然按 en-US 去 speak，浏览器会用中文音库
 * 硬读英文，听感是「没有声音」或含糊不清。因此这里必须：
 *   1. 明确挑选英语 voice；
 *   2. 找不到时告知调用方，由 UI 提示用户安装英语语音包，而不是静默失败。
 */

const audioCache = new Map<string, HTMLAudioElement>()
let cachedVoice: SpeechSynthesisVoice | null = null
let voiceResolved = false
let muted = false

export function setMuted(v: boolean) {
  muted = v
  localStorage.setItem('wq:muted', v ? '1' : '0')
}

export function isMuted(): boolean {
  return muted || localStorage.getItem('wq:muted') === '1'
}

/** 英语语音的偏好排序：本地 > 网络，美音 > 英音 > 其他英语 */
function scoreVoice(v: SpeechSynthesisVoice): number {
  let score = 0
  if (v.localService) score += 100
  if (v.lang === 'en-US') score += 40
  else if (v.lang === 'en-GB') score += 30
  else if (v.lang.startsWith('en')) score += 20
  // 常见的高质量语音名
  if (/natural|neural|google|samantha|aria|jenny|guy/i.test(v.name)) score += 15
  return score
}

function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'))
}

/**
 * 选一个英语 voice。返回 null 表示系统没有英语语音包。
 * 注意：voices 是异步加载的，首次调用可能为空，所以这里不缓存 null。
 */
export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const list = englishVoices()
  if (list.length === 0) {
    voiceResolved = true
    return null
  }
  list.sort((a, b) => scoreVoice(b) - scoreVoice(a))
  cachedVoice = list[0]
  voiceResolved = true
  return cachedVoice
}

/** 系统是否有可用的英语语音 */
export function hasEnglishVoice(): boolean {
  return englishVoices().length > 0
}

/** 已检测过语音且确实没有英语语音 */
export function needsVoiceInstall(): boolean {
  return voiceResolved && englishVoices().length === 0
}

/** 语音列表异步就绪后重新解析 */
export function onVoicesChanged(cb: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => {}
  const handler = () => {
    cachedVoice = null
    voiceResolved = false
    cb()
  }
  speechSynthesis.addEventListener('voiceschanged', handler)
  // 某些浏览器不触发事件，主动拉一次
  if (speechSynthesis.getVoices().length === 0) {
    setTimeout(handler, 300)
  }
  return () => speechSynthesis.removeEventListener('voiceschanged', handler)
}

export interface SpeakOptions {
  rate?: number
  /** 已下载音频包的相对路径，如 audio/cet4-core/u001/abandon.opus */
  src?: string
  /** 播放结束后回调 */
  onEnd?: () => void
}

export interface SpeakResult {
  ok: boolean
  /** 失败原因，供 UI 给出可操作的提示 */
  reason?: 'muted' | 'no-voice' | 'unsupported' | 'error'
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  if (isMuted()) return { ok: false, reason: 'muted' }
  const { rate = 1, src, onEnd } = opts

  // 1. 优先已下载的音频包（目前未启用，接口保留）
  if (src) {
    try {
      const base = import.meta.env.BASE_URL || './'
      const url = `${base.replace(/\/$/, '')}/${src}`
      let el = audioCache.get(url)
      if (!el) {
        el = new Audio(url)
        el.preload = 'auto'
        audioCache.set(url, el)
      }
      el.playbackRate = rate
      el.currentTime = 0
      await el.play()
      el.onended = () => onEnd?.()
      return { ok: true }
    } catch {
      // 音频包缺失，继续走 TTS
    }
  }

  // 2. 浏览器语音合成
  if (typeof speechSynthesis === 'undefined') return { ok: false, reason: 'unsupported' }

  const voice = pickEnglishVoice()
  if (!voice) return { ok: false, reason: 'no-voice' }

  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = Math.min(2, Math.max(0.5, rate))
  u.pitch = 1
  u.onend = () => onEnd?.()
  speechSynthesis.speak(u)
  return { ok: true }
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

/**
 * 长文本朗读：按句切分、逐句排队。
 *
 * Safari 会截断超长的单条 utterance，整套听力材料必须分段读；
 * 也不能复用 speak()——它每次调用都会 cancel 掉前一句。
 */
export async function speakLong(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  if (isMuted()) return { ok: false, reason: 'muted' }
  const { rate = 1, onEnd } = opts
  if (typeof speechSynthesis === 'undefined') return { ok: false, reason: 'unsupported' }
  const voice = pickEnglishVoice()
  if (!voice) return { ok: false, reason: 'no-voice' }

  const chunks = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean)
  if (chunks.length === 0) return { ok: false, reason: 'error' }

  speechSynthesis.cancel()
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk)
    u.voice = voice
    u.lang = voice.lang
    u.rate = Math.min(2, Math.max(0.5, rate))
    u.pitch = 1
    // 最后一句结束时才算整段播完
    if (i === chunks.length - 1) u.onend = () => onEnd?.()
    speechSynthesis.speak(u)
  })
  return { ok: true }
}

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
