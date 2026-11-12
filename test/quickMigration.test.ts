import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMigrationCode, decodeMigrationCode, encodeMigrationBackup, importMigrationCode,
  MIGRATION_CODE_MAX_LENGTH, MIGRATION_JSON_MAX_BYTES, supportsQuickMigration } from '../src/core/quickMigration.ts'
import { db } from '../src/db/database.ts'

const payload = { app: 'wordquest', schemaVersion: 11, data: { reviewLogs: [], words: [], media: [],
  profile: [{ id: 'me', cetFoundation: 'steady', mascot: { name: '阿词', skin: 'leaf' } }],
  cetPapers: [{ id: 'metadata-only', files: { audio: { id: 'preserved-audio-reference' } } }] } }

test('quick migration round trips Unicode metadata through a versioned gzip base64url code', async () => {
  assert.equal(supportsQuickMigration(), true)
  const code = await encodeMigrationBackup(payload)
  assert.match(code, /^WQ1\.[A-Za-z0-9_-]+$/)
  assert.deepEqual(await decodeMigrationCode(`  ${code}\n`), payload)
  assert.equal(code.includes('阿词'), false)
})

test('quick migration rejects unsupported versions, malformed base64url, damaged gzip and invalid JSON', async () => {
  for (const code of ['', 'text', 'WQ2.eA', 'WQ1.', 'WQ1.a', 'WQ1.%%%!', 'WQ1.eA', 'WQ1.H4sIAAAAA']) {
    await assert.rejects(decodeMigrationCode(code), /迁移码|版本/)
    assert.equal((await importMigrationCode(code)).ok, false)
  }
  const invalidJson = new Blob(['not json']).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(invalidJson).arrayBuffer())
  const code = `WQ1.${Buffer.from(bytes).toString('base64url')}`
  await assert.rejects(decodeMigrationCode(code), /JSON|数据|损坏/)
})

test('quick migration limits code length before decoding and limits streamed decompression size', async () => {
  await assert.rejects(decodeMigrationCode(`WQ1.${'A'.repeat(MIGRATION_CODE_MAX_LENGTH)}`), /过长|上限|过大/)
  const oversized = { data: { reviewLogs: [] }, padding: 'a'.repeat(MIGRATION_JSON_MAX_BYTES) }
  await assert.rejects(encodeMigrationBackup(oversized), /过大|上限/)
  const compressed = new Blob([JSON.stringify(oversized)]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  const shortBomb = `WQ1.${Buffer.from(bytes).toString('base64url')}`
  assert.equal(shortBomb.length < MIGRATION_CODE_MAX_LENGTH, true)
  await assert.rejects(decodeMigrationCode(shortBomb), /解压|上限|过大/)
})

test('unsupported compression browsers receive an explicit JSON backup fallback without reading storage', async (t) => {
  const compression = globalThis.CompressionStream
  Reflect.set(globalThis, 'CompressionStream', undefined)
  t.after(() => { Reflect.set(globalThis, 'CompressionStream', compression) })
  t.mock.method(db.profile, 'toArray', () => { throw new Error('must not read storage') })
  assert.equal(supportsQuickMigration(), false)
  await assert.rejects(createMigrationCode(), /JSON/)
  const result = await importMigrationCode('WQ1.eA')
  assert.equal(result.ok, false)
  assert.match(result.error!, /JSON/)
})
