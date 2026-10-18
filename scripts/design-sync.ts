// Lands the canvas's accepted designs in canon/design/: a PNG per theme and
// the frame HTML beside it, for every frame canon/design/index.md carries.
// `--check` writes nothing and exits 1 when the canvas has drifted from the
// folder. Needs the canon CLI on PATH, which serves the main root's canvas.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative } from 'node:path'

import { chromium } from '@playwright/test'

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
  stripPicked,
  THEMES,
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

const ROOT = join(import.meta.dirname, '..')
const DESIGN = join(ROOT, 'canon', 'design')
const INDEX = join(DESIGN, 'index.md')
const KIT_FILES = [
  '01-kit/kit.css',
  '01-kit/kit.js',
  '01-kit/vendor/rough.js',
  '01-kit/vendor/Geist-latin.woff2',
]

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

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
    fail('The canon CLI is not on PATH. Install the canon toolkit first.')
  }
  const port = await freePort()
  const server = spawn(
    'canon',
    ['canvas', 'serve', '--json', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
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
        reject(new Error(`canon canvas serve refused: ${line}`))
      }
    })
  })
  return { canvas, server }
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
  if (!box) fail(`No layout.json box for ${page}/${stem}.`)
  return box
}

function write(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

function trackedFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DESIGN, join(entry.parentPath, entry.name)))
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const index = readFileSync(INDEX, 'utf8')
  const carried = parseCarried(index)
  const { canvas, server } = await serveCanvas()
  try {
    const files = listCanvas(canvas.content)
    const { frames, missing } = resolveCarried(carried, files)
    if (missing.length > 0) {
      fail(`No canvas file for: ${missing.join(', ')}. Nothing written.`)
    }
    const unmapped = uncarriedPicked(carried, files)
    for (const ref of unmapped) {
      console.error(`Picked on the canvas but not in the index: ${ref}`)
    }

    if (check) {
      const canvasHtml = new Map<string, string>()
      const trackedHtml = new Map<string, string>()
      for (const frame of frames) {
        for (const { file } of sourceFiles(frame)) {
          const path = join(frame.page, file)
          canvasHtml.set(path, readFileSync(join(canvas.content, path), 'utf8'))
          if (existsSync(join(DESIGN, path))) {
            trackedHtml.set(path, readFileSync(join(DESIGN, path), 'utf8'))
          }
        }
      }
      const drift = classifyDrift(canvasHtml, trackedHtml)
      for (const path of drift.changed) console.error(`Changed: ${path}`)
      for (const path of drift.missing) console.error(`Missing: ${path}`)
      if (drift.changed.length + drift.missing.length + unmapped.length > 0) {
        process.exit(1)
      }
      console.log('canon/design/ matches the canvas.')
      return
    }

    const written = new Set<string>()
    const rows: FileRow[] = []
    const browser = await chromium.launch()
    try {
      for (const frame of frames) {
        rows.push(await captureFrame(browser, canvas, frame, written))
      }
    } finally {
      await browser.close()
    }
    for (const kit of KIT_FILES) {
      write(join(DESIGN, kit), readFileSync(join(canvas.content, kit)))
      written.add(kit)
    }
    for (const path of trackedFiles(DESIGN)) {
      if (path === 'index.md' || written.has(path)) continue
      rmSync(join(DESIGN, path))
    }
    write(INDEX, spliceFilesSection(index, renderFilesSection(rows)))
    spawnSync(join(ROOT, 'node_modules', '.bin', 'oxfmt'), [INDEX], {
      stdio: 'inherit',
    })
    console.log(`Wrote ${written.size} files to canon/design/.`)
  } finally {
    server.kill()
  }
}

async function captureFrame(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  canvas: Canvas,
  frame: CarriedFrame,
  written: Set<string>,
): Promise<FileRow> {
  const sources = sourceFiles(frame)
  const first = sources[0]
  if (!first) fail(`No source for ${frame.page}/${frame.stem}.`)
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
    const htmlPath = join(frame.page, source.file)
    write(join(DESIGN, htmlPath), stripPicked(html))
    written.add(htmlPath)
    names.push(source.file)
    for (const theme of frame.single ? THEMES : [source.theme]) {
      const context = await browser.newContext({
        viewport: { width: box.width, height: box.height },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      await page.goto(`${canvas.url}frames/${frame.page}/${source.file}`)
      await page.evaluate((value) => {
        document.documentElement.setAttribute('data-theme', value)
        for (const el of document.querySelectorAll('[style]')) {
          if (/#ffd400/i.test(el.getAttribute('style') ?? '')) el.remove()
        }
      }, theme)
      await page.evaluate(() => document.fonts.ready)
      const png = `${frame.stem}-${theme}.png`
      const pngPath = join(frame.page, png)
      write(
        join(DESIGN, pngPath),
        await page.screenshot({ animations: 'disabled' }),
      )
      written.add(pngPath)
      names.push(png)
      await context.close()
    }
  }
  return {
    ref: `${frame.page}/${frame.stem}`,
    box: `${box.width}x${box.height}`,
    files: names,
  }
}

await main()
