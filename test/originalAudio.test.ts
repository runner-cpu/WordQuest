import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BUILTIN_SETS } from '../src/data/examSets.ts'
import { BUILTIN_MATERIALS } from '../src/data/listening.ts'
import manifest from '../src/data/originalAudio.json'
import { originalAudioPath } from '../src/core/originalAudio.ts'

test('all original listening passages and sentences ship matching, nonempty MP3 recordings', async () => {
  const texts = new Set([
    ...BUILTIN_SETS.flatMap((set) => set.sections.map((section) => section.pack.items[0].stem)),
    ...BUILTIN_MATERIALS.flatMap((material) => material.sentences.map((sentence) => sentence.text)),
  ])
  assert.equal(texts.size, 82)
  assert.equal(manifest.entries.length, texts.size)
  for (const entry of manifest.entries) {
    assert.ok(texts.delete(entry.text), 'each current script has exactly one recording')
    assert.match(entry.path, /^audio\/original\/[a-f0-9]{20}\.mp3$/)
    assert.equal(originalAudioPath(entry.text), entry.path)
    assert.ok(entry.path.includes(createHash('sha256').update(entry.text).digest('hex').slice(0, 20)))
    const bytes = await readFile(new URL(`../public/${entry.path}`, import.meta.url))
    assert.ok(bytes.length > 5000)
    assert.equal(bytes.length, entry.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
    assert.equal(bytes.subarray(0, 3).toString(), 'ID3')
  }
  assert.equal(texts.size, 0)
  assert.equal(originalAudioPath('An unknown imported sentence.'), undefined)
})
