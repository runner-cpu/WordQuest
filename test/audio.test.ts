import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { setMuted, speak, speakLong, stopSpeaking } from '../src/core/audio.ts'

class Utterance {
  voice?: unknown; lang = ''; rate = 1; pitch = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}
const english = { name: 'Local English', lang: 'en-US', localService: true, voiceURI: 'english' }
class Synthesis extends EventTarget {
  voices = [english]
  queue: Utterance[] = []
  paused = false
  getVoices() { return this.voices }
  speak(utterance: Utterance) { this.queue.push(utterance) }
  cancel() {}
  resume() { this.paused = false }
}
function install(t: TestContext) {
  const synthesis = new Synthesis()
  for (const [name, value] of Object.entries({ speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => { if (before) Object.defineProperty(globalThis, name, before); else Reflect.deleteProperty(globalThis, name) })
  }
  setMuted(false)
  t.after(() => stopSpeaking())
  return synthesis
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('speech waits for asynchronous English voices and confirms actual start', async (t) => {
  const synthesis = install(t); synthesis.voices = []
  let resolved = false
  const result = speak('Hello.').then((value) => { resolved = true; return value })
  await tick()
  assert.equal(synthesis.queue.length, 0)
  synthesis.voices = [english]; synthesis.dispatchEvent(new Event('voiceschanged'))
  await tick()
  assert.equal(synthesis.queue.length, 1)
  assert.equal(resolved, false, 'queuing an utterance is not successful playback')
  synthesis.queue[0].onstart?.()
  assert.deepEqual(await result, { ok: true })
  synthesis.queue[0].onend?.()
})

test('synthesis errors are surfaced before and after playback begins', async (t) => {
  const synthesis = install(t)
  const failed = speak('Hello.'); await tick()
  synthesis.queue[0].onerror?.()
  assert.deepEqual(await failed, { ok: false, reason: 'error' })
  const errors: string[] = []
  const started = speak('Again.', { onError: (reason) => errors.push(reason) }); await tick()
  synthesis.queue[1].onstart?.(); await started
  synthesis.queue[1].onerror?.()
  assert.deepEqual(errors, ['error'])
})

test('long speech advances one sentence at a time and cancellation cannot start a later sentence', async (t) => {
  const synthesis = install(t)
  let ended = 0
  const playing = speakLong('One. Two. Three.', { onEnd: () => ended++ }); await tick()
  assert.equal(synthesis.queue.length, 1)
  synthesis.queue[0].onstart?.(); await playing
  synthesis.queue[0].onend?.()
  assert.equal(synthesis.queue.length, 2)
  const staleEnd = synthesis.queue[1].onend
  stopSpeaking(); staleEnd?.()
  assert.equal(synthesis.queue.length, 2)
  assert.equal(ended, 0)
  const cancelled = speak('Pending.'); await tick(); stopSpeaking()
  assert.deepEqual(await cancelled, { ok: false, reason: 'cancelled' })
})

test('a stopped request waiting for voices never starts when the voice list arrives', async (t) => {
  const synthesis = install(t); synthesis.voices = []
  const pending = speak('Do not play later.'); await tick(); stopSpeaking()
  synthesis.voices = [english]; synthesis.dispatchEvent(new Event('voiceschanged'))
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' })
  assert.equal(synthesis.queue.length, 0)
})

test('bundled recordings play without speech support and clean up on exit', async (t) => {
  const synthesis = install(t); synthesis.voices = []
  const instances: Recording[] = []
  class Recording {
    preload = ''; playbackRate = 1; paused = true
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public src: string) { instances.push(this) }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
    load() {}
    removeAttribute() {}
  }
  const before = Object.getOwnPropertyDescriptor(globalThis, 'Audio')
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: Recording })
  t.after(() => { if (before) Object.defineProperty(globalThis, 'Audio', before); else Reflect.deleteProperty(globalThis, 'Audio') })
  const failures: string[] = []
  assert.deepEqual(await speakLong('Original text.', { src: 'audio/original/example.mp3', rate: 0.85, onError: (reason) => failures.push(reason) }), { ok: true })
  assert.equal(instances[0].playbackRate, 0.85)
  assert.equal(synthesis.queue.length, 0)
  instances[0].onerror?.()
  assert.deepEqual(failures, ['audio-error'])
  assert.deepEqual(await speak('Again.', { src: 'audio/original/example.mp3' }), { ok: true })
  stopSpeaking()
  assert.equal(instances[1].paused, true)
  assert.equal(instances[1].onended, null)
})
