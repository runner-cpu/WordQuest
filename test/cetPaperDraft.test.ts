import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cetDraftOf, cetDraftPatch, mergePendingCetDraft } from '../src/features/useCetPaperDraft.ts'
import type { CetPaperStudy, OutputRevision } from '../src/types/cetPaper.ts'

const revision = (text: string, updatedAt = 1): OutputRevision => ({ text, reasons: [], initialChecks: [false, false, false], revisionChecks: [false, false, false], updatedAt })
const study = (): CetPaperStudy => ({ id: 'draft-fixture', sourceId: 'fixture', variant: '1', createdAt: 1, updatedAt: 1,
  answers: ['', ''], answerKey: ['', ''], writingDraft: 'My initial writing.', translationDraft: 'My initial translation.',
  writingRevision: revision('My revised writing.'), translationRevision: revision('My revised translation.'), notes: 'Original note.', elapsedSeconds: 0, files: {},
})

test('paper draft snapshots own their revision objects and retain legacy drafts without creating new versions', () => {
  const source = study()
  const draft = cetDraftOf(source)
  draft.answers[0] = 'A'
  draft.writingRevision!.initialChecks[0] = true
  assert.equal(source.answers[0], '')
  assert.equal(source.writingRevision!.initialChecks[0], false)
  const legacy = study()
  delete legacy.writingRevision
  delete legacy.translationRevision
  const snapshot = cetDraftOf(legacy)
  assert.equal(snapshot.writingDraft, 'My initial writing.')
  assert.equal(snapshot.writingRevision, undefined)
  assert.equal(snapshot.translationRevision, undefined)
})

test('paper draft save patches compare revision values deeply and omit unrelated version fields', () => {
  const base = cetDraftOf(study())
  const equal = structuredClone(base)
  assert.deepEqual(cetDraftPatch(base, equal), {})
  equal.writingRevision = { ...equal.writingRevision!, revisionChecks: [true, false, false], revisionCheckedText: equal.writingRevision!.text, updatedAt: 2 }
  const patch = cetDraftPatch(base, equal)
  assert.deepEqual(Object.keys(patch), ['writingRevision'])
  assert.equal(patch.writingRevision!.revisionChecks[0], true)
  assert.equal('translationRevision' in patch, false)
  assert.equal('writingDraft' in patch, false)
})

test('in-flight save reconciliation keeps subsequent revision typing and incorporates remote unrelated edits', () => {
  const sent = cetDraftOf(study())
  const pending = structuredClone(sent)
  pending.writingRevision = revision('Typed while saving.', 3)
  pending.answers[0] = 'A'
  const saved = structuredClone(sent)
  saved.writingRevision = { ...saved.writingRevision!, updatedAt: 2 }
  saved.translationRevision = revision('Remote translation revision.', 2)
  saved.notes = 'Remote note.'
  saved.answers[1] = 'B'
  const merged = mergePendingCetDraft(saved, sent, pending)
  assert.equal(merged.writingRevision!.text, 'Typed while saving.')
  assert.equal(merged.translationRevision!.text, 'Remote translation revision.')
  assert.equal(merged.notes, 'Remote note.')
  assert.deepEqual(merged.answers, ['A', 'B'])
  assert.equal(merged.writingDraft, 'My initial writing.')
  merged.writingRevision!.revisionChecks[0] = true
  assert.equal(pending.writingRevision!.revisionChecks[0], false)
})

test('conflict keep-local reconciliation preserves the chosen section and the remote versions in other sections', () => {
  const base = cetDraftOf(study())
  const local = structuredClone(base)
  local.writingDraft = 'Locally edited initial.'
  local.writingRevision = revision('Locally edited revision.', 3)
  const remote = structuredClone(base)
  remote.writingDraft = 'Conflicting remote initial.'
  remote.writingRevision = revision('Conflicting remote revision.', 4)
  remote.translationDraft = 'Remote translation.'
  remote.translationRevision = revision('Remote translation revision.', 4)
  const kept = mergePendingCetDraft(remote, base, local)
  assert.equal(kept.writingDraft, local.writingDraft)
  assert.equal(kept.writingRevision!.text, local.writingRevision.text)
  assert.equal(kept.translationDraft, remote.translationDraft)
  assert.equal(kept.translationRevision!.text, remote.translationRevision.text)
  assert.equal(cetDraftPatch(remote, kept).translationRevision, undefined)
})

test('saved revision timestamps replace the sent snapshot when no new edits occurred', () => {
  const sent = cetDraftOf(study())
  const fresh = structuredClone(sent)
  fresh.writingRevision!.updatedAt = 5
  const result = mergePendingCetDraft(fresh, sent, structuredClone(sent))
  assert.equal(result.writingRevision!.updatedAt, 5)
  assert.deepEqual(cetDraftPatch(fresh, result), {})
})

test('archive answer keys reconcile by question while variant and revision saves stay independent', () => {
  const sent = cetDraftOf(study())
  const pending = structuredClone(sent)
  pending.variant = 'My archive edition'
  pending.answerKey[0] = 'A'
  const fresh = structuredClone(sent)
  fresh.answerKey[1] = 'B'
  fresh.translationRevision = revision('Remote archived revision.', 6)
  const merged = mergePendingCetDraft(fresh, sent, pending)
  assert.equal(merged.variant, 'My archive edition')
  assert.deepEqual(merged.answerKey, ['A', 'B'])
  assert.equal(merged.translationRevision!.text, 'Remote archived revision.')
  assert.deepEqual(Object.keys(cetDraftPatch(fresh, merged)), ['variant', 'answerKey'])
})
