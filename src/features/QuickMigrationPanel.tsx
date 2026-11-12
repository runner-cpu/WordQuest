import { useId, useRef, useState } from 'react'
import type { ImportResult } from '../core/backup'
import { MIGRATION_CODE_MAX_LENGTH, supportsQuickMigration } from '../core/quickMigration'
import { PixelButton } from '../ui/Pixel'

export interface MigrationCodeResult {
  code: string
  mediaSkipped: number
  wordsSkipped: number
}

export type MigrationImportResult = ImportResult & { refreshWarning?: string }
const buttonClass = 'readable !min-h-11 !text-[16px]'

export function QuickMigrationPanel({ busy, generating, importing, onGenerate, onImport, onUseJson }: {
  busy: boolean
  generating: boolean
  importing: boolean
  onGenerate: () => Promise<MigrationCodeResult | null>
  onImport: (code: string) => Promise<MigrationImportResult | null>
  onUseJson: () => void
}) {
  const id = useId()
  const [supported] = useState(supportsQuickMigration)
  const [generated, setGenerated] = useState<MigrationCodeResult | null>(null)
  const [generateError, setGenerateError] = useState('')
  const [input, setInput] = useState('')
  const [importFeedback, setImportFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copying, setCopying] = useState(false)
  const codeField = useRef<HTMLTextAreaElement>(null)
  const tooLong = input.length > MIGRATION_CODE_MAX_LENGTH

  async function generate() {
    setGenerateError('')
    setCopyFeedback('')
    try {
      const result = await onGenerate()
      if (result) setGenerated(result)
      else setGenerateError('另一项数据操作正在进行，请稍候再生成。')
    } catch (cause) {
      setGenerateError(`${cause instanceof Error ? cause.message : '迁移码生成失败。'} 请改用上方的 JSON 备份，或稍后重试。${generated ? '上次生成的迁移码仍保留在下面。' : ''}`)
    }
  }

  async function copy() {
    if (!generated || copying) return
    setCopying(true)
    setCopyFeedback('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(generated.code)
      setCopyFeedback('迁移码已复制，可在目标设备粘贴导入。')
    } catch {
      setCopyFeedback('浏览器未允许写入剪贴板。迁移码已保留，请点“全选迁移码”后手动复制。')
    } finally { setCopying(false) }
  }

  async function merge() {
    if (!input.trim() || tooLong) return
    setImportFeedback(null)
    try {
      const result = await onImport(input)
      if (!result) { setImportFeedback({ text: '另一项数据操作正在进行，请稍候再导入。', error: true }); return }
      if (!result.ok) {
        setImportFeedback({ text: `${result.error ?? '迁移码未能导入，请检查是否复制完整。'} 输入已保留，也可改用 JSON 备份。`, error: true })
        return
      }
      setImportFeedback({ text: `迁移码已合并：新增 ${result.addedLogs} 条复习记录、${result.addedCetPapers} 份真题档案。已有记录按备份规则合并，不会重复发放奖励。${result.refreshWarning ?? ''}`, error: false })
    } catch {
      setImportFeedback({ text: '迁移码导入未完成。输入已保留，请重试，或改用 JSON 备份。', error: true })
    }
  }

  return <details className="border-t-2 border-edge pt-1">
    <summary className="readable min-h-11 cursor-pointer py-3 text-[16px] text-bright">快速迁移（迁移码）</summary>
    <div className="min-w-0 space-y-4 pt-2">
      <p className="readable text-[16px] leading-relaxed text-dim">在设备之间手动复制已保存的学习记录、草稿和奖励凭据。生成与合并都在浏览器本机完成，不会后台上传，也不会自动云同步。</p>
      <p className="readable text-[16px] leading-relaxed text-dim">迁移码随记录量变长，不是固定长度的短码。目标设备请重新下载词书和录音，原始 PDF 需自行导入；自建词条正文请另用 JSON 备份保留。</p>
      {!supported && <p className="readable text-[16px] leading-relaxed text-fail" role="alert">此浏览器不支持迁移码所需的压缩功能，请使用上方的 JSON 导出与导入。</p>}
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" className={buttonClass} disabled={busy || !supported} aria-busy={generating} onClick={() => void generate()}>{generating ? '正在生成迁移码…' : '生成迁移码'}</PixelButton>
        <PixelButton size="sm" className={buttonClass} variant="ghost" onClick={onUseJson}>转到 JSON 备份</PixelButton>
      </div>
      {generateError && <p className="readable text-[16px] leading-relaxed text-fail" role="alert">{generateError}</p>}
      {generated && <div className="space-y-2">
        <label htmlFor={`${id}-code`} className="readable block text-[16px] text-bright">本机迁移码</label>
        <textarea ref={codeField} id={`${id}-code`} value={generated.code} readOnly rows={5} wrap="soft" spellCheck={false}
          className="pixel-input readable min-h-40 w-full min-w-0 break-all p-3 !text-[16px] leading-relaxed" aria-describedby={`${id}-code-help`} />
        <p id={`${id}-code-help`} className="readable text-[16px] leading-relaxed text-dim">共 {generated.code.length.toLocaleString()} 字符；省略 {generated.wordsSkipped.toLocaleString()} 条词条正文和 {generated.mediaSkipped.toLocaleString()} 个录音或文档附件。</p>
        <div className="flex flex-wrap gap-2">
          <PixelButton size="sm" className={buttonClass} disabled={busy || copying} aria-busy={copying} onClick={() => void copy()}>复制迁移码</PixelButton>
          <PixelButton size="sm" className={buttonClass} variant="ghost" onClick={() => { codeField.current?.focus(); codeField.current?.select(); setCopyFeedback('已全选迁移码，可使用系统复制操作。') }}>全选迁移码</PixelButton>
        </div>
        {copyFeedback && <p className="readable text-[16px] leading-relaxed text-dim" role="status">{copyFeedback}</p>}
      </div>}
      <div className="space-y-2 border-t-2 border-edge pt-4">
        <label htmlFor={`${id}-input`} className="readable block text-[16px] text-bright">粘贴迁移码</label>
        <textarea id={`${id}-input`} value={input} onChange={(event) => { setInput(event.target.value); setImportFeedback(null) }} disabled={busy} rows={5} wrap="soft" spellCheck={false}
          className="pixel-input readable min-h-40 w-full min-w-0 break-all p-3 !text-[16px] leading-relaxed" aria-describedby={`${id}-input-help`} aria-invalid={tooLong || undefined} placeholder="在目标设备粘贴完整迁移码…" />
        <p id={`${id}-input-help`} className={`readable text-[16px] leading-relaxed ${tooLong ? 'text-fail' : 'text-dim'}`} role={tooLong ? 'alert' : undefined}>{tooLong
          ? `迁移码超过 ${MIGRATION_CODE_MAX_LENGTH.toLocaleString()} 字符上限，请改用 JSON 备份。输入已保留。`
          : `${input.length.toLocaleString()} / ${MIGRATION_CODE_MAX_LENGTH.toLocaleString()} 字符。请粘贴完整内容，合并后仍保留当前设备已有记录。`}</p>
        <PixelButton size="sm" className={buttonClass} disabled={busy || !supported || !input.trim() || tooLong} aria-busy={importing} onClick={() => void merge()}>{importing ? '正在合并迁移码…' : '导入迁移码并合并'}</PixelButton>
        {importFeedback && <p className={`readable text-[16px] leading-relaxed ${importFeedback.error ? 'text-fail' : 'text-pass'}`} role={importFeedback.error ? 'alert' : 'status'}>{importFeedback.text}</p>}
      </div>
    </div>
  </details>
}
