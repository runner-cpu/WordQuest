#!/usr/bin/env node
/**
 * ECDICT → WordQuest 词书管道（§8.4）
 *
 * 输入：data/npmtmp/package/assets/ecdict.csv（ECDICT, MIT）
 * 输出：public/data/books/<bookId>/unit-<n>.json + index.json
 *
 * 设计要点：
 * - 只保留 CET4 / CET6 词条，去掉词组、带标点的非单词条目
 * - 音标做 IPA 归一化（ECDICT 用西里尔字母 ә 代替 ə）
 * - 词频分档生成 difficultyWeight（§4.1）
 * - 按单元分片（默认 100 词/片），便于按需下载与离线缓存
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'data/npmtmp/package/assets/ecdict.csv')
const OUT = path.join(ROOT, 'public/data/books')
const UNIT_SIZE = 100

/** ECDICT 音标里的非标准字符 → IPA */
const PHONETIC_MAP = {
  'ә': 'ə',
  'ɑ:': 'ɑː',
  'ɔ:': 'ɔː',
  'ə:': 'ɜː',
  'i:': 'iː',
  'u:': 'uː',
  'ɡ': 'g',
}

function normalizePhonetic(p) {
  if (!p) return ''
  let s = p.replace(/^\[|\]$/g, '').replace(/^\/|\/$/g, '')
  for (const [from, to] of Object.entries(PHONETIC_MAP)) s = s.split(from).join(to)
  // ECDICT 用半角撇号标重音，统一成 IPA 主重音符
  s = s.replace(/'/g, 'ˈ').replace(/,\s*/g, 'ˌ')
  return s.trim()
}

/** 极简 CSV 解析：支持双引号包裹与 "" 转义 */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuote = false
      } else cur += c
    } else if (c === '"') inQuote = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function difficultyWeight(bncRank) {
  if (!bncRank || bncRank <= 0) return 1.6
  if (bncRank <= 2000) return 1.0
  if (bncRank <= 5000) return 1.3
  return 1.6
}

/** 只保留干净的可背单词：纯字母、长度 2–20、非词组 */
function isLearnableWord(w) {
  if (!w) return false
  if (w.length < 2 || w.length > 20) return false
  if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(w)) return false
  // 排除缩写与带连字符的复合词（背单词场景价值低）
  if (w.includes('-') || w.includes("'")) return false
  return true
}

/**
 * 中文释义清洗：拆行、去掉 [网络]/[经] 等语域标记，最多保留 3 个义项。
 *
 * 不能只把方括号标签删掉。像 "n. 能力, 才干\n[经] 能力, 才能" 这样的条目，
 * 删标签后会得到两个高度重叠的义项，拼起来读作「能力, 才干 能力, 才能」。
 * 领域标记行通常是主释义的复述，整行丢弃；只有全部释义都带标记时才退回删标签。
 */
function cleanTranslation(t) {
  if (!t) return ''
  const raw = t
    // ECDICT 用字面量 \n 表示换行
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const isDomainLine = (s) => /^\[[^\]]+\]/.test(s)
  const primary = raw.filter((s) => !isDomainLine(s))
  const source = primary.length > 0 ? primary : raw

  const cleaned = source
    .map((s) => s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  // 去重：完全相同的、或一方包含另一方的义项只留更长的那条
  const unique = []
  for (const line of cleaned) {
    const i = unique.findIndex((u) => u === line || u.includes(line) || line.includes(u))
    if (i >= 0) {
      if (line.length > unique[i].length) unique[i] = line
      continue
    }
    unique.push(line)
  }

  return unique.slice(0, 3).join('\n')
}

function loadEcdict() {
  const raw = fs.readFileSync(SRC, 'utf8')
  const lines = raw.split('\n')
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/\r/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const cells = parseCsvLine(line)
    const o = {}
    for (let j = 0; j < header.length; j++) o[header[j]] = (cells[j] ?? '').replace(/\r/g, '')
    if (!o.tag) continue
    const tags = o.tag.split(' ').filter(Boolean)
    const isCet4 = tags.includes('cet4')
    const isCet6 = tags.includes('cet6')
    const isKy = tags.includes('ky')
    const isIelts = tags.includes('ielts')
    if (!isCet4 && !isCet6 && !isKy && !isIelts) continue
    if (!isLearnableWord(o.word)) continue
    const translation = cleanTranslation(o.translation)
    if (!translation) continue
    const bnc = Number.parseInt(o.bnc, 10) || 0
    const frq = Number.parseInt(o.frq, 10) || 0
    rows.push({
      word: o.word.toLowerCase(),
      display: o.word,
      phonetic: normalizePhonetic(o.phonetic),
      definition: translation,
      pos: o.pos || '',
      collins: Number.parseInt(o.collins, 10) || 0,
      oxford: o.oxford === '1',
      cet4: isCet4,
      cet6: isCet6,
      ky: isKy,
      ielts: isIelts,
      bnc,
      frq,
      exchange: o.exchange || '',
    })
  }
  return rows
}

