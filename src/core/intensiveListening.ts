import timelineIndex from '../data/originalTimelines.json'

export interface ListeningTimelineSegment { text: string; start: number; end: number }
export interface ListeningLoop { start: number; end: number }
export interface ListeningTimeline { segments: ListeningTimelineSegment[]; estimated: boolean }

const positiveDuration = (duration: number): boolean => Number.isFinite(duration) && duration > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const normalizedText = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Keep common English titles, initials and decimals together; line breaks also end dialogue turns. */
export function splitListeningSentences(text: string): string[] {
  const sentences: string[] = []
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = normalizedText(rawLine)
    let start = 0
    for (let index = 0; index < line.length; index++) {
      const punctuation = line[index]
      if (!/[.!?。！？]/.test(punctuation)) continue
      if (punctuation === '.' && /\d/.test(line[index - 1] ?? '') && /\d/.test(line[index + 1] ?? '')) continue
      let end = index + 1
      while (end < line.length && /[.!?。！？"'”’）)\]]/.test(line[end])) end++
      if (punctuation === '.') {
        if (end < line.length && !/\s/.test(line[end])) continue
        const token = line.slice(0, index + 1).match(/([A-Za-z][A-Za-z.]*\.)$/)?.[1] ?? ''
        const next = line.slice(end).trimStart()
        if (/^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|No)\.$/i.test(token)) continue
        if (/^(?:[A-Za-z]\.){2,}$/.test(token) && /^[a-z]/.test(next)) continue
        if (/^[A-Z]\.$/.test(token) && /^[A-Z][a-z]/.test(next)) continue
      }
      const sentence = line.slice(start, end).trim()
      if (sentence) sentences.push(sentence)
      start = end
      index = end - 1
    }
    const remainder = line.slice(start).trim()
    if (remainder) sentences.push(remainder)
  }
  return sentences
}

/** Approximate seek points only. The complete recording's actual duration must come from loaded media. */
export function estimateTimeline(text: string | readonly string[], duration: number): ListeningTimelineSegment[] {
  if (!positiveDuration(duration)) return []
  const sentences = typeof text === 'string' ? splitListeningSentences(text) : text.map(normalizedText).filter(Boolean)
  const weights = sentences.map((sentence) => Math.max(1, sentence.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[\u3400-\u9fff]/g)?.length ?? 0))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let elapsed = 0
  return sentences.map((sentence, index) => {
    const start = elapsed / total * duration
    elapsed += weights[index]
    return { text: sentence, start, end: index === sentences.length - 1 ? duration : elapsed / total * duration }
  })
}

/** AB marks are user-selected, so reversing them is safe; missing metadata never creates an interval. */
export function normalizeLoop(a: number | null | undefined, b: number | null | undefined, duration: number): ListeningLoop | null {
  if (!finite(a) || !finite(b) || !positiveDuration(duration)) return null
  const start = Math.max(0, Math.min(duration, Math.min(a, b)))
  const end = Math.max(0, Math.min(duration, Math.max(a, b)))
  return end > start ? { start, end } : null
}

export function playbackRate(value: number): number {
  return Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : 1
}

/** Source intervals must already be ordered and complete; do not infer a group's end from the next group. */
export function groupLoop(group: { startSeconds?: number; endSeconds?: number }, duration: number): ListeningLoop | null {
  const { startSeconds, endSeconds } = group
  if (!finite(startSeconds) || !finite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) return null
  return normalizeLoop(startSeconds, endSeconds, duration)
}

/** Return the next seek only when playback leaves the active [A, B) interval. */
export function loopSeek(time: number, loop: ListeningLoop | null | undefined): number | null {
  if (!finite(time) || !loop || !finite(loop.start) || !finite(loop.end) || loop.start < 0 || loop.end <= loop.start) return null
  return time < loop.start || time >= loop.end ? loop.start : null
}

/** A manual override is accepted only after explicit review, text matching and runtime media bounds checks. */
export function resolveListeningTimeline(
  path: string | undefined,
  text: string,
  duration: number,
  overrides: Readonly<Record<string, unknown>> = timelineIndex.overrides,
): ListeningTimeline {
  const fallback = (): ListeningTimeline => ({ segments: estimateTimeline(text, duration), estimated: true })
  if (!path || !/^audio\/original\/[a-f0-9]{20}\.mp3$/.test(path) || !positiveDuration(duration)) return fallback()
  const override = overrides[path]
  if (!record(override) || override.verified !== true || typeof override.sourceNote !== 'string' || !override.sourceNote.trim() || !Array.isArray(override.segments)) return fallback()
  const sentences = splitListeningSentences(text)
  if (!sentences.length || override.segments.length !== sentences.length) return fallback()
  const segments: ListeningTimelineSegment[] = []
  let previousEnd = 0
  for (const [index, segment] of override.segments.entries()) {
    if (!record(segment) || segment.text !== sentences[index] || !finite(segment.start) || !finite(segment.end) || segment.start < previousEnd || segment.end <= segment.start || segment.end > duration) return fallback()
    segments.push({ text: segment.text as string, start: segment.start, end: segment.end })
    previousEnd = segment.end
  }
  return { segments, estimated: false }
}
