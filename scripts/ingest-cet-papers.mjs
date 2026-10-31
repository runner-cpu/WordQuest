/** Rebuild same-origin CET papers from the university's linked self-test pages.
 * Run: node --import tsx scripts/ingest-cet-papers.mjs
 * Existing downloads are reused; --refresh refetches the source pages.
 */
import { load } from 'cheerio'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CET_PAPER_SOURCES } from '../src/data/cetPaperSources.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const raw = resolve(root, 'data/raw/cet-ingest')
const publicRoot = resolve(root, 'public')
await mkdir(raw, { recursive: true })
const refresh = process.argv.includes('--refresh')
const corrections = JSON.parse(await readFile(resolve(root, 'scripts/cet-paper-corrections.json'), 'utf8')).papers
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const text = (element) => element.text().replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim()
const inline = (element) => text(element).replace(/\s+/g, ' ')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

async function fetchBytes(url, target, signature) {
  let bytes
  if (!refresh || signature !== 'html') {
    try { bytes = await readFile(target) } catch { /* First download. */ }
  }
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    assert(response.ok, `${response.status}: ${url}`)
    bytes = Buffer.from(await response.arrayBuffer())
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  if (signature === 'pdf') assert(bytes.subarray(0, 5).toString() === '%PDF-', `Not PDF: ${url}`)
  if (signature === 'mp3') assert(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224), `Not MP3: ${url}`)
  return bytes
}

function question($, element, options) {
  const row = $(element)
  const number = Number(row.attr('data-no') || row.find('.qno').text().replace(/\D/g, ''))
  const answer = row.attr('data-ans')?.trim()
  const own = row.find('.opt').toArray().map((option) => ({ key: $(option).attr('data-key'), text: inline($(option).find('.otext')).replace(/\s+Section [BC]\s+[\s\S]*$/, '').replace(/\s*=+[\s\S]*$/, '') }))
  let prompt = inline(row.find('.stem'))
  if (!prompt && row.hasClass('mstmt')) prompt = inline(row.find('.qhead').clone().find('.qno').remove().end())
  return { number, prompt: prompt.replace(/\s*如下。$/, ''), options: options ?? own, answer, explanation: text(row.find('.explain')) || undefined }
}

