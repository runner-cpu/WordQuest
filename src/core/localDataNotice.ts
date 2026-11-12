export const LOCAL_DATA_NOTICE_KEY = 'wq:local-data-notice:v1'

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Keep acknowledgement for this app session even when browser storage rejects access. */
export function createLocalDataNoticeState(resolveStorage: () => NoticeStorage | undefined = () =>
  typeof window === 'undefined' ? undefined : window.localStorage) {
  let acknowledged = false
  return {
    isAcknowledged(): boolean {
      if (acknowledged) return true
      try { acknowledged = resolveStorage()?.getItem(LOCAL_DATA_NOTICE_KEY) === '1' } catch { /* Use this session's acknowledgement. */ }
      return acknowledged
    },
    acknowledge(): void {
      acknowledged = true
      try { resolveStorage()?.setItem(LOCAL_DATA_NOTICE_KEY, '1') } catch { /* Retain it in memory for navigation in this session. */ }
    },
  }
}

// Page remounts share this state; the flag is deliberately outside the transferable learning data.
export const localDataNoticeState = createLocalDataNoticeState()
