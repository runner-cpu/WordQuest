import { useEffect, useState } from 'react'
import type { CetQuestionAnalysis, CetReadyQuestion } from '../types/cetReadyPaper'
import { PixelButton } from '../ui/Pixel'

const distractorNames = {
  'concept-swap': '偷换概念', 'over-inference': '过度推断', mismatch: '信息不符',
  'not-mentioned': '原文未提及', 'scope-shift': '范围偏移',
}

export function CetQuestionAnalysisPanel({ question, analysis, disabled, onAppend, evidenceText = '', canRecord = false, onSaveEvidence }: {
  question: CetReadyQuestion; analysis?: CetQuestionAnalysis; disabled: boolean; onAppend: (analysis: CetQuestionAnalysis) => void;
  evidenceText?: string; canRecord?: boolean; onSaveEvidence?: (text: string, expectedText: string) => void
}) {
  const [note, setNote] = useState(evidenceText)
  useEffect(() => setNote(evidenceText), [evidenceText, question.number])
  return <section className="cet-question-analysis" role="region" aria-label={`第 ${question.number} 题解析`}>
    <h4>第 {question.number} 题 · 证据与错因</h4>
    <p className="text-gold">参考答案：{question.answer} · {question.options.find(option => option.key === question.answer)?.text}</p>
    {!analysis ? <p className="text-dim">本题暂无结构化解析，仅提供参考答案</p> : <>
      <p className="text-dim">{analysis.verified ? '已人工核验的解析' : '待人工核验 · 解析草稿，请对照原文判断'}</p>
      <h5>回到原文找依据</h5>
      {analysis.evidence.map((item, index) => <blockquote key={index}>
        <p lang="en">{item.text}</p>
        <footer className="text-dim">第 {item.question} 题 · {item.section === 'careful' ? `仔细阅读第 ${(item.passageIndex ?? 0) + 1} 篇` : '听力'}{item.paragraph !== undefined ? ` · 第 ${item.paragraph} 段` : ''}{item.sourceRef ? ` · ${item.sourceRef}` : ''}</footer>
      </blockquote>)}
      <PixelButton disabled={disabled} onClick={() => onAppend(analysis)}>将证据句加入复盘笔记</PixelButton>
      <h5>其他选项为什么不合适</h5>
      <ul>{analysis.distractors.map(item => <li key={item.option}><strong>{item.option} · {distractorNames[item.type]}</strong><p>{item.explanation}</p></li>)}</ul>
      {!!analysis.paraphrase?.length && <><h5>关键表达对照</h5><ul>{analysis.paraphrase.map((item, index) => <li key={index} lang="en">{item.original} → {item.alternative}</li>)}</ul><p className="text-dim">用于本题理解的释义，不代表所有语境都可替换。</p></>}
      <details><summary>解析来源与待核验说明</summary><p>{analysis.sourceNote}</p></details>
    </>}
    {canRecord && onSaveEvidence && <details className="cet-correction-note"><summary>记录自己的订正依据</summary>
      <label htmlFor={`correction-evidence-${question.number}`}>第 {question.number} 题订正笔记</label>
      <textarea id={`correction-evidence-${question.number}`} className="pixel-input" rows={3} maxLength={5000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} placeholder="写下原文或录音依据，以及这次为什么改选…" />
      <p className="text-dim">保存本题依据后再核对订正。旧公共笔记不自动作为本题证据。</p>
      <PixelButton disabled={disabled || !note.trim() || note === evidenceText} onClick={() => onSaveEvidence(note, evidenceText)}>保存本题订正依据</PixelButton>
    </details>}
  </section>
}
