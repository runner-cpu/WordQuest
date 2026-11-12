import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyOutputRevision, editOutputRevision, invalidateInitialChecks, isOutputRevision, mapReferenceToDraft,
  mergeOutputRevisions, outputRevisionEqual, OUTPUT_REASONS, setOutputChecks, splitOutputParagraphs, splitReferenceSentences } from '../src/core/outputRevision.ts'

test('output revisions store eight distinct manual reasons and strictly validate checks and snapshots', () => {
  const revision = emptyOutputRevision(100)
  assert.equal(isOutputRevision(revision), true)
  assert.equal(OUTPUT_REASONS.length, 8)
  assert.equal(new Set(OUTPUT_REASONS.map((reason) => reason.id)).size, 8)
  for (const patch of [
    { reasons: ['score'] }, { reasons: ['tense', 'tense'] }, { initialChecks: [false, false] },
    { revisionChecks: [true, true, true] }, { updatedAt: -1 }, { updatedAt: NaN },
    { text: 123 }, { initialChecks: [true, true, true] }, { revisionChecks: Array(3) },
  ]) assert.equal(isOutputRevision({ ...revision, ...patch }), false)
})

test('editing a revision invalidates only its own completed self-check and preserves the initial version', () => {
  const initial = setOutputChecks(emptyOutputRevision(100), 'initial', 'Original initial draft.', [true, true, true], 101)
  const written = editOutputRevision(initial, { text: 'Revised text.', reasons: ['agreement'] }, 102)
  const checked = setOutputChecks(written, 'revision', written.text, [true, true, true], 103)
  const edited = editOutputRevision(checked, { text: 'Revised text with another edit.' }, 104)
  assert.equal(edited.initialCheckedText, 'Original initial draft.')
  assert.deepEqual(edited.initialChecks, [true, true, true])
  assert.deepEqual(edited.revisionChecks, [false, false, false])
  assert.equal(edited.revisionCheckedText, undefined)
  assert.equal(checked.text, 'Revised text.')
  assert.deepEqual(edited.reasons, ['agreement'])
  assert.equal(isOutputRevision(edited), true)
  const initialEdited = invalidateInitialChecks(edited, 'Edited initial draft.', 105)
  assert.deepEqual(initialEdited.initialChecks, [false, false, false])
  assert.equal(initialEdited.initialCheckedText, undefined)
  assert.equal(initialEdited.text, edited.text)
})

test('partial self-checks also reset after typing and revised snapshots cannot certify another text', () => {
  const partial = setOutputChecks(emptyOutputRevision(10), 'initial', 'Draft.', [true, false, false], 11)
  const edited = invalidateInitialChecks(partial, 'New draft.', 12)
  assert.deepEqual(edited.initialChecks, [false, false, false])
  assert.throws(() => setOutputChecks(edited, 'revision', 'Not the revision text.', [true, true, true], 13))
})

test('revision equality compares nested values and merge uses its own time even across newer parent drafts', () => {
  const first = editOutputRevision(emptyOutputRevision(100), { text: 'Revision.', reasons: ['omission'] }, 101)
  assert.equal(outputRevisionEqual(first, structuredClone(first)), true)
  assert.equal(outputRevisionEqual(first, undefined), false)
  assert.equal(outputRevisionEqual(undefined, undefined), true)
  const newer = editOutputRevision(first, { text: 'A newer revision.' }, 200)
  assert.deepEqual(mergeOutputRevisions(newer, first), newer)
  assert.deepEqual(mergeOutputRevisions(newer, undefined), newer)
  assert.deepEqual(mergeOutputRevisions(undefined, newer), newer)
  const copied = mergeOutputRevisions(first, newer)!
  copied.reasons.push('spelling')
  assert.deepEqual(newer.reasons, ['omission'])
})

test('reference selection only maps paragraph positions and reports absent or ambiguous targets', () => {
  const reference = 'First reference sentence. Another sentence.\n\nSecond paragraph.'
  assert.deepEqual(splitReferenceSentences(reference), ['First reference sentence.', 'Another sentence.', 'Second paragraph.'])
  const match = mapReferenceToDraft(reference, 'My first paragraph.\n\nMy second paragraph.', 2)
  assert.equal(match.status, 'position')
  assert.equal(match.paragraphIndex, 1)
  assert.equal(match.paragraphText, 'My second paragraph.')
  assert.match(match.message, /顺序|位置/)
  const fallback = mapReferenceToDraft(reference, 'Only one paragraph.', 2)
  assert.equal(fallback.status, 'fallback')
  assert.equal(fallback.paragraphIndex, null)
  assert.equal(mapReferenceToDraft('', 'Draft.', 0).status, 'fallback')
  assert.equal(mapReferenceToDraft('Reference.', '', 0).status, 'fallback')
  assert.equal(mapReferenceToDraft('Reference.', 'Draft.', 10).status, 'fallback')
})

test('PDF soft line wraps stay within complete reference sentences and paragraph positions', () => {
  const reference = 'With the rapid development, we see\nan increasing number of readers. They visit\nthe library.\n\nAnother paragraph\ncontinues here.'
  assert.deepEqual(splitOutputParagraphs(reference), [
    'With the rapid development, we see an increasing number of readers. They visit the library.',
    'Another paragraph continues here.',
  ])
  assert.deepEqual(splitReferenceSentences(reference), [
    'With the rapid development, we see an increasing number of readers.',
    'They visit the library.', 'Another paragraph continues here.',
  ])
  const target = mapReferenceToDraft(reference, 'My first\nwrapped paragraph.\n\nMy second paragraph.', 2)
  assert.equal(target.paragraphIndex, 1)
  assert.equal(target.paragraphText, 'My second paragraph.')
})
