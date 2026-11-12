import { useEffect, useRef, useState } from 'react'
import { CetDraftConflict, saveCetPaperStudy } from '../core/cetPapers'
import { outputRevisionEqual } from '../core/outputRevision'
import type { CetPaperStudy } from '../types/cetPaper'

export type CetPaperDraft = Pick<CetPaperStudy, 'variant' | 'answers' | 'answerKey' | 'writingDraft' | 'translationDraft' | 'writingRevision' | 'translationRevision' | 'notes'>
const textFields = ['variant', 'writingDraft', 'translationDraft', 'notes'] as const
const revisionFields = ['writingRevision', 'translationRevision'] as const
const arrayEqual = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index])

/** Own all nested values so saved snapshots cannot change underneath an edit. */
export function cetDraftOf(study: CetPaperStudy): CetPaperDraft {
  return structuredClone({ variant: study.variant, answers: study.answers, answerKey: study.answerKey,
    writingDraft: study.writingDraft, translationDraft: study.translationDraft,
    writingRevision: study.writingRevision, translationRevision: study.translationRevision, notes: study.notes })
}

/** Only changed fields participate in the per-field compare-and-swap. */
export function cetDraftPatch(base: CetPaperDraft, current: CetPaperDraft): Partial<CetPaperDraft> {
  const patch: Partial<CetPaperDraft> = {}
  for (const key of textFields) if (current[key] !== base[key]) patch[key] = current[key]
  for (const key of ['answers', 'answerKey'] as const) if (!arrayEqual(current[key], base[key])) patch[key] = current[key]
  for (const key of revisionFields) if (!outputRevisionEqual(current[key], base[key])) patch[key] = current[key]
  return structuredClone(patch)
}

/** Preserve edits made since a snapshot, accepting unrelated changes from storage. */
export function mergePendingCetDraft(fresh: CetPaperDraft, sent: CetPaperDraft, pending: CetPaperDraft): CetPaperDraft {
  const merged = structuredClone(fresh)
  for (const key of textFields) if (pending[key] !== sent[key]) merged[key] = pending[key]
  for (const key of ['answers', 'answerKey'] as const) {
    merged[key] = fresh[key].map((value, index) => pending[key][index] !== sent[key][index] ? pending[key][index] : value)
  }
  for (const key of revisionFields) if (!outputRevisionEqual(pending[key], sent[key])) merged[key] = structuredClone(pending[key])
  return merged
}

export function useCetPaperDraft(initial: CetPaperStudy) {
  const [study, setStudy] = useState(initial)
  const studyRef = useRef(initial)
  const [draft, setDraft] = useState(() => cetDraftOf(initial))
  const draftRef = useRef(draft)
  const baseRef = useRef(cetDraftOf(initial))
  const conflictRef = useRef<CetPaperStudy | null>(null)
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)
  const savedRevision = useRef(0)
  const queue = useRef(Promise.resolve(initial))
  const mounted = useRef(true)
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  function update(patch: Partial<CetPaperDraft>) {
    draftRef.current = { ...draftRef.current, ...patch }
    setDraft(draftRef.current)
    revisionRef.current += 1
    setRevision(revisionRef.current); setSaveState(conflictRef.current ? 'error' : 'dirty')
  }

  function persist(): Promise<CetPaperStudy> {
    const work = queue.current.catch(() => studyRef.current).then(async () => {
      if (conflictRef.current) throw new CetDraftConflict(conflictRef.current)
      const target = revisionRef.current
      if (target <= savedRevision.current) return studyRef.current
      const sent = structuredClone(draftRef.current)
      const patch = cetDraftPatch(baseRef.current, sent)
      if (!Object.keys(patch).length) {
        savedRevision.current = target
        if (mounted.current) { setSaveState('saved'); setError('') }
        return studyRef.current
      }
      if (mounted.current) setSaveState('saving')
      const saved = await saveCetPaperStudy(initial.id, patch, undefined, baseRef.current)
      const fresh = cetDraftOf(saved)
      // Keep keystrokes made while the write was in flight, incorporating other tabs elsewhere.
      draftRef.current = mergePendingCetDraft(fresh, sent, draftRef.current)
      baseRef.current = fresh
      studyRef.current = saved; savedRevision.current = target
      if (mounted.current) { setDraft(draftRef.current); setStudy(saved); setSaveState(target === revisionRef.current ? 'saved' : 'dirty'); setError('') }
      return saved
    })
    queue.current = work
    return work.catch((cause: unknown) => {
      if (cause instanceof CetDraftConflict) { conflictRef.current = cause.current; if (mounted.current) setConflict(true) }
      if (mounted.current) { setSaveState('error'); setError(cause instanceof Error ? cause.message : '保存失败，请重试，当前输入仍保留') }
      throw cause
    })
  }

  function resolveConflict(keepLocal: boolean) {
    const remote = conflictRef.current
    if (!remote || lock.current) return
    const fresh = cetDraftOf(remote)
    const base = baseRef.current
    const local = draftRef.current
    draftRef.current = keepLocal ? mergePendingCetDraft(fresh, base, local) : fresh
    baseRef.current = fresh; studyRef.current = remote; conflictRef.current = null
    setConflict(false); setDraft(draftRef.current); setStudy(remote)
    revisionRef.current++; setRevision(revisionRef.current)
    setError(''); setSaveState('dirty')
    void persist().catch(() => undefined)
  }

  async function action(run: () => Promise<CetPaperStudy | void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await persist()
      const beforeAction = cetDraftOf(studyRef.current)
      const saved = await run()
      if (saved) {
        const fresh = cetDraftOf(saved)
        draftRef.current = mergePendingCetDraft(fresh, beforeAction, draftRef.current)
        baseRef.current = fresh; studyRef.current = saved
        if (mounted.current) { setStudy(saved); setDraft(draftRef.current) }
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '操作未完成，请重试') }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }

  useEffect(() => {
    mounted.current = true
    const protect = (event: BeforeUnloadEvent) => { if (revisionRef.current > savedRevision.current) { event.preventDefault(); event.returnValue = '' } }
    const flush = () => { if (revisionRef.current > savedRevision.current && !conflictRef.current) void persist().catch(() => undefined) }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', protect)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => { mounted.current = false; flush(); window.removeEventListener('beforeunload', protect); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden) }
  }, [])
  useEffect(() => {
    if (!revision || conflictRef.current) return
    const timer = window.setTimeout(() => { void persist().catch(() => undefined) }, 650)
    return () => window.clearTimeout(timer)
  }, [revision])
  const choose = (number: number, answer: string) => update({ answers: draftRef.current.answers.map((v, i) => i === number - 1 ? answer : v) })
  return { study, draft, update, choose, action, saveState, error, busy, conflict, resolveConflict }
}
