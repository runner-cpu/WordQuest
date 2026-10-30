/**
 * 存储持久化（数据安全的最后一环）。
 *
 * 学习记录全在 IndexedDB 里，但浏览器默认是「尽力而为」模式：
 * 磁盘紧张时可以整库清退，iOS Safari 尤其激进。申请持久存储后，
 * 只有用户主动清站点数据才能删掉记录。
 */

export interface StorageInfo {
  persisted: boolean
  usage: number
  quota: number
  /** 当前环境不支持 Storage API（老浏览器/非安全上下文） */
  supported: boolean
}

/** 申请持久存储。已持久化或申请成功返回 true，不支持/被拒返回 false。 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** 当前持久化状态与用量。不支持的环境返回 supported: false。 */
export async function storageInfo(): Promise<StorageInfo> {
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.storage?.estimate)
  if (!supported) return { persisted: false, usage: 0, quota: 0, supported: false }
  try {
    const [persisted, estimate] = await Promise.all([
      navigator.storage.persisted?.() ?? Promise.resolve(false),
      navigator.storage.estimate!(),
    ])
    return { persisted, usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, supported: true }
  } catch {
    return { persisted: false, usage: 0, quota: 0, supported: false }
  }
}

/** 人类可读的体积：B/MB/GB 一位小数 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
