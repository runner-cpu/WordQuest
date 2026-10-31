import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CET_READY_PAPERS, cetPaperUrl, isCetReadyPaper, loadReadyCetPaper, readyPaperQuestions } from '../src/core/cetReadyPapers.ts'
import type { CetReadyPaper } from '../src/types/cetReadyPaper.ts'

const paperBytes = (path: string) => readFile(new URL(`../public/${path}`, import.meta.url))

test('every advertised edition ships 55 complete questions, matching keys, original files and recording', async () => {
  assert.equal(CET_READY_PAPERS.length, 10)
  assert.equal(new Set(CET_READY_PAPERS.map((e) => e.sourceId)).size, 10)
  let count = 0
  for (const entry of CET_READY_PAPERS) {
    const bytes = await paperBytes(entry.path)
    assert.equal(bytes.length, entry.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), entry.revision)
    const paper: unknown = JSON.parse(bytes.toString())
    assert.ok(isCetReadyPaper(paper, entry.sourceId), entry.sourceId)
    const all = readyPaperQuestions(paper)
    count += all.length
    assert.equal(entry.questionCount, all.length)
    assert.equal(entry.audioBytes, paper.assets.audio.bytes)
    assert.ok(paper.year * 100 + paper.month <= 202606)
    for (const asset of Object.values(paper.assets)) {
      const file = await paperBytes(asset.path)
      assert.equal(file.length, asset.bytes)
      assert.equal(createHash('sha256').update(file).digest('hex'), asset.sha256)
      if (asset.path.endsWith('.pdf')) assert.equal(file.subarray(0, 5).toString(), '%PDF-')
      else assert.ok(file.length > 1_000_000 && (file.subarray(0, 3).toString() === 'ID3' || file[0] === 255))
    }
    for (const q of all) {
      if (q.number <= 25 || q.number >= 46) assert.ok(q.options.every((o) => o.text.length < 270 && !/Section [BC]|={4}/.test(o.text)), `${entry.sourceId} Q${q.number} mixed content`)
      if (q.number >= 36 && q.number <= 45) assert.match(q.prompt, /[.?!]$/, `${entry.sourceId} Q${q.number} truncated prompt`)
    }
    const gaps = paper.banked.passage.match(/__\d+__/g)
    assert.equal(gaps?.length, 10, `${entry.sourceId} blanks`)
    assert.ok(!paper.banked.passage.startsWith('select one word'))
    assert.ok(!paper.translation.prompt.includes('本资源根据'))
  }
  assert.equal(count, 550)
  assert.ok(!CET_READY_PAPERS.some((e) => e.sourceId === 'cet6-202512-set1-nju'), 'do not advertise a paper with missing reference answers')
})

test('the PDF transcriptions restore missing passages and wrapped matching statements', async () => {
  const paper = JSON.parse((await paperBytes('exams/cet4-202512-1/paper.json')).toString()) as CetReadyPaper
  assert.match(paper.careful[0].passage, /^All living organisms/)
  assert.match(paper.careful[1].passage, /^Katharine Abraham/)
  assert.ok(!paper.careful[0].questions[4].options[3].text.includes('Katharine'))
  assert.match(paper.matching.questions[9].prompt, /cycling and walking\.$/)
  assert.match(paper.matching.paragraphs[14].text, /If data won’t change minds, customers might\.$/)
  const estimated = JSON.parse((await paperBytes('exams/cet4-202606-1/paper.json')).toString()) as CetReadyPaper
  assert.equal(estimated.listening[0].startSeconds, 0)
  assert.ok(estimated.listening.slice(1).every((g) => g.startSeconds === undefined), 'equal-duration guesses are not real segment boundaries')
})

test('runtime validation rejects mixed sources, incomplete answer keys and unsafe asset paths', async () => {
  const entry = CET_READY_PAPERS[0]
  const paper = JSON.parse((await paperBytes(entry.path)).toString()) as CetReadyPaper
  const bad = (edit: (copy: CetReadyPaper) => void) => { const copy = structuredClone(paper); edit(copy); assert.equal(isCetReadyPaper(copy, entry.sourceId), false) }
  bad((p) => { p.sourceId = 'other-edition' })
  bad((p) => { p.answerKey[0] = '' })
  bad((p) => { p.listening[0].questions[0].number = 2 })
  bad((p) => { p.careful.pop() })
  bad((p) => { p.assets.audio.path = 'exams/../../secret.mp3' })
  bad((p) => { p.assets.audio.path = 'exams/cet4-202606-1/listening.mp3' })
  bad((p) => { p.banked.questions[0].options = [] })
  bad((p) => { p.listening[0].startSeconds = -1 })
  assert.throws(() => cetPaperUrl('https://outside.test/audio.mp3', entry.revision))
})

test('loading verifies the manifest bytes before allowing the reference key into a study', async (t) => {
  const entry = CET_READY_PAPERS[0]
  const bytes = await paperBytes(entry.path)
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes))
  assert.ok(isCetReadyPaper(await loadReadyCetPaper(entry.sourceId), entry.sourceId))
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes.toString().replace('"schema":1', '"schema":2')))
  await assert.rejects(loadReadyCetPaper(entry.sourceId), /版本尚未同步/)
})
