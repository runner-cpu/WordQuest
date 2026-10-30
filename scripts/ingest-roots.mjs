#!/usr/bin/env node
/**
 * 词根词缀管道（§5.1 词根词缀表）
 *
 * 输入：data/npmtmp/package/assets/wordroot.txt（ECDICT 附带，MIT）
 * 输出：public/data/roots.json
 *
 * 处理要点：
 * - 611 条词根/前缀/后缀，只保留有中文可用释义的（原数据是英文释义，转成中文标签）
 * - 例句过滤到本地词书实际存在的词，避免点了查不到
 * - 建立 词 → 词根 的反向索引，供单词卡展示拆解
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'data/npmtmp/package/assets/wordroot.txt')
const BOOKS = path.join(ROOT, 'public/data/books')
const OUT = path.join(ROOT, 'public/data/roots.json')

/** 英文 class → 中文类别 */
const CLASS_LABEL = {
  root: '词根',
  prefix: '前缀',
  'adjective-forming suffix': '形容词后缀',
  'noun-forming suffix': '名词后缀',
  'verb-forming suffix': '动词后缀',
  'adverb-forming suffix': '副词后缀',
  'adjective- and noun-forming suffix': '形/名后缀',
}

/**
 * 常见释义的中文速查。词根释义原文是英文，对中文用户直接读英文解释门槛太高，
 * 这里覆盖高频词根；未覆盖的保留英文原文，并在 UI 上标为原文。
 */
/**
 * 释义翻译规则。词根释义原文是英文短语，逐条人工翻译 462 种写法不现实，
 * 这里按「常见词/句式 → 中文」做规则化翻译，覆盖大部分高频表达。
 * 规则未命中时保留英文原文，UI 上不加中文标记。
 */
const MEANING_RULES = [
  // 整句/后缀释义（最高优先级，必须最先匹配）
  [/^\(in adjectives\) doing the action/i, '（形容词）表示「…的」'],
  [/^a person or thing that does/i, '…的人/物'],
  [/^the act, process, or result of/i, '…的行为/过程/结果'],
  [/^act, process, or instance of/i, '…的行为/过程'],
  [/^act or process of/i, '…的行为/过程'],
  [/^to cause to be or become or have/i, '使…；使成为'],
  [/^to put into; cause to be or have/i, '使…；置入'],
  [/^tending to, connected with, or performing/i, '倾向于…的'],
  [/^full of, characterized by/i, '充满…的'],
  [/^full of$/i, '充满…的'],
  [/^like, pertaining to/i, '像…的；与…有关'],
  [/^state, quality, or act of/i, '…的状态/性质'],
  [/^capable of being, doing, or undergoing/i, '能…的'],
  [/^pertaining to/i, '与…有关的'],
  [/^like, of, related to/i, '像…的；与…有关'],
  // 单个高频词
  [/^not; apart; reverse, negate\.?$/i, '不；分离；反转'],
  [/^from; away from; down from; reverse, negate\.?$/i, '离开；向下；反转'],
  [/^through, throughout; very$/i, '穿过；彻底'],
  [/^again; back or back again$/i, '再；回'],
  [/^before, forward, forth$/i, '在前；向前'],
  [/^across, over, to the other side$/i, '横过；越过'],
  [/^between, among$/i, '之间'],
  [/^with, together$/i, '共同'],
  [/^to go; to go back or yield$/i, '走；返回；让步'],
  [/^king, rule, guide; straight$/i, '统治；引导；直'],
  [/^stand, standing, stabilize$/i, '站立；稳定'],
  [/^to see, look, watch$/i, '看'],
  [/^speak, declare$/i, '说；宣告'],
  [/^send, let go$/i, '送；放开'],
  [/^throw; lie$/i, '投掷；躺'],
  [/^shape, form$/i, '形状'],
  [/^birth, origin, race, kind$/i, '出生；起源；种类'],
  [/^carry, bring$/i, '携带；带来'],
  [/^make, do$/i, '做；制造'],
  [/^put, place$/i, '放置'],
  [/^to hold$/i, '握持'],
  [/^to take, catch$/i, '拿；抓'],
  [/^do, drive$/i, '做；驱动'],
  [/^to run$/i, '跑'],
  [/^to make, cause, do$/i, '做；使'],
  [/^to, toward$/i, '向；朝'],
  [/^not$/i, '不'],
  [/^out, out of, away$/i, '向外；离开'],
  [/^stretch$/i, '伸展'],
]

/**
 * 用规则表翻译释义。命中返回中文，否则返回 null。
 * 只做「整串匹配」，不做词级拼接，避免生成半英半中的怪句子。
 */
function translateMeaning(english) {
  const text = english.trim()
  for (const [re, zh] of MEANING_RULES) {
    if (re.test(text)) return zh
  }
  return null
}

/**
 * 词级释义兜底：释义本身是 1-3 个英文单词时，按词表直译。
 * 这类短释义（如 "man, human" / "water"）在词根表里占相当比例。
 */
