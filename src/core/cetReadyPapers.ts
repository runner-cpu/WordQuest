import entries from '../data/cetReadyPapers.json'
import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import type { CetPaperAsset, CetPaperOption, CetReadyPaper, CetReadyPaperEntry, CetReadyQuestion } from '../types/cetReadyPaper'

export const CET_READY_PAPERS: readonly CetReadyPaperEntry[] = entries
export const CET_PAPER_JSON_CACHE = 'wq-cet-papers-v1'
export const CET_PAPER_AUDIO_CACHE = 'wq-cet-recordings-v1'
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const prose = (v: unknown): v is string => typeof v === 'string' && v.length < 100_000
const path = (v: unknown): v is string => typeof v === 'string' && /^exams\/cet[46]-\d{6}-1\/(paper\.json|paper\.pdf|answers\.pdf|listening\.mp3)$/.test(v)
const options = (v: unknown): v is CetPaperOption[] => Array.isArray(v) && v.length > 0 && v.length <= 26 &&
  v.every((o) => record(o) && typeof o.key === 'string' && /^[A-Z]$/.test(o.key) && prose(o.text) && Boolean(o.text.trim())) && new Set(v.map((o) => o.key)).size === v.length
const question = (v: unknown): v is CetReadyQuestion => record(v) && Number.isInteger(v.number) && prose(v.prompt) && options(v.options) &&
  v.options.some((o) => o.key === v.answer) && (v.explanation === undefined || prose(v.explanation))
const asset = (v: unknown): v is CetPaperAsset => record(v) && path(v.path) && Number.isSafeInteger(v.bytes) && Number(v.bytes) > 0 &&
  typeof v.sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.sha256) && typeof v.sourceUrl === 'string' && v.sourceUrl.startsWith('https://eol.nju.edu.cn/')

export function readyPaperQuestions(paper: CetReadyPaper): CetReadyQuestion[] {
  return [...paper.listening.flatMap((g) => g.questions), ...paper.banked.questions, ...paper.matching.questions, ...paper.careful.flatMap((p) => p.questions)]
}

/** Reject incomplete/mixed editions before opening a study or assigning its key. */
export function isCetReadyPaper(v: unknown, sourceId: string): v is CetReadyPaper {
  const source = CET_PAPER_SOURCES.find((s) => s.id === sourceId)
  if (!source || !record(v) || v.schema !== 1 || v.sourceId !== sourceId || v.level !== source.level || v.year !== source.year || v.month !== source.month ||
    !prose(v.title) || !prose(v.provider) || v.sourceUrl !== source.sourceUrl || !prose(v.checkedAt)) return false
  for (const kind of ['writing', 'translation']) {
    const item = v[kind]
    if (!record(item) || !prose(item.prompt) || item.prompt.length < 40 || !prose(item.reference)) return false
  }
  if (!Array.isArray(v.listening) || !v.listening.length || !v.listening.every((g) => record(g) && prose(g.title) &&
    Array.isArray(g.questions) && g.questions.length > 0 && g.questions.every(question) &&
    (g.startSeconds === undefined || (typeof g.startSeconds === 'number' && Number.isFinite(g.startSeconds) && g.startSeconds >= 0)) &&
    (g.endSeconds === undefined || (typeof g.endSeconds === 'number' && typeof g.startSeconds === 'number' && g.endSeconds > g.startSeconds)))) return false
  if (!record(v.banked) || !prose(v.banked.passage) || v.banked.passage.length < 100 || !options(v.banked.options) || v.banked.options.length !== 15 ||
    !Array.isArray(v.banked.questions) || v.banked.questions.length !== 10 || !v.banked.questions.every(question)) return false
  if (!record(v.matching) || !options(v.matching.paragraphs) || v.matching.paragraphs.length < 10 ||
    !Array.isArray(v.matching.questions) || v.matching.questions.length !== 10 || !v.matching.questions.every(question)) return false
  if (!Array.isArray(v.careful) || v.careful.length !== 2 || !v.careful.every((p) => record(p) && prose(p.title) && prose(p.passage) && p.passage.length > 200 &&
    Array.isArray(p.questions) && p.questions.length === 5 && p.questions.every(question))) return false
  if (!record(v.assets) || !asset(v.assets.paper) || !asset(v.assets.audio) || (v.assets.answers !== undefined && !asset(v.assets.answers))) return false
  const folder = `exams/${source.level}-${source.year}${String(source.month).padStart(2, '0')}-1/`
  if (v.assets.paper.path !== `${folder}paper.pdf` || v.assets.audio.path !== `${folder}listening.mp3` ||
    (v.assets.answers && v.assets.answers.path !== `${folder}answers.pdf`)) return false
  const p = v as unknown as CetReadyPaper
  const all = readyPaperQuestions(p)
  return all.length === 55 && p.listening.flatMap((g) => g.questions).length === 25 && Array.isArray(p.answerKey) && p.answerKey.length === 55 &&
    all.every((q, i) => q.number === i + 1 && q.answer === p.answerKey[i] &&
      (i < 25 || i >= 45 ? q.options.map((o) => o.key).join('') === 'ABCD' : i < 35 ? q.options.map((o) => o.key).join('') === p.banked.options.map((o) => o.key).join('') :
        q.options.map((o) => o.key).join('') === p.matching.paragraphs.map((o) => o.key).join('')) &&
      (i < 35 || q.prompt.length > 10)) &&
    Array.from({ length: 10 }, (_, i) => `__${i + 26}__`).every((blank) => p.banked.passage.includes(blank))
}

