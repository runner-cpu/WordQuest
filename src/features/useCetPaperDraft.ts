import { useEffect, useRef, useState } from 'react'
import { CetDraftConflict, saveCetPaperStudy } from '../core/cetPapers'
import type { CetPaperStudy } from '../types/cetPaper'

type Draft = Pick<CetPaperStudy, 'answers' | 'writingDraft' | 'translationDraft' | 'notes'>
const draftOf = (study: CetPaperStudy): Draft => ({ answers: [...study.answers], writingDraft: study.writingDraft, translationDraft: study.translationDraft, notes: study.notes })

export function useCetPaperDraft(initial: CetPaperStudy) {
  const [study, setStudy] = useState(initial)
  const studyRef = useRef(initial)
  const [draft, setDraft] = useState(() => draftOf(initial))
  const draftRef = useRef(draft)
  const baseRef = useRef(draftOf(initial))
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

  function update(patch: Partial<Draft>) {
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
      const patch = structuredClone(draftRef.current)
      if (mounted.current) setSaveState('saving')
      const saved = await saveCetPaperStudy(initial.id, patch, undefined, baseRef.current)
      const fresh = draftOf(saved)
      const pending = draftRef.current
      // Keep keystrokes made while the write was in flight, incorporating other tabs elsewhere.
      draftRef.current = {
        answers: fresh.answers.map((answer, i) => pending.answers[i] !== patch.answers[i] ? pending.answers[i] : answer),
        writingDraft: pending.writingDraft !== patch.writingDraft ? pending.writingDraft : fresh.writingDraft,
        translationDraft: pending.translationDraft !== patch.translationDraft ? pending.translationDraft : fresh.translationDraft,
        notes: pending.notes !== patch.notes ? pending.notes : fresh.notes,
      }
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
    const fresh = draftOf(remote)
    const base = baseRef.current
    const local = draftRef.current
    draftRef.current = keepLocal ? {
      answers: fresh.answers.map((answer, i) => local.answers[i] !== base.answers[i] ? local.answers[i] : answer),
      writingDraft: local.writingDraft !== base.writingDraft ? local.writingDraft : fresh.writingDraft,
      translationDraft: local.translationDraft !== base.translationDraft ? local.translationDraft : fresh.translationDraft,
      notes: local.notes !== base.notes ? local.notes : fresh.notes,
    } : fresh
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
      const saved = await run()
      if (saved) { studyRef.current = saved; if (mounted.current) setStudy(saved) }
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
