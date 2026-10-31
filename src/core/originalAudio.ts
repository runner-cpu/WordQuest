import manifest from '../data/originalAudio.json'

const paths = new Map(manifest.entries.map((entry) => [entry.text, entry.path]))

/** Recordings use content-based filenames, so edited scripts cannot play stale audio. */
export function originalAudioPath(text: string): string | undefined {
  return paths.get(text)
}