function dedupe(rows) {
  const seen = new Map()
  for (const r of rows) {
    const prev = seen.get(r.word)
    // 同一单词重复时保留释义更完整的那条
    if (!prev || (r.definition?.length ?? 0) > (prev.definition?.length ?? 0)) seen.set(r.word, r)
  }
  return [...seen.values()]
}

function sortByFreq(rows) {
  // BNC 与当代语料库双词频：任一位次靠前即视为高频
  const rank = (r) => Math.min(r.bnc || 999999, r.frq || 999999)
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.word.localeCompare(b.word))
}

function toWordRecord(r, bookId, unitId, idx) {
  return {
    id: r.word,
    word: r.display,
    phonetic: r.phonetic || undefined,
    pos: r.pos || undefined,
    definition: r.definition,
    bookId,
    freqRank: Math.min(r.bnc || 999999, r.frq || 999999) + idx * 0.001,
    difficultyWeight: difficultyWeight(r.bnc),
    unitId,
  }
}

function writeBook(bookId, rows) {
  const dir = path.join(OUT, bookId)
  fs.mkdirSync(dir, { recursive: true })
  // 清理旧分片
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f))
  const units = []
  for (let i = 0; i < rows.length; i += UNIT_SIZE) {
    const slice = rows.slice(i, i + UNIT_SIZE)
    const unitId = Math.floor(i / UNIT_SIZE) + 1
    const words = slice.map((r, idx) => toWordRecord(r, bookId, unitId, i + idx))
    const file = `unit-${String(unitId).padStart(3, '0')}.json`
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ unitId, words }), 'utf8')
    units.push({ unitId, file, count: words.length })
  }
  const index = { bookId, total: rows.length, unitSize: UNIT_SIZE, units }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index), 'utf8')
  const kb = units.reduce((a, u) => a + fs.statSync(path.join(dir, u.file)).size, 0) / 1024
  console.log(`  ${bookId}: ${rows.length} 词 / ${units.length} 单元 / ${kb.toFixed(0)}KB`)
  return index
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`缺少源文件：${SRC}\n请先运行：npm run fetch:ecdict`)
    process.exit(1)
  }
  console.log('读取 ECDICT…')
  const all = dedupe(loadEcdict())
  console.log(`  命中 CET 标签词条：${all.length}`)

  const cet4 = sortByFreq(all.filter((r) => r.cet4))
  const cet6Only = sortByFreq(all.filter((r) => r.cet6 && !r.cet4))
  const cet6 = sortByFreq(all.filter((r) => r.cet6))

  fs.mkdirSync(OUT, { recursive: true })
  console.log('生成词书分片：')
  writeBook('cet4-core', cet4.slice(0, 1200))
  writeBook('cet4-full', cet4)
  // CET6 核心：六级独有词优先（cet6 && !cet4）。
  // 不足 1500 时用四级里词频最低（最难）的词补足——绝不把四级高频基础词
  // 塞进六级书单：那会让「六级核心」前几单元全是 fact/social 这类基础词。
  {
    const cet6Core = [...cet6Only]
    if (cet6Core.length < 1500) {
      const taken = new Set(cet6Core.map((r) => r.word))
      const cet4Hard = [...cet4].reverse().filter((r) => !taken.has(r.word))
      cet6Core.push(...cet4Hard.slice(0, 1500 - cet6Core.length))
      console.log(`  cet6 独有词 ${cet6Only.length} 个，用四级低频词补 ${1500 - cet6Only.length} 个`)
    }
    writeBook('cet6-core', sortByFreq(cet6Core).slice(0, 1500))
  }
  writeBook('cet6-full', cet6)

  // 考研与雅思：给四六级之外的用户一个继续用的理由（§10 词书横向扩展）
  const ky = sortByFreq(all.filter((r) => r.ky))
  const ielts = sortByFreq(all.filter((r) => r.ielts))
  writeBook('ky-core', ky.slice(0, 1500))
  writeBook('ielts-core', ielts.slice(0, 1500))

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'ECDICT (MIT) https://github.com/skywind3000/ECDICT',
    books: ['cet4-core', 'cet4-full', 'cet6-core', 'cet6-full', 'ky-core', 'ielts-core'],
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log('完成 →', path.relative(ROOT, OUT))
}

main()
