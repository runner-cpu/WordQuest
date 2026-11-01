import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readPreference, rememberPreference } from '../src/core/preferences.ts'

test('optional preference storage survives blocked reads/writes within the current session', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem() { throw new Error('Storage disabled') },
      setItem() { throw new Error('Storage disabled') },
    } })
    assert.equal(readPreference('test:blocked'), null)
    rememberPreference('test:blocked', 'enabled')
    assert.equal(readPreference('test:blocked'), 'enabled')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem() { return null },
      setItem() {},
    } })
    assert.equal(readPreference('test:blocked'), null, 'available persistent storage is authoritative')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
