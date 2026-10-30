#!/usr/bin/env node
/**
 * 生成离线尝鲜包：把四级核心词前 3 个单元（300 词）内联进构建产物。
 *
 * 为什么：应用首次打开必须联网下载词库，弱网或纯离线首启会直接失败，
 * 这是新人体验的硬伤。尝鲜包让用户「打开即能学」，完整词库后台再下。
 *
 * 产物：src/data/taster.ts（已 gitignore，构建前由 prebuild 自动生成）
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const BOOKS_DIR = path.join(ROOT, 'public/data/books/cet4-core')
const OUT = path.join(ROOT, 'src/data/taster.ts')
const UNITS = 3

function main() {
  const units = []
  for (let u = 1; u <= UNITS; u++) {
    const file = path.join(BOOKS_DIR, `unit-${String(u).padStart(3, '0')}.json`)
    if (!fs.existsSync(file)) {
      console.error(`缺少单元文件：${file}，请先运行 npm run ingest:ecdict`)
      process.exit(1)
    }
    units.push(JSON.parse(fs.readFileSync(file, 'utf8')).words)
  }
  const words = units.flat()

  const banner = `/**
 * 离线尝鲜包 —— 由 scripts/build-taster.mjs 自动生成，勿手改。
 * 四级核心词前 ${UNITS} 个单元（${words.length} 词），随构建产物一起分发，
 * 让首次打开（含纯离线）的用户无需下载就能开始学习。
 */`

  const body = `// as const 让 bookId 收窄为字面量类型，匹配 Word['bookId']
export const TASTER_BOOK_ID = 'cet4-core' as const\nexport const TASTER_WORDS = ${JSON.stringify(words)}\n`

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, `${banner}\n${body}`, 'utf8')
  const kb = Math.round(fs.statSync(OUT).size / 1024)
  console.log(`尝鲜包：${words.length} 词 → ${path.relative(ROOT, OUT)} (${kb}KB)`)
}

main()
