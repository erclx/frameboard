// Lands the board's accepted designs in canon/design/: each frame
// canon/design/frames.json maps, as its HTML beside a PNG per theme, captured
// through Frameboard's own `capture` verb from the design board at the main
// worktree's .canon/board, each HTML formatted under .oxfmtrc.json. `--check`
// writes nothing and exits 1 when the folder differs from what a sync would
// write. Builds the CLI first, since
// only the build carries the faces a capture loads.
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import type { FormatConfig } from 'oxfmt'

import {
  classifyDrift,
  FormatRefused,
  MappingError,
  missingFrames,
  parseFrameMap,
  toReference,
} from './lib/design-reference.ts'

type Output = Map<string, string | Buffer>

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

interface Listing {
  projects: { pages: { frames: { ref: string; path: string }[] }[] }[]
}

interface Capture {
  images: { theme: string; path: string }[]
}

class SyncRefused extends Error {}

const ROOT = join(import.meta.dirname, '..')
const DESIGN = join(ROOT, 'canon', 'design')
const MAPPING = join(DESIGN, 'frames.json')
const OWN_FILES = new Set(['index.md', 'frames.json'])
const CLI = join(ROOT, 'dist', 'cli.js')
const FORMAT_CONFIG = join(ROOT, '.oxfmtrc.json')
const KIT_FILES = [
  'kit.css',
  'kit.js',
  'vendor/rough.js',
  'vendor/Geist-latin.woff2',
]

/** The main worktree, which holds the gitignored board every worktree reads. */
function mainRoot(): string {
  const run = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const line = run.stdout.split('\n').find((l) => l.startsWith('worktree '))
  return line ? line.slice('worktree '.length) : ROOT
}

function frameboard<T>(args: string[]): T {
  const run = spawnSync('bun', [CLI, ...args, '--json'], { encoding: 'utf8' })
  let record: Envelope<T>
  try {
    record = JSON.parse(run.stdout) as Envelope<T>
  } catch {
    throw new SyncRefused(`frameboard ${args[0]} printed no record.`)
  }
  if (!record.ok || !record.data) {
    throw new SyncRefused(
      `frameboard ${args[0]} refused: ${record.error?.message ?? run.stderr}`,
    )
  }
  return record.data
}

/**
 * The repo's own formatter options, which `format()` never discovers on its
 * own, so a reference lands as `bun run format` would leave it.
 */
function formatOptions(): FormatConfig {
  const { $schema: _schema, ...options } = JSON.parse(
    readFileSync(FORMAT_CONFIG, 'utf8'),
  ) as FormatConfig & { $schema?: string }
  return options
}

function build(): void {
  const run = spawnSync('bun', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' })
  if (run.status !== 0) {
    throw new SyncRefused(`bun run build failed:\n${run.stderr.toString()}`)
  }
}

function trackedFiles(): string[] {
  return readdirSync(DESIGN, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DESIGN, join(entry.parentPath, entry.name)))
    .filter((path) => !OWN_FILES.has(path))
}

function pruneEmptyDirs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name))
  }
  if (dir !== DESIGN && readdirSync(dir).length === 0) rmdirSync(dir)
}

async function run(check: boolean): Promise<number> {
  const map = parseFrameMap(readFileSync(MAPPING, 'utf8'))
  const options = formatOptions()
  const board = join(mainRoot(), '.canon', 'board')
  build()

  const listing = frameboard<Listing>(['list', '--root', board])
  const paths = new Map(
    listing.projects
      .flatMap((project) => project.pages)
      .flatMap((page) => page.frames)
      .map((frame) => [frame.ref, frame.path]),
  )
  const missing = missingFrames(map, new Set(paths.keys()))
  if (missing.length > 0) {
    throw new SyncRefused(
      `No board frame for: ${missing.join(', ')}. Nothing written.`,
    )
  }

  const output: Output = new Map()
  const captures = mkdtempSync(join(tmpdir(), 'design-sync-'))
  try {
    for (const [reference, ref] of map) {
      const path = paths.get(ref) ?? ''
      output.set(
        `${reference}.html`,
        await toReference(readFileSync(path, 'utf8'), reference, options),
      )
      const { images } = frameboard<Capture>([
        'capture',
        ref,
        '--root',
        board,
        '--out',
        captures,
      ])
      for (const image of images) {
        output.set(`${reference}-${image.theme}.png`, readFileSync(image.path))
      }
    }
  } finally {
    rmSync(captures, { recursive: true, force: true })
  }
  const [project = ''] = (map.values().next().value ?? '').split('/')
  for (const kit of KIT_FILES) {
    output.set(
      join('kit', kit),
      readFileSync(join(board, project, 'assets', 'kit', kit)),
    )
  }

  if (check) {
    const tracked = new Map<string, string | Buffer>()
    for (const path of trackedFiles()) {
      tracked.set(path, readFileSync(join(DESIGN, path)))
    }
    const drift = classifyDrift(output, tracked)
    for (const path of drift.changed) console.error(`Changed: ${path}`)
    for (const path of drift.missing) console.error(`Missing: ${path}`)
    for (const path of drift.stray) console.error(`Stray: ${path}`)
    for (const path of drift.pngDiffers) {
      console.error(`Warning: PNG bytes differ: ${path}`)
    }
    const owed =
      drift.changed.length + drift.missing.length + drift.stray.length
    if (owed === 0) console.log('canon/design/ matches the board.')
    return owed === 0 ? 0 : 1
  }

  for (const [path, data] of output) {
    mkdirSync(dirname(join(DESIGN, path)), { recursive: true })
    writeFileSync(join(DESIGN, path), data)
  }
  for (const path of trackedFiles()) {
    if (!output.has(path)) rmSync(join(DESIGN, path))
  }
  pruneEmptyDirs(DESIGN)
  console.log(`Wrote ${output.size} files to canon/design/.`)
  return 0
}

try {
  process.exitCode = await run(process.argv.includes('--check'))
} catch (error) {
  console.error(
    error instanceof SyncRefused ||
      error instanceof MappingError ||
      error instanceof FormatRefused
      ? error.message
      : error,
  )
  process.exitCode = 1
}