export function cetPaperUrl(resourcePath: string, revision: string): string {
  if (!path(resourcePath) || !/^[a-f0-9]{16,64}$/.test(revision)) throw new Error('真题资源地址无效')
  return `${import.meta.env?.BASE_URL ?? '/'}${resourcePath}?rev=${revision}`
}

async function verifiedPaper(response: Response, entry: CetReadyPaperEntry): Promise<CetReadyPaper> {
  if (!response.ok) throw new Error('题目加载未完成，请检查网络后重试')
  const bytes = await response.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const revision = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  if (bytes.byteLength !== entry.bytes || revision !== entry.revision) throw new Error('题目版本尚未同步，请刷新网页后重试')
  const paper: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!isCetReadyPaper(paper, entry.sourceId)) throw new Error('这套题的数据未通过完整性检查，请稍后重试')
  return paper
}

export async function loadReadyCetPaper(sourceId: string, signal?: AbortSignal): Promise<CetReadyPaper> {
  const entry = CET_READY_PAPERS.find((e) => e.sourceId === sourceId)
  if (!entry) throw new Error('这套真题尚未整理为站内版本')
  const response = await fetch(cetPaperUrl(entry.path, entry.revision), { signal })
  return verifiedPaper(response, entry)
}

/** Full, verified 200 responses let Workbox serve later audio Range requests. */
export async function cacheCetPaper(paper: CetReadyPaper, onProgress: (value: number) => void, signal: AbortSignal): Promise<void> {
  if (!('caches' in globalThis)) throw new Error('当前浏览器无法保存离线录音，可继续在线练习')
  const entry = CET_READY_PAPERS.find((e) => e.sourceId === paper.sourceId)!
  const jsonUrl = cetPaperUrl(entry.path, entry.revision)
  const json = await fetch(jsonUrl, { signal })
  await verifiedPaper(json.clone(), entry)
  await (await caches.open(CET_PAPER_JSON_CACHE)).put(jsonUrl, json)
  const audio = paper.assets.audio
  const url = cetPaperUrl(audio.path, audio.sha256)
  const response = await fetch(url, { signal, headers: { Range: `bytes=0-${audio.bytes - 1}` } })
  if (!response.ok || !response.body) throw new Error('录音未下载完成，请重试')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); received += value.byteLength
    onProgress(Math.min(99, Math.floor(received / audio.bytes * 100)))
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
  if (received !== audio.bytes || hash !== audio.sha256) throw new Error('录音下载不完整，请重试缓存')
  await (await caches.open(CET_PAPER_AUDIO_CACHE)).put(url, new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(received) } }))
  onProgress(100)
}
