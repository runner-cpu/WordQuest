/**
 * 真题导入。
 *
 * 本模块解析用户自行导入的听力练习包。近年高校公开真题的来源目录、
 * PDF 与录音练习由 cetPapers 模块管理，原卷内容通过原站或本机文件查看。
 *
 * 导入格式（纯文本，可手写可粘贴）：
 *
 *   # 标题: 2023年6月四级听力
 *   # 级别: CET-4
 *   # 部分: Section A 新闻报道
 *
 *   [材料]
 *   材料原文，可以多行……
 *
 *   [题目]
 *   题干文本
 *   A) 选项一
 *   B) 选项二
 *   C) 选项三
 *   D) 选项四
 *   答案: A
 *   解析: 一句话说明考点
 *
 * 同一段 [材料] 下可以连续多个 [题目]，材料会自动归到同组、练习时只播一次。
 */

export interface ExamItem {
  group: string
  stem: string
  question: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
  explain: string
}

export interface ExamPack {
  id: string
  title: string
  level: string
  sectionName: string
  items: ExamItem[]
}

/** IndexedDB 里的真题卷行 */
export interface ExamPaperRow {
  id: string
  importedAt: number
  pack: ExamPack
}

export interface ParseResult {
  ok: boolean
  pack?: ExamPack
  errors: string[]
}

const LETTERS = ['A', 'B', 'C', 'D'] as const

export function parseExamText(text: string, now = Date.now()): ParseResult {
  const errors: string[] = []
  const lines = text.replace(/\r/g, '').split('\n')

  // 头部 # key: value
  const header: Record<string, string> = {}
  let i = 0
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^#\s*([^:：]+)[:：]\s*(.*)$/)
    if (!m) break
    header[m[1].trim()] = m[2].trim()
  }
  if (!header['标题']) errors.push('缺少头部「# 标题: …」')
  if (errors.length > 0) return { ok: false, errors }

  const items: ExamItem[] = []
  let stem: string | null = null
  let groupSeq = 0
  let curGroup = ''

  const takeBlock = (start: number, stopAt: (l: string) => boolean): { text: string; next: number } => {
    const buf: string[] = []
    let j = start
    for (; j < lines.length; j++) {
      if (stopAt(lines[j])) break
      buf.push(lines[j])
    }
    return { text: buf.join('\n').trim(), next: j }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\[材料]/.test(line)) {
      const b = takeBlock(i + 1, (l) => /^\s*\[(材料|题目)\]/.test(l))
      stem = b.text
      groupSeq += 1
      curGroup = `g${groupSeq}`
      i = b.next
      continue
    }
    if (/^\s*\[题目]/.test(line)) {
      if (stem == null) {
        errors.push(`第 ${items.length + 1} 题：找不到它所属的 [材料] 块`)
        // 跳到下一个块，避免死循环
        const b = takeBlock(i + 1, (l) => /^\s*\[(材料|题目)\]/.test(l))
        i = b.next
        continue
      }
      const b = takeBlock(i + 1, (l) => /^\s*\[(材料|题目)\]/.test(l))
      i = b.next
      const blockLines = b.text.split('\n').map((l) => l.trim()).filter(Boolean)

      // 题干：第一个选项行之前的所有行（兼容小写 a)）
      const optStart = blockLines.findIndex((l) => /^[A-Da-d][).、]/.test(l))
      if (optStart < 0) {
        errors.push(`第 ${items.length + 1} 题：没有找到 A) 开头的选项`)
        continue
      }
      const question = blockLines.slice(0, optStart).join(' ').trim()
      if (!question) errors.push(`第 ${items.length + 1} 题：题干为空`)

      // 选项：兼容小写 a)——从 Word/网页粘贴的真题常出现小写
      const options: string[] = []
      let k = optStart
      for (; k < blockLines.length; k++) {
        const m = blockLines[k].match(/^([A-Da-d])[).、]\s*(.*)$/)
        if (!m) break
        const idx = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number])
        options[idx] = m[2]
      }
      if (options.length !== 4 || options.some((o) => !o)) {
        errors.push(`第 ${items.length + 1} 题：选项不足四个`)
        continue
      }

      // 答案 / 解析
      let answer = -1
      let explain = ''
      for (; k < blockLines.length; k++) {
        const am = blockLines[k].match(/^答案[:：]\s*([A-Da-d])/)
        if (am) {
          answer = LETTERS.indexOf(am[1].toUpperCase() as (typeof LETTERS)[number]) as 0 | 1 | 2 | 3
          continue
        }
        const em = blockLines[k].match(/^解析[:：]\s*(.*)$/)
        if (em) explain = em[1]
      }
      if (answer !== 0 && answer !== 1 && answer !== 2 && answer !== 3) {
        errors.push(`第 ${items.length + 1} 题：缺少「答案: X」`)
        continue
      }

      items.push({
        group: curGroup,
        stem,
        question,
        options: options as [string, string, string, string],
        answer,
        explain,
      })
      continue
    }
    i++
  }

  if (items.length === 0 && errors.length === 0) errors.push('没有解析到任何 [题目] 块')
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    errors: [],
    pack: {
      id: `exam-${now}`,
      title: header['标题'],
      level: header['级别'] || 'CET-4',
      sectionName: header['部分'] || '听力',
      items,
    },
  }
}

/** 可一键填入的示例模板：展示格式，用户照抄换内容 */
export const EXAM_TEMPLATE = `# 标题: 2024年6月四级听力（示例格式，请替换为真题内容）
# 级别: CET-4
# 部分: Section A 新闻报道

[材料]
材料原文第一句。
材料原文第二句。

[题目]
What do we learn from the news report?
A) 选项一
B) 选项二
C) 选项三
D) 选项四
答案: A
解析: 首句即主题句。

[题目]
第二道题共用上面的材料，练习时只会播一次。
A) 选项一
B) 选项二
C) 选项三
D) 选项四
答案: C
解析: 转折词之后是考点。`
