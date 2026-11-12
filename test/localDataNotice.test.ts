import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalDataNoticeState, LOCAL_DATA_NOTICE_KEY } from '../src/core/localDataNotice.ts'

function memoryStorage(values = new Map<string, string>()) {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

test('local data notice is acknowledged in this browser and stays new in an independent browser', () => {
  const storage = memoryStorage(new Map([['wq:theme', 'paper']]))
  const page = createLocalDataNoticeState(() => storage)
  assert.equal(page.isAcknowledged(), false)
  page.acknowledge()
  assert.equal(page.isAcknowledged(), true)
  assert.equal(storage.values.get(LOCAL_DATA_NOTICE_KEY), '1')
  assert.equal(storage.values.get('wq:theme'), 'paper')
  assert.equal(createLocalDataNoticeState(() => storage).isAcknowledged(), true, 'a reload can read the browser acknowledgement')
  assert.equal(createLocalDataNoticeState(() => memoryStorage()).isAcknowledged(), false, 'another browser still needs its own notice')
})

test('a denied storage accessor or denied read and write uses the current session without throwing', () => {
  const denied = () => { throw new DOMException('Storage blocked', 'SecurityError') }
  for (const resolve of [denied, () => ({ getItem: denied, setItem: denied }), () => undefined]) {
    const page = createLocalDataNoticeState(resolve)
    assert.equal(page.isAcknowledged(), false)
    assert.doesNotThrow(() => page.acknowledge())
    assert.equal(page.isAcknowledged(), true)
    assert.equal(page.isAcknowledged(), true, 'navigation in this session must not repeat a dismissed notice')
  }
})

test('a readable browser that refuses writes still remembers acknowledgement in memory', () => {
  let reads = 0
  const page = createLocalDataNoticeState(() => ({
    getItem: () => { reads++; return null },
    setItem: () => { throw new DOMException('Quota full', 'QuotaExceededError') },
  }))
  assert.equal(page.isAcknowledged(), false)
  page.acknowledge()
  assert.equal(page.isAcknowledged(), true)
  assert.equal(page.isAcknowledged(), true)
  assert.equal(reads, 1, 'a null storage read must not undo the in-memory acknowledgement')
})

test('only the current explicit acknowledgement value suppresses a first-visit explanation', () => {
  for (const value of ['0', 'true', '', 'unknown']) {
    const storage = memoryStorage(new Map([[LOCAL_DATA_NOTICE_KEY, value]]))
    assert.equal(createLocalDataNoticeState(() => storage).isAcknowledged(), false)
  }
  const storage = memoryStorage(new Map([[LOCAL_DATA_NOTICE_KEY, '1']]))
  const page = createLocalDataNoticeState(() => storage)
  assert.equal(page.isAcknowledged(), true)
  storage.values.clear()
  assert.equal(page.isAcknowledged(), true, 'an acknowledged session does not redisplay after storage becomes unavailable')
})
