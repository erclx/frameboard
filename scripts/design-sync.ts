// Lands the canvas's accepted designs in canon/design/: a PNG per theme and
// the frame HTML beside it, filed by surface for every frame
// canon/design/index.md carries. `--check` writes nothing and exits 1 when
// the folder differs from what a sync would write. Needs the canon CLI on
// PATH, which serves the main root's canvas.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative } from 'node:path'

import { type Browser, chromium } from '@playwright/test'

import {
  type CanvasFiles,
  type CarriedFrame,
  classifyDrift,
  type FileRow,
  parseCarried,
  renderFilesSection,
  resolveCarried,
  sourceFiles,
  spliceFilesSection,
  THEMES,
  toReference,
  uncarriedPicked,
} from './lib/design-reference.ts'

interface Box {
  readonly width: number
  readonly height: number
}

interface Canvas {
  readonly url: string
  readonly content: string
}

type Output = Map<string, string | Buffer>

class SyncRefused extends Error {}

const ROOT = join(import.meta.dirname, '..')
const DESIGN = join(ROOT, 'canon', 'design')
const INDEX = join(DESIGN, 'index.md')
const KIT_FILES = [
  'kit.css',
  'kit.js',
  'vendor/rough.js',
  'vendor/Geist-latin.woff2',
]

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

async function serveCanvas(): Promise<{
  canvas: Canvas
  server: ChildProcess
}> {
  const probe = spawnSync('canon', ['--version'], { stdio: 'ignore' })
  if (probe.error) {
    throw new SyncRefused(
      'The canon CLI is not on PATH. Install the canon toolkit first.',
    )
  }
  const port = await freePort()
  const server = spawn(
    'canon',
    ['canvas', 'serve', '--json', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  try {
    const canvas = await new Promise<Canvas>((resolve, reject) => {
      let out = ''
      server.on('exit', () => reject(new Error('canon canvas serve exited')))
      server.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString()
        const line = out.split('\n').find((l) => l.trimStart().startsWith('{'))
        if (!line) return
        const record = JSON.parse(line) as {
          ok?: boolean
          url?: string
          content?: string
        }
        if (record.ok && record.url && record.content) {
          resolve({ url: record.url, content: record.content })
        } else {
          reject(new SyncRefused(`canon canvas serve refused: ${line}`))
        }
      })
    })
    return { canvas, server }
  } catch (error) {
    server.kill()
    throw error
  }
}

function listCanvas(content: string): CanvasFiles {
  const pages = new Map<string, string[]>()
  for (const page of readdirSync(content).sort()) {
    const dir = join(content, page)
    if (!statSync(dir).isDirectory()) continue
    pages.set(
      page,
      readdirSync(dir)
        .filter((file) => file.endsWith('.html'))
        .sort(),
    )
  }
  return pages
}

function readBox(content: string, page: string, stem: string): Box {
  const layout = JSON.parse(
    readFileSync(join(content, page, 'layout.json'), 'utf8'),
  ) as { frames: Record<string, Box | undefined> }
  const box = layout.frames[stem]
  if (!box) throw new SyncRefused(`No layout.json box for ${page}/${stem}.`)
  return box
}

function trackedFiles(): string[] {
  return readdirSync(DESIGN, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DESIGN, join(entry.parentPath, entry.name)))
    .filter((path) => path !== 'index.md')
}

function pruneEmptyDirs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name))
  }
  if (dir !== DESIGN && readdirSync(dir).length === 0) rmdirSync(dir)
}

/** Draws one carried frame into the output and returns its Files row. */
async function captureFrame(
  browser: Browser,
  canvas: Canvas,
  frame: CarriedFrame,
  output: Output,
): Promise<FileRow> {
  const sources = sourceFiles(frame)
  const first = sources[0]
  if (!first)
    throw new SyncRefused(`No source for ${frame.page}/${frame.stem}.`)
  const box = readBox(
    canvas.content,
    frame.page,
    first.file.replace('.html', ''),
  )
  const names: string[] = []
  for (const source of sources) {
    const html = readFileSync(
      join(canvas.content, frame.page, source.file),
      'utf8',
    )
    output.set(join(frame.folder, source.out), toReference(html))
    names.push(source.out)
    for (const theme of frame.single ? THEMES : [source.theme]) {
      const context = await browser.newContext({
        viewport: { width: box.width, height: box.height },
        reducedMotion: 'reduce',
      })
      try {
        const page = await context.newPage()
        await page.goto(`${canvas.url}frames/${frame.page}/${source.file}`)
        await page.evaluate((value) => {
          document.documentElement.setAttribute('data-theme', value)
          for (const el of document.querySelectorAll('[style]')) {
            if (/#ffd400/i.test(el.getAttribute('style') ?? '')) el.remove()
          }
        }, theme)
        await page.evaluate(() => document.fonts.ready)
        const png = `${frame.name}-${theme}.png`
        output.set(
          join(frame.folder, png),
          await page.screenshot({ animations: 'disabled' }),
        )
        names.push(png)
      } finally {
        await context.close()
      }
    }
  }
  return {
    ref: `${frame.folder}/${frame.name}`,
    box: `${box.width}x${box.height}`,
    files: names,
  }
}

async function run(check: boolean): Promise<number> {
  const index = readFileSync(INDEX, 'utf8')
  const carried = parseCarried(index)
  const { canvas, server } = await serveCanvas()
  try {
    const files = listCanvas(canvas.content)
    const { frames, missing, clashes } = resolveCarried(carried, files)
    if (missing.length > 0) {
      throw new SyncRefused(
        `No canvas file for: ${missing.join(', ')}. Nothing written.`,
      )
    }
    if (clashes.length > 0) {
      throw new SyncRefused(
        `Two frames write ${clashes.join(', ')}. Nothing written.`,
      )
    }
    const unmapped = uncarriedPicked(carried, files)
    for (const ref of unmapped) {
      console.error(`Picked on the canvas but not in the index: ${ref}`)
    }

    const output: Output = new Map()
    const rows: FileRow[] = []
    const browser = await chromium.launch()
    try {
      for (const frame of frames) {
        rows.push(await captureFrame(browser, canvas, frame, output))
      }
    } finally {
      await browser.close()
    }
    for (const kit of KIT_FILES) {
      output.set(
        join('kit', kit),
        readFileSync(join(canvas.content, '01-kit', kit)),
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
      const owed =
        drift.changed.length +
        drift.missing.length +
        drift.stray.length +
        unmapped.length
      if (owed === 0) console.log('canon/design/ matches the canvas.')
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
    writeFileSync(INDEX, spliceFilesSection(index, renderFilesSection(rows)))
    spawnSync(join(ROOT, 'node_modules', '.bin', 'oxfmt'), [INDEX], {
      stdio: 'inherit',
    })
    console.log(`Wrote ${output.size} files to canon/design/.`)
    return 0
  } finally {
    server.kill()
  }
}

try {
  process.exitCode = await run(process.argv.includes('--check'))
} catch (error) {
  console.error(error instanceof SyncRefused ? error.message : error)
  process.exitCode = 1
}