const WORD_GLOSS = {
  man: '人', human: '人类', water: '水', fire: '火', earth: '土', air: '气',
  life: '生命', death: '死', light: '光', dark: '暗', sound: '声', word: '词',
  name: '名', body: '身体', head: '头', hand: '手', foot: '脚', eye: '眼',
  ear: '耳', heart: '心', mind: '心智', soul: '灵魂', people: '人', city: '城市',
  house: '房屋', door: '门', road: '路', time: '时间', year: '年', day: '日',
  night: '夜', number: '数', measure: '测量', weight: '重量', length: '长度',
  shape: '形状', form: '形状', color: '颜色', line: '线', point: '点',
  circle: '圆', center: '中心', side: '边', top: '顶', bottom: '底',
  front: '前', middle: '中', end: '末端', begin: '开始', first: '第一',
  one: '一', two: '二', three: '三', four: '四', half: '半', many: '多',
  small: '小', large: '大', good: '好', bad: '坏', new: '新', old: '旧',
  see: '看', look: '看', say: '说', speak: '说', write: '写', do: '做',
  make: '做', carry: '携带', bring: '带来', hold: '握持', place: '放置',
  move: '移动', lead: '引导', follow: '跟随', know: '知道', think: '思考',
  love: '爱', fear: '怕', eat: '吃', drink: '喝', sleep: '睡', walk: '走',
  run: '跑', come: '来', go: '去', give: '给', take: '拿', put: '放',
  send: '送', build: '建造', break: '打破', cut: '切', join: '连接',
  bind: '绑', turn: '转', roll: '滚', flow: '流', pour: '倒', fill: '填满',
  full: '满的', empty: '空的', open: '打开', close: '关闭', free: '自由',
  law: '法律', right: '正当', wrong: '错误', true: '真实', false: '虚假',
  same: '相同', other: '其他', all: '全部', every: '每个', some: '一些',
  more: '更多', less: '更少', much: '多', little: '少', very: '非常',
  again: '再', back: '回', before: '在前', after: '在后', under: '在下',
  over: '在上', between: '之间', through: '穿过', around: '环绕',
  against: '对抗', with: '伴随', without: '没有', together: '共同',
  out: '向外', into: '进入', across: '横过', beyond: '超出', self: '自我',
  good2: '好', bad2: '坏', not: '不', and: '和', or: '或', of: '的',
  to: '向', from: '从', in: '在内', on: '在上', up: '向上', down: '向下',
  for: '为了', by: '通过', at: '在', as: '如', is: '是', be: '是',
}

function glossWords(english) {
  // 只处理 1-3 个词的短释义，如 "man, human" / "to run"
  const words = english
    .toLowerCase()
    .replace(/[;.]/g, ',')
    .split(/[,\s]+/)
    .map((w) => w.replace(/^to$/, '').trim())
    .filter(Boolean)
  if (words.length === 0 || words.length > 3) return null
  const translated = words.map((w) => WORD_GLOSS[w]).filter(Boolean)
  if (translated.length === 0) return null
  return [...new Set(translated)].join('；')
}

/** 常见语源的固定译名 */
const ORIGIN_LABEL = {
  Latin: '拉丁语',
  Greek: '希腊语',
  OldEnglish: '古英语',
  English: '英语',
  French: '法语',
  OldFrench: '古法语',
  Germanic: '日耳曼语',
  Norse: '古诺斯语',
  Italian: '意大利语',
  Spanish: '西班牙语',
  Arabic: '阿拉伯语',
  Dutch: '荷兰语',
  Chinese: '汉语',
  Japanese: '日语',
  Sanskrit: '梵语',
  Persian: '波斯语',
  Turkish: '土耳其语',
  Russian: '俄语',
  German: '德语',
}

function loadBookWords() {
  const words = new Set()
  if (!fs.existsSync(BOOKS)) return words
  for (const book of fs.readdirSync(BOOKS)) {
    const dir = path.join(BOOKS, book)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const file of fs.readdirSync(dir)) {
      if (!file.startsWith('unit-')) continue
      const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
      for (const w of payload.words) words.add(w.id)
    }
  }
  return words
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('缺少词根源文件：', SRC)
    process.exit(1)
  }
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
  const bookWords = loadBookWords()
  console.log(`本地词书词条：${bookWords.size}`)

  const roots = []
  const index = {}

  for (const [key, item] of Object.entries(raw)) {
    if (!item || typeof item !== 'object') continue
    const cls = CLASS_LABEL[item.class]
    if (!cls) continue

    const examples = (item.example ?? [])
      .map((e) => String(e).toLowerCase())
      .filter((e) => bookWords.has(e))
      .slice(0, 12)

    const rawMeaning = String(item.meaning || '').trim()
    if (!rawMeaning) continue
    // 翻译顺序：整句规则 → 短释义词表 → 保留原文
    const zh = translateMeaning(rawMeaning) ?? glossWords(rawMeaning)
    const record = {
      id: key,
      form: item.root || key,
      meaning: zh || rawMeaning,
      meaningZh: Boolean(zh),
      cls,
      origin: ORIGIN_LABEL[item.origin] || item.origin || '',
      examples,
      /** 同义/反义词根，用于「顺藤摸瓜」 */
      synonyms: item.synonyms || '',
      antonyms: item.antonyms || '',
    }
    roots.push(record)

    // 反向索引：词 → 词根。只索引本地存在的词
    for (const ex of examples) {
      if (!index[ex]) index[ex] = []
      index[ex].push(key)
    }
  }

  // 排序：有本地例句的优先，其次例句多的优先，最后按字母
  roots.sort((a, b) => {
    const aHas = a.examples.length > 0 ? 1 : 0
    const bHas = b.examples.length > 0 ? 1 : 0
    if (aHas !== bHas) return bHas - aHas
    if (a.examples.length !== b.examples.length) return b.examples.length - a.examples.length
    return a.id.localeCompare(b.id)
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'ECDICT wordroot (MIT) https://github.com/skywind3000/ECDICT',
    total: roots.length,
    roots,
    index,
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(payload), 'utf8')

  const sizeKb = Math.round(fs.statSync(OUT).size / 1024)
  const withExamples = roots.filter((r) => r.examples.length > 0).length
  const indexedWords = Object.keys(index).length
  console.log(`词根：${roots.length} 条（${withExamples} 条有本地例句）`)
  console.log(`可拆解单词：${indexedWords} 个`)
  console.log(`输出：${path.relative(ROOT, OUT)} (${sizeKb}KB)`)
}

main()
