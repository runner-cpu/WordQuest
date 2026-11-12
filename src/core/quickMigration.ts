import { exportBackup } from '../db/database'
import { importBackup, type BackupPayload, type ImportResult } from './backup'

/** 码长随学习记录变化；过大时继续使用完整 JSON 备份。 */
export const MIGRATION_CODE_MAX_LENGTH = 2 * 1024 * 1024
export const MIGRATION_JSON_MAX_BYTES = 8 * 1024 * 1024
const PREFIX = 'WQ1.'
const UNSUPPORTED = '当前浏览器不支持快速迁移所需的压缩功能，请使用 JSON 备份导出和导入。'

export function supportsQuickMigration(): boolean {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function' ||
    typeof TextEncoder !== 'function' || typeof TextDecoder !== 'function' || typeof Blob !== 'function' ||
    typeof File !== 'function' || typeof Blob.prototype.stream !== 'function' ||
    typeof btoa !== 'function' || typeof atob !== 'function') return false
  try {
    new CompressionStream('gzip')
    new DecompressionStream('gzip')
    return true
  } catch { return false }
}

function requireCompression(): void {
  if (!supportsQuickMigration()) throw new Error(UNSUPPORTED)
}

/** 边读取边计数，拒绝压缩炸弹，不先收完整解压数据再检查长度。 */
async function readLimited(stream: ReadableStream<Uint8Array>, limit: number, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) {
        void reader.cancel().catch(() => undefined)
        throw new Error(message)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(text) || text.length % 4 === 1) throw new Error('迁移码格式不正确，请重新复制完整内容。')
  try {
    const binary = atob(text.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - text.length % 4) % 4))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    if (toBase64Url(bytes) !== text) throw new Error('non-canonical base64url')
    return bytes
  } catch { throw new Error('迁移码格式不正确，请重新复制完整内容。') }
}

export async function encodeMigrationBackup(backup: BackupPayload): Promise<string> {
  requireCompression()
  let json: string
  try { json = JSON.stringify(backup) }
  catch { throw new Error('迁移数据无法编码，请使用 JSON 备份。') }
  const bytes = new TextEncoder().encode(json)
  if (bytes.byteLength > MIGRATION_JSON_MAX_BYTES) throw new Error('迁移数据过大，已超过快速迁移上限，请使用 JSON 备份。')
  const compressed = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    Math.floor((MIGRATION_CODE_MAX_LENGTH - PREFIX.length) * 3 / 4), '迁移码过长，已超过快速迁移上限，请使用 JSON 备份。')
  const code = PREFIX + toBase64Url(compressed)
  if (code.length > MIGRATION_CODE_MAX_LENGTH) throw new Error('迁移码过长，请使用 JSON 备份。')
  return code
}

export async function decodeMigrationCode(code: string): Promise<BackupPayload> {
  requireCompression()
  if (typeof code !== 'string' || code.length > MIGRATION_CODE_MAX_LENGTH) throw new Error('迁移码过长或内容无效，请使用 JSON 备份。')
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) {
    if (/^WQ\d+\./u.test(trimmed)) throw new Error('不支持这个迁移码版本，请使用 JSON 备份。')
    throw new Error('迁移码格式不正确，请复制以 WQ1. 开头的完整内容。')
  }
  const compressed = fromBase64Url(trimmed.slice(PREFIX.length))
  let bytes: Uint8Array<ArrayBuffer>
  const tooLarge = '迁移码解压后的数据过大，已超过快速迁移上限，请使用 JSON 备份。'
  try {
    bytes = await readLimited(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')), MIGRATION_JSON_MAX_BYTES, tooLarge)
  } catch (error) {
    if (error instanceof Error && error.message === tooLarge) throw error
    throw new Error('迁移码压缩数据损坏，请重新复制，或使用 JSON 备份。')
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as BackupPayload }
  catch { throw new Error('迁移码中的 JSON 数据损坏，请重新生成，或使用 JSON 备份。') }
}

export async function createMigrationCode(): Promise<{ code: string; mediaSkipped: number; wordsSkipped: number }> {
  requireCompression()
  const backup = await exportBackup({ includeMedia: false, includeWords: false })
  return { code: await encodeMigrationBackup(backup), mediaSkipped: backup.mediaSkipped ?? 0, wordsSkipped: backup.wordsSkipped ?? 0 }
}

/** 只解码后交给现有备份入口；日志、凭据、奖励和冲突合并始终走同一条路径。 */
export async function importMigrationCode(code: string): Promise<ImportResult> {
  try {
    const backup = await decodeMigrationCode(code)
    return await importBackup(new File([JSON.stringify(backup)], 'wordquest-migration.json', { type: 'application/json' }))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '迁移码导入失败，请使用 JSON 备份。',
      addedLogs: 0, totalLogs: 0, rebuiltWords: 0, addedWords: 0, addedExams: 0, addedCetPapers: 0, addedMedia: 0 }
  }
}
