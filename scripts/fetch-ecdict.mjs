#!/usr/bin/env node
/**
 * 下载 ECDICT 词库源文件（MIT）。
 * 优先 npm 镜像（国内可达且快），回退 GitHub 代理。
 * 产出：data/npmtmp/package/assets/ecdict.csv
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, 'data/npmtmp')
const TARBALL = path.join(TMP, 'ecdict.tgz')
const TARGET = path.join(TMP, 'package/assets/ecdict.csv')

const SOURCES = [
  'https://registry.npmmirror.com/ecdict/-/ecdict-0.0.4.tgz',
  'https://registry.npmjs.org/ecdict/-/ecdict-0.0.4.tgz',
]

if (fs.existsSync(TARGET)) {
  console.log('词库已存在：', path.relative(ROOT, TARGET))
  process.exit(0)
}

fs.mkdirSync(TMP, { recursive: true })

let ok = false
for (const url of SOURCES) {
  try {
    console.log('下载', url)
    execFileSync('curl', ['-sL', '--fail', '-m', '600', '-o', TARBALL, url], { stdio: 'inherit' })
    if (fs.existsSync(TARBALL) && fs.statSync(TARBALL).size > 1_000_000) {
      ok = true
      break
    }
  } catch {
    console.warn('失败，尝试下一个源')
  }
}

if (!ok) {
  console.error('所有源均下载失败。请手动下载 ecdict.tgz 放到', TMP)
  process.exit(1)
}

console.log('解压…')
execFileSync('tar', ['-xzf', TARBALL, '-C', TMP], { stdio: 'inherit' })
console.log('完成 →', path.relative(ROOT, TARGET))
