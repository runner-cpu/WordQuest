/** Optional display/download hints must never block the IndexedDB learning records. */
const memory = new Map<string, string>()

export function readPreference(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    if (value === null) memory.delete(key)
    else memory.set(key, value)
    return value
  } catch { return memory.get(key) ?? null }
}

export function rememberPreference(key: string, value: string): void {
  memory.set(key, value)
  try { localStorage.setItem(key, value) } catch { /* Retain this session's setting in memory. */ }
}