function parse(html, source) {
  const $ = load(html)
  const listening = []
  let group
  $('#listening').children().each((_, element) => {
    const row = $(element)
    if (row.is('h3.grp')) {
      const segment = row.find('.segplay')
      const start = Number(segment.attr('data-start'))
      const end = Number(segment.attr('data-end'))
      group = { title: inline(row.clone().find('button').remove().end()), questions: [] }
      if (segment.length && Number.isFinite(start)) group.startSeconds = start
      if (segment.length && Number.isFinite(end) && end > start) group.endSeconds = end
      listening.push(group)
    } else if (row.is('.q')) {
      assert(group, `${source.id}: listening group missing`)
      group.questions.push(question($, element))
    }
  })
  // Two source pages divide the total duration evenly, independent of question
  // group lengths. Do not present those estimates as real segment boundaries.
  const durations = listening.map((g) => g.endSeconds - g.startSeconds)
  if (durations.length > 1 && durations.every(Number.isFinite) && Math.max(...durations) - Math.min(...durations) < 1) {
    listening.forEach((g, i) => { delete g.endSeconds; if (i) delete g.startSeconds })
  }
  const options = $('#banked .wbitem').toArray().map((element) => ({ key: inline($(element).find('b')), text: inline($(element).clone().find('b').remove().end()) }))
  const paragraphs = $('#matching .para').toArray().map((element) => ({ key: inline($(element).find('.pkey')), text: inline($(element).clone().find('.pkey').remove().end()) }))
  const passage = $('#banked > .passage').clone()
  passage.find('mark.gap').each((_, element) => { $(element).replaceWith(` __${$(element).text().replace(/\D/g, '')}__ `) })
  const paper = {
    schema: 1, sourceId: source.id, title: source.title.replace('真题资料', '真题'), level: source.level, year: source.year, month: source.month,
    provider: source.provider, sourceUrl: source.sourceUrl, checkedAt: '2026-10-31',
    writing: { prompt: text($('#writing .subjective > .passage')), reference: text($('#writing .rubrictxt')) },
    translation: { prompt: text($('#translation .subjective > .passage')), reference: text($('#translation .rubrictxt')) },
    listening,
    banked: { passage: text(passage), options, questions: $('#banked .blank').toArray().map((element) => question($, element, options)) },
    matching: { paragraphs, questions: $('#matching .mstmt').toArray().map((element) => question($, element, paragraphs.map(({key}) => ({key,text:`段落 ${key}`})))) },
    careful: $('#careful .careful-passage').toArray().map((element) => ({ title: inline($(element).find('h3')), passage: text($(element).children('.passage')), questions: $(element).find('.q').toArray().map((q) => question($, q)) })),
  }
  // The HTML importer on the source site lost some wrapped PDF lines. These
  // transcriptions retain the linked PDF wording instead of inventing new text.
  const correction = corrections[source.id]
  if (correction?.matchingPrompts) {
    paper.matching.questions.forEach((q) => { q.prompt = correction.matchingPrompts[q.number] })
    const last = paragraphs.at(-1)
    const ending = correction.matchingLastParagraphEndsAt
    assert(last.text.includes(ending), `${source.id}: last paragraph changed`)
    last.text = last.text.slice(0, last.text.indexOf(ending) + ending.length)
  }
  if (correction?.carefulFirstPassage) {
    const questions = paper.careful.flatMap((p) => p.questions)
    const lastOption = questions.find((q) => q.number === 50).options.find((o) => o.key === 'D')
    const split = lastOption.text.indexOf(' Katharine Abraham,')
    assert(split > 0, `${source.id}: second reading passage changed`)
    paper.careful = [
      { title: 'Passage One', passage: correction.carefulFirstPassage, questions: questions.slice(0, 5) },
      { title: 'Passage Two', passage: lastOption.text.slice(split + 1), questions: questions.slice(5) },
    ]
    lastOption.text = lastOption.text.slice(0, split)
  }
  paper.translation.prompt = paper.translation.prompt.replace(/\s*本资源根据[\s\S]*$/, '').replace(/^【中文原文】\s*/, '')
  paper.banked.passage = paper.banked.passage.replace(/^select one word[\s\S]*?more than once\.\s*/, '')
    .replace(/\[?\b(2[6-9]|3[0-5])\b\]?\.?/g, '__$1__')
  assert(new Set(paper.banked.passage.match(/__(?:2[6-9]|3[0-5])__/g)).size === 10, `${source.id}: missing reading blanks`)
  const questions = [...listening.flatMap((g) => g.questions), ...paper.banked.questions, ...paper.matching.questions, ...paper.careful.flatMap((p) => p.questions)]
  assert(questions.length === 55 && questions.every((q, index) => q.number === index + 1), `${source.id}: expected exactly questions 1–55`)
  for (const q of questions) {
    assert(q.options.length && q.options.every((option) => option.key && option.text) && q.options.some((option) => option.key === q.answer), `${source.id}: invalid question ${q.number}`)
    if (q.number >= 36) assert(q.prompt.length > 10, `${source.id}: question ${q.number} has no prompt`)
  }
  assert(options.length === 15 && paragraphs.length >= 10 && paper.careful.length === 2, `${source.id}: reading structure incomplete`)
  assert(paper.writing.prompt.length > 40 && paper.translation.prompt.length > 40, `${source.id}: writing / translation missing`)
  assert(paper.banked.passage.length > 100 && paper.careful.every((p) => p.passage.length > 200), `${source.id}: missing passage`)
  paper.answerKey = questions.map((q) => q.answer)
  const links = $('a[download]').toArray().map((element) => ({ text: inline($(element)), url: new URL($(element).attr('href'), source.sourceUrl).href }))
  const paperLink = links.find((link) => link.text.includes('真题 PDF'))
  const answersLink = links.find((link) => link.text.includes('答案解析 PDF'))
  const audioLink = links.find((link) => link.text.includes('听力 MP3'))
  assert(paperLink && audioLink, `${source.id}: missing linked original / audio`)
  return { paper, links: { paper: paperLink.url, answers: answersLink?.url, audio: audioLink.url } }
}

const entries = []
// All URLs were present in the university indexes; do not synthesize missing years.
// The linked 2025-12 CET-6 answer file explicitly omits Q16–25. Keep its source
// ID for existing archives, but do not advertise it as a complete ready paper.
const sources = CET_PAPER_SOURCES.filter((source) => source.id.endsWith('-nju') && source.id !== 'cet6-202512-set1-nju')
for (const source of sources) {
  const html = await fetchBytes(source.sourceUrl, resolve(raw, `${source.id}.html`), 'html')
  const { paper, links } = parse(html.toString('utf8'), source)
  const folder = `exams/${source.level}-${source.year}${String(source.month).padStart(2, '0')}-1`
  paper.assets = {}
  for (const [kind, url] of Object.entries(links)) {
    if (!url) continue
    const path = `${folder}/${kind === 'audio' ? 'listening.mp3' : `${kind}.pdf`}`
    const bytes = await fetchBytes(url, resolve(publicRoot, path), kind === 'audio' ? 'mp3' : 'pdf')
    paper.assets[kind] = { path, bytes: bytes.length, sha256: sha(bytes), sourceUrl: url }
  }
  const bytes = Buffer.from(JSON.stringify(paper))
  const path = `${folder}/paper.json`
  await writeFile(resolve(publicRoot, path), bytes)
  entries.push({ sourceId: source.id, path, revision: sha(bytes).slice(0, 16), bytes: bytes.length, audioBytes: paper.assets.audio.bytes, questionCount: 55 })
  console.log(`${source.id}: 55 questions; audio ${(paper.assets.audio.bytes / 1024 / 1024).toFixed(1)} MB`)
}
entries.sort((a, b) => b.sourceId.localeCompare(a.sourceId))
await writeFile(resolve(root, 'src/data/cetReadyPapers.json'), `${JSON.stringify(entries, null, 2)}\n`)
console.log(`${entries.length} ready papers, ${entries.length * 55} questions.`)
