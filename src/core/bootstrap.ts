import { db } from '../db/database'
import type { BookId, Profile } from '../types/model'
import { ensureProfile } from './profile'
import { checkAchievements, checkDormancy } from './progress'
import { BOOKS, ensureLocalSeedBook, ensureSeedBook, repairIncompleteBooks, syncBookRevision } from './wordbook'

let preparation: Promise<Profile> | null = null
let profileRefresh: Promise<{ profile: Profile; achievements: string[] }> | null = null
let bookMaintenance: Promise<string[]> | null = null
let booksMaintained = false

function studyBook(profile: Profile): BookId {
  return BOOKS.find((b) => b.id === profile.studyBook)?.id ?? (profile.examType === 'cet6' ? 'cet6-core' : 'cet4-core')
}

/** 只等待本地数据；模块级共享 Promise 避免 StrictMode 重复初始化。 */
export function prepareLocalApp(): Promise<Profile> {
  if (preparation) return preparation
  preparation = (async () => {
    if (!db.isOpen()) await db.open()
    const profile = await ensureProfile()
    await ensureLocalSeedBook(studyBook(profile))
    await checkDormancy()
    return ensureProfile()
  })()
  void preparation.then(
    () => { preparation = null },
    () => { preparation = null },
  )
  return preparation
}

/** 本地成就检查与网络下载分别调度，慢网络不阻塞进度刷新。 */
export function refreshLocalProgress() {
  if (profileRefresh) return profileRefresh
  profileRefresh = (async () => {
    await checkDormancy()
    const newly = await checkAchievements()
    return { profile: await ensureProfile(), achievements: newly.map((a) => a.name) }
  })()
  void profileRefresh.then(
    () => { profileRefresh = null },
    () => { profileRefresh = null },
  )
  return profileRefresh
}

/** 首屏完成后维护词库。失败可在恢复联网时重试，同一时刻只运行一份。 */
export function maintainBooksInBackground(profile: Profile): Promise<string[]> {
  if (bookMaintenance) return bookMaintenance
  if (booksMaintained || navigator.onLine === false) return Promise.resolve([])
  bookMaintenance = (async () => {
    const messages: string[] = []
    let failed = false
    try {
      await ensureSeedBook(studyBook(profile))
    } catch (error) {
      failed = true
      console.warn('[WordQuest] 完整词库暂未下载', error)
    }
    try {
      const refreshed = await syncBookRevision()
      if (refreshed.length > 0) messages.push(`已更新词书数据：${refreshed.length} 本`)
    } catch (error) {
      failed = true
      console.warn('[WordQuest] 词书修订暂未完成', error)
    }
    try {
      const repaired = await repairIncompleteBooks()
      if (repaired.length > 0) messages.push(`已补齐词库：${repaired.join('、')}`)
    } catch (error) {
      failed = true
      console.warn('[WordQuest] 词书补齐暂未完成', error)
    }
    booksMaintained = !failed
    if (failed) messages.push('完整词书暂未下载，可在「单词」页重试')
    return messages
  })()
  void bookMaintenance.then(
    () => { bookMaintenance = null },
    () => { bookMaintenance = null },
  )
  return bookMaintenance
}
