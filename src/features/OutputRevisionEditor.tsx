import { useId, useMemo, useState } from 'react'
import { countCetEnglishWords } from '../core/cetPractice'
import { editOutputRevision, emptyOutputRevision, invalidateInitialChecks, mapReferenceToDraft, OUTPUT_REASONS, setOutputChecks, splitOutputParagraphs, splitReferenceSentences } from '../core/outputRevision'
import type { OutputRevision } from '../types/outputRevision'
import { PixelButton } from '../ui/Pixel'

export interface OutputRevisionEditorProps {
  initialText: string
  onInitialChange: (text: string) => void
  revision?: OutputRevision
  onRevisionChange: (revision: OutputRevision) => void
  initialLabel: string
  revisionLabel: string
  reference: string | readonly string[]
  kind: 'writing' | 'translation'
  disabled?: boolean
  checklist?: readonly string[]
  checksEnabled?: boolean
  referenceTitle?: string
  referenceExpanded?: boolean
  checksExpanded?: boolean
  showReference?: boolean
}

/** Two saved versions, with text-bound self-checks and explicitly positional reference cues. */
export function OutputRevisionEditor({
  initialText, onInitialChange, revision, onRevisionChange, initialLabel, revisionLabel,
  reference, kind, disabled = false, checklist, checksEnabled = true,
  referenceTitle = '参考句与草稿对照', referenceExpanded = false,
  checksExpanded = false, showReference = true,
}: OutputRevisionEditorProps) {
  const id = useId()
  const [version, setVersion] = useState<'initial' | 'revision'>('initial')
  const [selectedReference, setSelectedReference] = useState<number | null>(null)
  const [manualParagraph, setManualParagraph] = useState<number | null>(null)
  const value = revision ?? emptyOutputRevision()
  const text = version === 'initial' ? initialText : value.text
  const label = version === 'initial' ? initialLabel : revisionLabel
  const versionLabel = version === 'initial' ? '初稿' : '修订稿'
  const storedChecks = version === 'initial' ? value.initialChecks : value.revisionChecks
  const checkedText = version === 'initial' ? value.initialCheckedText : value.revisionCheckedText
  const checks = checkedText !== undefined && checkedText !== text ? [false, false, false] : storedChecks
  const complete = text.trim().length > 0 && checks.every(Boolean) && checkedText === text
  const referenceText = typeof reference === 'string' ? reference : reference.join('\n\n')
  const referenceSentences = useMemo(() => splitReferenceSentences(referenceText), [referenceText])
  const paragraphs = useMemo(() => splitOutputParagraphs(text), [text])
  const mapping = selectedReference == null ? null : mapReferenceToDraft(referenceText, text, selectedReference)
  const highlight = manualParagraph ?? mapping?.paragraphIndex ?? null
  const checkLabels = checklist?.length === 3 ? checklist : kind === 'writing'
    ? ['内容覆盖题目要求', '结构与衔接已核对', '语法与拼写已核对']
    : ['原文要点与细节已核对', '时态与句子结构已核对', '词形、拼写与衔接已核对']

  function edit(text: string) {
    if (version === 'initial') {
      onInitialChange(text)
      const next = invalidateInitialChecks(value, text)
      if (next && next !== value) onRevisionChange(next)
    } else onRevisionChange(editOutputRevision(value, { text }))
  }

  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="稿件版本">
      <PixelButton size="sm" aria-pressed={version === 'initial'} variant={version === 'initial' ? 'primary' : 'default'} onClick={() => { setVersion('initial'); setManualParagraph(null) }}>初稿</PixelButton>
      <PixelButton size="sm" aria-pressed={version === 'revision'} variant={version === 'revision' ? 'primary' : 'default'} onClick={() => { setVersion('revision'); setManualParagraph(null) }}>修订稿</PixelButton>
      {version === 'revision' && !value.text && initialText.trim() && <PixelButton size="sm" disabled={disabled} onClick={() => onRevisionChange(editOutputRevision(value, { text: initialText }))}>复制初稿开始修订</PixelButton>}
    </div>
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${id}-draft`} className="readable text-[16px] font-semibold text-bright">{label}</label>
        <span id={`${id}-count`} className="readable text-[16px] text-dim tnum">{countCetEnglishWords(text)} 个英文词</span>
      </div>
      <textarea id={`${id}-draft`} className="pixel-input readable min-h-64 w-full p-3 !text-[17px] leading-relaxed" value={text} onChange={(event) => edit(event.target.value)} disabled={disabled} rows={10} lang="en" spellCheck placeholder={version === 'initial' ? '先写自己的英文，草稿会自动保存…' : '在这里修订，初稿会单独保留…'} aria-describedby={`${id}-help ${id}-count`} />
      <p id={`${id}-help`} className="readable mt-2 text-[16px] leading-relaxed text-dim">初稿和修订稿分别保留。修改文字后，这一版的自检会清除，需要重新核对。</p>
    </div>
    <details className="border-t-2 border-edge pt-1" open={checksExpanded || undefined}>
      <summary className="min-h-11 cursor-pointer py-3 text-px12 text-gold">修改原因与逐项自检</summary>
      <fieldset disabled={disabled} className="mt-2">
        <legend className="text-px12 text-bright">修订原因</legend>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="修订原因">{OUTPUT_REASONS.map((reason) => <PixelButton size="sm" key={reason.id} aria-pressed={value.reasons.includes(reason.id)} onClick={() => onRevisionChange(editOutputRevision(value, { reasons: value.reasons.includes(reason.id) ? value.reasons.filter((id) => id !== reason.id) : [...value.reasons, reason.id] }))}>{reason.label}</PixelButton>)}</div>
      </fieldset>
      <fieldset disabled={disabled || !checksEnabled || !text.trim()} className="readable mt-4 text-[16px] leading-relaxed">
        <legend className="font-semibold text-bright">逐项检查{versionLabel}</legend>
        <p className="mt-2 text-dim">勾选记录你对当前文本的自查，不是考试分数。</p>
        {!checksEnabled && <p className="mt-2 text-dim">先完成初稿并打开参考，再逐项核对。</p>}
        <div className="mt-2 space-y-1">{checkLabels.map((item, index) => <label key={index} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-bright"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--wq-pass)]" checked={checks[index]} onChange={(event) => { const next = [...checks]; next[index] = event.target.checked; onRevisionChange(setOutputChecks(value, version, text, next)) }} /><span>{item}</span></label>)}</div>
        <p className={`mt-2 ${complete ? 'text-pass' : 'text-dim'}`} role="status">{complete ? `${versionLabel}三项自检对应当前文本。` : `${versionLabel}已勾选 ${checks.filter(Boolean).length}/3 项。`}</p>
      </fieldset>
    </details>
    {showReference && <details data-output-reference className="border-t-2 border-edge pt-1" open={referenceExpanded || undefined}>
      <summary className="min-h-11 cursor-pointer py-3 text-px12 text-gold">{referenceTitle}</summary>
      <p className="readable mt-2 text-[16px] leading-relaxed text-dim">参考用于学习与修订，表达可以不同。点击参考句只按段落位置近似定位，也可以手动选择草稿段落；不进行语义匹配或自动评分。</p>
      {referenceSentences.length > 0 ? <ol className="mt-3 divide-y-2 divide-edge">{referenceSentences.map((sentence, index) => <li key={index}><button type="button" className={`readable min-h-11 w-full p-3 text-left text-[17px] leading-relaxed ${selectedReference === index ? 'border-l-4 border-gold bg-panel-2 text-bright' : 'text-dim'}`} aria-label={`参考句 ${index + 1}：${sentence}`} aria-pressed={selectedReference === index} onClick={() => { setSelectedReference(index); setManualParagraph(null) }}><span className="mr-2 text-px12 text-gold">{index + 1}</span>{sentence}</button></li>)}</ol> : <p className="readable mt-3 text-[16px] leading-relaxed text-dim">当前资料没有可用参考文本。可按题干手动核对初稿与修订稿。</p>}
      <label className="readable mt-3 block text-[16px] text-bright" htmlFor={`${id}-paragraph`}>手动选择{versionLabel}段落</label>
      <select id={`${id}-paragraph`} className="pixel-input readable mt-2 min-h-11 w-full p-2 !text-[16px]" value={manualParagraph == null ? '' : String(manualParagraph)} onChange={(event) => setManualParagraph(event.target.value === '' ? null : Number(event.target.value))}><option value="">使用参考句的近似定位</option>{paragraphs.map((paragraph, index) => <option key={index} value={index}>第 {index + 1} 段：{paragraph.slice(0, 45)}{paragraph.length > 45 ? '…' : ''}</option>)}</select>
      {(selectedReference != null || manualParagraph != null) && <div className="readable mt-3 space-y-3 text-[17px] leading-relaxed">
        <p className="text-[16px] text-dim" role="status">{manualParagraph != null ? '手动选择的段落，请自行核对与参考的关系。' : mapping?.message}</p>
        {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap break-words text-bright">{index === highlight ? <mark className="bg-gold text-[var(--wq-on-accent)]">{paragraph}</mark> : paragraph}</p>) : <p className="text-dim">当前版本尚无文字，请先写下自己的表达。</p>}
      </div>}
    </details>}
  </div>
}
