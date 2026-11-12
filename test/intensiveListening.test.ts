import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  estimateTimeline, groupLoop, loopSeek, normalizeLoop, playbackRate,
  resolveListeningTimeline, splitListeningSentences,
} from '../src/core/intensiveListening.ts'
import timelineIndex from '../src/data/originalTimelines.json'
import originalAudio from '../src/data/originalAudio.json'
import papers from '../src/data/cetReadyPapers.json'

test('intensive listening splits dialogue, keeps punctuation and avoids decimal/title boundaries', () => {
  assert.deepEqual(splitListeningSentences('  M: Dr. Reed paid $3.50.\nW: Really? Yes!  '), [
    'M: Dr. Reed paid $3.50.', 'W: Really?', 'Yes!',
  ])
  assert.deepEqual(splitListeningSentences('The U.S. office opens at 9 a.m. every day. “Come in!”\nNext turn'), [
    'The U.S. office opens at 9 a.m. every day.', '“Come in!”', 'Next turn',
  ])
  assert.deepEqual(splitListeningSentences('你好。准备好了吗？开始！'), ['你好。', '准备好了吗？', '开始！'])
  assert.deepEqual(splitListeningSentences(' \n\t '), [])
})

test('estimated sentence timelines use loaded duration and word proportions without gaps or drift', () => {
  assert.deepEqual(estimateTimeline('Hi. A longer sentence here.', 10), [
    { text: 'Hi.', start: 0, end: 2 },
    { text: 'A longer sentence here.', start: 2, end: 10 },
  ])
  const segments = estimateTimeline(['One.', 'Two words.', 'Three more words.'], 7.137)
  assert.equal(segments[0].start, 0)
  assert.equal(segments.at(-1)!.end, 7.137)
  for (const [index, segment] of segments.entries()) {
    assert.ok(segment.end > segment.start)
    if (index) assert.equal(segment.start, segments[index - 1].end)
  }
  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(estimateTimeline('A sentence.', duration), [])
  assert.deepEqual(estimateTimeline('', 30), [])
})

test('AB loop marks reorder and clamp while missing or invalid bounds never create a loop', () => {
  assert.deepEqual(normalizeLoop(9, 3, 10), { start: 3, end: 9 })
  assert.deepEqual(normalizeLoop(-5, 15, 10), { start: 0, end: 10 })
  assert.deepEqual(normalizeLoop(0, 0.2, 10), { start: 0, end: 0.2 })
  for (const [a, b, duration] of [[1, 1, 10], [12, 15, 10], [null, 5, 10], [2, undefined, 10], [2, 5, 0], [Number.NaN, 5, 10], [2, Number.POSITIVE_INFINITY, 10], [2, 5, Number.NaN]]) {
    assert.equal(normalizeLoop(a, b, duration!), null)
  }
})

test('playback rate stays within the supported practice range and defaults invalid values to normal', () => {
  assert.equal(playbackRate(0.25), 0.5)
  assert.equal(playbackRate(3), 2)
  assert.equal(playbackRate(1.25), 1.25)
  assert.equal(playbackRate(Number.NaN), 1)
  assert.equal(playbackRate(Number.POSITIVE_INFINITY), 1)
})

test('CET group loops require both verified source bounds and clamp at media duration', () => {
  assert.deepEqual(groupLoop({ startSeconds: 0, endSeconds: 40 }, 100), { start: 0, end: 40 })
  assert.deepEqual(groupLoop({ startSeconds: 30, endSeconds: 120 }, 100), { start: 30, end: 100 })
  assert.equal(groupLoop({ startSeconds: 0 }, 100), null)
  assert.equal(groupLoop({ endSeconds: 40 }, 100), null)
  assert.equal(groupLoop({ startSeconds: 40, endSeconds: 30 }, 100), null)
  assert.equal(groupLoop({ startSeconds: -2, endSeconds: 30 }, 100), null)
  assert.equal(groupLoop({ startSeconds: 100, endSeconds: 120 }, 100), null)
  assert.equal(groupLoop({ startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY }, 100), null)
  assert.equal(groupLoop({ startSeconds: 0, endSeconds: 40 }, Number.NaN), null)
})

