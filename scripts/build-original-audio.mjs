/** Optional content tool: node --import tsx scripts/build-original-audio.mjs --ffmpeg <path> */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { BUILTIN_SETS } from '../src/data/examSets.ts'
import { BUILTIN_MATERIALS } from '../src/data/listening.ts'

const ffmpeg = process.argv[process.argv.indexOf('--ffmpeg') + 1]
if (!process.argv.includes('--ffmpeg') || !ffmpeg) throw new Error('Pass --ffmpeg with the path to an installed FFmpeg executable.')
const root = process.cwd()
const output = path.join(root, 'public/audio/original')
await mkdir(output, { recursive: true })
const texts = [...new Set([
  ...BUILTIN_SETS.flatMap((set) => set.sections.map((section) => section.pack.items[0].stem)),
  ...BUILTIN_MATERIALS.flatMap((material) => material.sentences.map((sentence) => sentence.text)),
])]
const entries = texts.map((text) => ({ text, path: `audio/original/${createHash('sha256').update(text).digest('hex').slice(0, 20)}.mp3` }))
const temporary = await mkdtemp(path.join(tmpdir(), 'wordquest-audio-'))
try {
  const jobs = []
  for (const entry of entries) {
    const destination = path.join(root, 'public', entry.path)
    if (!(await stat(destination).catch(() => null))?.size) jobs.push({ text: entry.text, destination })
  }
  if (jobs.length) {
    const jobFile = path.join(temporary, 'jobs.json')
    await writeFile(jobFile, JSON.stringify(jobs), 'utf8')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/synthesize-original-audio.ps1'), '-Jobs', jobFile, '-Ffmpeg', ffmpeg], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('Original listening audio generation failed.')
  }
  const manifest = []
  for (const entry of entries) {
    const bytes = await readFile(path.join(root, 'public', entry.path))
    manifest.push({ ...entry, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  await writeFile(path.join(root, 'src/data/originalAudio.json'), JSON.stringify({ voice: 'Microsoft Zira Desktop · en-US · synthetic', entries: manifest }, null, 2) + '\n')
  console.log(`Prepared ${manifest.length} original recordings (${(manifest.reduce((sum, entry) => sum + entry.bytes, 0) / 1024 / 1024).toFixed(1)} MB).`)
} finally {
  if (path.dirname(path.resolve(temporary)) !== path.resolve(tmpdir()) || !path.basename(temporary).startsWith('wordquest-audio-')) throw new Error('Unexpected temporary directory.')
  await rm(temporary, { recursive: true, force: true })
}
