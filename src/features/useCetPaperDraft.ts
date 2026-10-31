import { useEffect, useRef, useState } from 'react'
import { saveCetPaperStudy } from '../core/cetPapers'
import type { CetPaperStudy } from '../types/cetPaper'

type Draft = Pick<CetPaperStudy, 'answers' | 'writingDraft' | 'translationDraft' | 'notes'>
const draftOf = (study: CetPaperStudy): Draft => ({ answers: [...study.answers], writingDraft: study.writingDraft, translationDraft: study.translationDraft, notes: study.notes })

export function useCetPaperDraft(initial: CetPaperStudy) {
  const [study, setStudy] = useState(initial)
  const studyRef = useRef(initial)
  const [draft, setDraft] = useState(() => draftOf(initial))
  const draftRef = useRef(draft)
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)
  const savedRevision = useRef(0)
  const editedAt = useRef(initial.updatedAt)
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
    editedAt.current = Math.max(Date.now(), editedAt.current + 1, studyRef.current.updatedAt + 1)
    setRevision(revisionRef.current); setSaveState('dirty')
  }

  function persist(): Promise<CetPaperStudy> {
    const target = revisionRef.current
    const patch = structuredClone(draftRef.current)
    const editTime = editedAt.current
    const work = queue.current.catch(() => studyRef.current).then(async () => {
      if (target <= savedRevision.current) return studyRef.current
      if (mounted.current) setSaveState('saving')
      const saved = await saveCetPaperStudy(initial.id, patch, Math.max(editTime, studyRef.current.updatedAt + 1))
      if (!Object.entries(patch).every(([key, value]) => JSON.stringify(saved[key as keyof Draft]) === JSON.stringify(value))) {
        studyRef.current = saved
        throw new Error('档案在另一处有更新，当前输入仍保留，请重新保存')
      }
      studyRef.current = saved; savedRevision.current = target
      if (mounted.current) { setStudy(saved); setSaveState(target === revisionRef.current ? 'saved' : 'dirty'); setError('') }
      return saved
    })
    queue.current = work
    return work.catch((cause: unknown) => {
      if (mounted.current) { setSaveState('error'); setError(cause instanceof Error ? cause.message : '保存失败，请重试，当前输入仍保留') }
      throw cause
    })
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
    const protect = (event: BeforeUnloadEvent) => { if (revisionRef.current > savedRevision.current) event.preventDefault() }
    window.addEventListener('beforeunload', protect)
    return () => { mounted.current = false; window.removeEventListener('beforeunload', protect) }
  }, [])
  useEffect(() => {
    if (!revision) return
    const timer = window.setTimeout(() => { void persist().catch(() => undefined) }, 650)
    return () => window.clearTimeout(timer)
  }, [revision])
  const choose = (number: number, answer: string) => update({ answers: draftRef.current.answers.map((v, i) => i === number - 1 ? answer : v) })
  return { study, draft, update, choose, action, saveState, error, busy }
}