test('loop seeking returns to A at B or after an outside seek and stays idle inside the interval', () => {
  const loop = { start: 5, end: 10 }
  assert.equal(loopSeek(4, loop), 5)
  assert.equal(loopSeek(5, loop), null)
  assert.equal(loopSeek(9.999, loop), null)
  assert.equal(loopSeek(10, loop), 5)
  assert.equal(loopSeek(20, loop), 5)
  assert.equal(loopSeek(12, null), null)
  assert.equal(loopSeek(Number.NaN, loop), null)
  assert.equal(loopSeek(12, { start: 10, end: 5 }), null)
})

test('manual original timeline overrides need verification, matching text and valid media bounds', () => {
  const path = originalAudio.entries[0].path
  const segments = [{ text: 'One.', start: 0.2, end: 2 }, { text: 'Two words.', start: 2.1, end: 5 }]
  const verified = { verified: true, sourceNote: 'Fixture reviewed against its recording.', segments }
  assert.deepEqual(resolveListeningTimeline(path, 'One. Two words.', 6, { [path]: verified }), { segments, estimated: false })
  const fallback = { segments: estimateTimeline('One. Two words.', 6), estimated: true }
  for (const invalid of [
    { ...verified, verified: false },
    { ...verified, sourceNote: '' },
    { ...verified, segments: [{ text: 'Stale script.', start: 0, end: 3 }] },
    { ...verified, segments: [segments[0], { ...segments[1], start: 1 }] },
    { ...verified, segments: [segments[0], { ...segments[1], end: 7 }] },
    { ...verified, segments: [segments[0], { ...segments[1], end: Number.NaN }] },
  ]) assert.deepEqual(resolveListeningTimeline(path, 'One. Two words.', 6, { [path]: invalid }), fallback)
  assert.deepEqual(resolveListeningTimeline(undefined, 'One. Two words.', 6), fallback)
  assert.deepEqual(resolveListeningTimeline(path, 'One. Two words.', Number.NaN, { [path]: verified }), { segments: [], estimated: true })
})

test('editable timeline index contains only explicitly verified overrides tied to shipped recording paths', () => {
  assert.equal(timelineIndex.schemaVersion, 1)
  assert.equal(timelineIndex.unit, 'seconds')
  const paths = new Set(originalAudio.entries.map((entry) => entry.path))
  for (const [path, override] of Object.entries(timelineIndex.overrides) as [string, { verified: boolean; sourceNote: string; segments: { text: string; start: number; end: number }[] }][]) {
    assert.ok(paths.has(path))
    assert.equal(override.verified, true)
    assert.ok(override.sourceNote.trim())
    assert.ok(override.segments.length > 0)
  }
})

test('missing CET location document traces all 14 absent starts and the two start-only ranges', async () => {
  const document = await readFile(new URL('../docs/listening-location-todo.md', import.meta.url), 'utf8')
  let groups = 0
  let missingStarts = 0
  let incompleteLoops = 0
  for (const entry of papers) {
    const paper = JSON.parse(await readFile(new URL(`../public/${entry.path}`, import.meta.url), 'utf8')) as {
      listening: { startSeconds?: number; endSeconds?: number; questions: { number: number }[] }[]
    }
    for (const [index, group] of paper.listening.entries()) {
      groups++
      if (group.startSeconds === undefined) {
        missingStarts++
        assert.ok(document.includes(`${entry.sourceId} | ${index + 1} | ${group.questions.map((question) => question.number).join(',')} |`), `${entry.sourceId} group ${index + 1} is listed`)
      }
      if (group.startSeconds === undefined || group.endSeconds === undefined) incompleteLoops++
    }
  }
  assert.equal(groups, 76)
  assert.equal(missingStarts, 14)
  assert.equal(incompleteLoops, 16)
  assert.match(document, /4222c1c11c62fb7c/)
  assert.match(document, /08832b252e234814/)
})
