import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scanBoard } from '@/server/board/scan'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  createFrameKeys,
  createRememberedStore,
  type FrameKeys,
  type RememberedFrame,
  rememberedPath,
} from './remembered'

const HERO = 'site/home/hero'

let board: TempBoard

afterEach(() => {
  vi.useRealTimers()
  board.cleanup()
})

function write(path: string, contents: string) {
  const file = join(board.root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

async function frameOf(ref: string): Promise<FrameRecord> {
  const { projects } = await scanBoard(board.root)
  const frame = projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .find((each) => each.ref === ref)
  if (!frame) throw new Error(`No frame ${ref}.`)
  return frame
}

/** The keys a fresh start gives a frame, `change` standing in for an edit to its record. */
async function keysOf(
  ref: string,
  {
    tokens,
    version,
    change = {},
  }: {
    tokens?: string
    version?: string
    change?: Partial<FrameRecord>
  } = {},
): Promise<FrameKeys> {
  const keys = await createFrameKeys(board.root, { tokens, version }).of({
    ...(await frameOf(ref)),
    ...change,
  })
  if (!keys) throw new Error(`No keys for ${ref}.`)
  return keys
}

describe('createFrameKeys', () => {
  beforeEach(() => {
    board = writeBoard({
      'site/project.json': '{ "version": 1, "pages": ["home"] }',
      'site/assets/photo.png': 'photo',
      'site/home/hero.html': '<p>hero</p>',
      'site/home/about.html': '<p>about</p>',
      'site/home/styles.css': 'p { color: red }',
      'site/blog/post.html': '<p>post</p>',
      'site/home/layout.json': JSON.stringify({
        version: 1,
        frames: { hero: { x: 0, y: 0, width: 1440, height: 900, order: 0 } },
      }),
      'other/home/hero.html': '<p>hero</p>',
    })
  })

  it('holds every key still while nothing moved', async () => {
    const before = await keysOf(HERO)

    const after = await keysOf(HERO)

    expect(after.checks).toBe(before.checks)
    expect(after.rendered).toBe(before.rendered)
    expect(after.measured()).toBe(before.measured())
  })

  it.each([
    ["the frame's own bytes", 'site/home/hero.html', '<p>new</p>'],
    ['an asset', 'site/assets/photo.png', 'another photo'],
    ['a new asset', 'site/assets/kits/dark/kit.css', 'p {}'],
    ['the project file', 'site/project.json', '{ "version": 1, "pages": [] }'],
    ['the project token sheet', 'site/tokens.css', ':root { --ink: #000 }'],
    ['the board token sheet', 'tokens.css', ':root { --ink: #000 }'],
    ['a sheet beside the frame', 'site/home/styles.css', 'p { color: blue }'],
    ['a file in a folder of the page', 'site/home/img/icon.svg', '<svg/>'],
  ])('moves every key on %s', async (_name, path, contents) => {
    const before = await keysOf(HERO)

    write(path, contents)
    const after = await keysOf(HERO)

    expect(after.checks).not.toBe(before.checks)
    expect(after.rendered).not.toBe(before.rendered)
    expect(after.measured()).not.toBe(before.measured())
  })

  it('moves on an asset rewritten at the same size', async () => {
    const before = await keysOf(HERO)
    const path = join(board.root, 'site/assets/photo.png')
    const later = new Date(statSync(path).mtimeMs + 1000)

    writeFileSync(path, 'other')
    utimesSync(path, later, later)

    expect((await keysOf(HERO)).checks).not.toBe(before.checks)
  })

  it('moves on a link in the assets pointed at another file', async () => {
    write('site/assets/a.css', 'p {}')
    write('site/assets/b.css', 'q {}')
    const [a, b] = ['a.css', 'b.css'].map((name) =>
      join(board.root, 'site/assets', name),
    ) as [string, string]
    utimesSync(b, statSync(a).mtime, statSync(a).mtime)
    utimesSync(a, statSync(a).mtime, statSync(a).mtime)
    const link = join(board.root, 'site/assets/theme.css')
    symlinkSync(a, link)
    const before = await keysOf(HERO)

    rmSync(link)
    symlinkSync(b, link)

    expect((await keysOf(HERO)).checks).not.toBe(before.checks)
  })

  it('reads a link back to its own folder once', async () => {
    symlinkSync(
      join(board.root, 'site/assets'),
      join(board.root, 'site/assets/loop'),
    )

    await expect(keysOf(HERO)).resolves.toBeDefined()
  })

  it("holds still on a neighbor's write, another project's, and the page's records", async () => {
    const before = await keysOf(HERO)

    write('site/home/about.html', '<p>new</p>')
    write('site/home/about.html.swap', '<p>newer</p>')
    write('site/home/added.html', '<p>added</p>')
    write('site/home/notes.json', '{ "version": 1, "notes": [] }')
    write('site/home/.draft.css', 'p {}')
    write('site/assets/photo.png.license.json', '{}')
    write('site/blog/post.html', '<p>new</p>')
    write('other/assets/photo.png', 'photo')
    const after = await keysOf(HERO)

    expect(after.checks).toBe(before.checks)
    expect(after.rendered).toBe(before.rendered)
  })

  it('moves a frame embedding a neighbor when one leaves', async () => {
    write('site/home/hero.html', '<iframe src="about.html"></iframe>')
    const before = await keysOf(HERO)

    rmSync(join(board.root, 'site/home/about.html'))

    expect((await keysOf(HERO)).checks).not.toBe(before.checks)
  })

  it('holds still on a rewrite that leaves the frame its bytes', async () => {
    const before = await keysOf(HERO)
    const later = new Date(Date.now() + 5000)

    utimesSync(join(board.root, 'site/home/hero.html'), later, later)

    expect((await keysOf(HERO)).checks).toBe(before.checks)
  })

  it.each([
    ["a neighbor page's sheet", 'site/blog/shared.css', '../blog/shared.css'],
    [
      "another project's script",
      'other/assets/app.js',
      '../../other/assets/app.js',
    ],
    ['a dot-named sheet beside it', 'site/home/.draft.css', '.draft.css'],
  ])('moves on %s the frame loads', async (_name, path, url) => {
    write(path, 'p { color: red }')
    write(
      'site/home/hero.html',
      path.endsWith('.js')
        ? `<script src="${url}"></script>`
        : `<link rel="stylesheet" href="${url}">`,
    )
    const before = await keysOf(HERO)

    write(path, 'p { color: rebeccapurple }')
    const after = await keysOf(HERO)

    expect(after.checks).not.toBe(before.checks)
    expect(after.rendered).not.toBe(before.rendered)
    expect(before.outside).toEqual([path])
  })

  it('moves on a sheet a file in the assets imports from another page', async () => {
    write('site/assets/theme.css', '@import "../blog/shared.css";')
    write('site/blog/shared.css', 'p { color: red }')
    write(
      'site/home/hero.html',
      '<link rel="stylesheet" href="../assets/theme.css">',
    )
    const before = await keysOf(HERO)

    write('site/blog/shared.css', 'p { color: blue }')

    expect((await keysOf(HERO)).checks).not.toBe(before.checks)
  })

  it('moves on a missing file outside its folders arriving', async () => {
    write('site/home/hero.html', '<img src="../blog/late.png">')
    const before = await keysOf(HERO)

    write('site/blog/late.png', 'late')

    expect((await keysOf(HERO)).checks).not.toBe(before.checks)
  })

  it('gives the same keys for the outside files a start stored', async () => {
    write('site/blog/shared.css', 'p { color: red }')
    write(
      'site/home/hero.html',
      '<link rel="stylesheet" href="../blog/shared.css">',
    )
    const before = await keysOf(HERO)

    const after = await createFrameKeys(board.root).of(
      await frameOf(HERO),
      before.outside,
    )

    expect(after?.checks).toBe(before.checks)
  })

  it('covers no file outside for a frame loading its own folders alone', async () => {
    write(
      'site/home/hero.html',
      '<link rel="stylesheet" href="styles.css"><img src="../assets/photo.png">',
    )

    expect((await keysOf(HERO)).outside).toEqual([])
  })

  it('moves on the frame naming another kit', async () => {
    const before = await keysOf(HERO)

    const after = await keysOf(HERO, { change: { kit: 'dark' } })

    expect(after.checks).not.toBe(before.checks)
  })

  it('moves on an edit to the --tokens sheet, and on a start without one', async () => {
    const tokens = join(board.root, '../brand.css')
    writeFileSync(tokens, ':root { --ink: #111 }')
    const before = await keysOf(HERO, { tokens })

    writeFileSync(tokens, ':root { --ink: #222 }')
    const edited = await keysOf(HERO, { tokens })
    const without = await keysOf(HERO)

    expect(edited.checks).not.toBe(before.checks)
    expect(without.checks).not.toBe(edited.checks)
  })

  it('moves on another Frameboard version', async () => {
    const before = await keysOf(HERO, { version: '0.49.0' })

    const after = await keysOf(HERO, { version: '0.50.0' })

    expect(after.checks).not.toBe(before.checks)
    expect(after.rendered).not.toBe(before.rendered)
  })

  it.each<[string, Partial<FrameRecord>]>([
    ['its box', { box: { x: 0, y: 0, width: 1440, height: 400 } }],
    ['its linked widths', { widths: [{ width: 390, height: 844 }] }],
    ['its device', { device: 'phone' }],
    ['its turn', { turn: 'left' }],
    ['scroll', { scroll: true }],
    ['a hugged height', { hugHeight: true }],
  ])('moves the browser key alone on %s', async (_name, change) => {
    const before = await keysOf(HERO)

    const after = await keysOf(HERO, { change })

    expect(after.rendered).not.toBe(before.rendered)
    expect(after.checks).toBe(before.checks)
  })

  it('holds the browser key still on a move across the canvas', async () => {
    const before = await keysOf(HERO)

    const after = await keysOf(HERO, {
      change: { box: { x: 500, y: 80, width: 1440, height: 900 } },
    })

    expect(after.rendered).toBe(before.rendered)
  })

  it('gives a measure the key a start reads once its size is written', async () => {
    const hugging = { hugHeight: true, widths: [{ width: 390, height: 844 }] }
    const measured = await keysOf(HERO, { change: hugging })

    const stored = await keysOf(HERO, {
      change: {
        ...hugging,
        box: { x: 0, y: 0, width: 1440, height: 1200 },
        widths: [{ width: 390, height: 2000 }],
      },
    })

    expect(
      measured.measured({
        width: 1600,
        height: 1200,
        widths: [{ width: 390, height: 2000 }],
      }),
    ).toBe(stored.measured())
  })

  it('moves the measure key on a stored size changed by hand', async () => {
    const before = await keysOf(HERO, { change: { hugHeight: true } })

    const after = await keysOf(HERO, {
      change: {
        hugHeight: true,
        box: { x: 0, y: 0, width: 1440, height: 300 },
      },
    })

    expect(after.measured()).not.toBe(before.measured())
  })

  it.each([
    ['site/assets/photo.png', 'another photo'],
    ['site/home/styles.css', 'p { color: blue }'],
    ['tokens.css', ':root { --ink: #000 }'],
  ])('reads %s again once a batch drops it', async (path, contents) => {
    const keys = createFrameKeys(board.root)
    const frame = await frameOf(HERO)
    const before = await keys.of(frame)
    write(path, contents)

    keys.drop([join(board.root, path)])

    expect((await keys.of(frame))?.checks).not.toBe(before?.checks)
  })

  it('reads the --tokens sheet again once a batch drops it', async () => {
    const tokens = join(board.root, '../brand.css')
    writeFileSync(tokens, ':root { --ink: #111 }')
    const keys = createFrameKeys(board.root, { tokens })
    const frame = await frameOf(HERO)
    const before = await keys.of(frame)
    writeFileSync(tokens, ':root { --ink: #222 }')

    keys.drop([tokens])

    expect((await keys.of(frame))?.checks).not.toBe(before?.checks)
  })

  it.each(['./', '.', '?v=2', '../assets'])(
    'gives a frame whose sheet link names the folder %s no keys',
    async (href) => {
      write('site/home/hero.html', `<link rel="stylesheet" href="${href}">`)

      const keys = await createFrameKeys(board.root).of(await frameOf(HERO))

      expect(keys).toBeNull()
    },
  )

  it('gives a frame whose file is gone no keys', async () => {
    const frame = await frameOf(HERO)
    rmSync(frame.path)

    expect(await createFrameKeys(board.root).of(frame)).toBeNull()
  })
})

describe('createRememberedStore', () => {
  const FINDING: Finding = {
    rule: 'clipped',
    severity: 'error',
    frame: HERO,
    path: 'site/home/hero.html',
    message: 'cut off',
    location: { line: 1, column: 1, startOffset: 0, endOffset: 4 },
    width: 390,
  }
  const FRAMES: Record<string, RememberedFrame> = {
    [HERO]: {
      checks: { key: 'a', findings: [] },
      rendered: { key: 'b', findings: [FINDING] },
      measured: 'c',
      outside: ['site/blog/shared.css'],
    },
  }

  beforeEach(() => {
    board = writeBoard({ 'site/home/hero.html': '<p>hero</p>' })
  })

  it('reads back what a closed server saved', async () => {
    const store = createRememberedStore(board.root, () => FRAMES)
    store.saveSoon()
    await store.close()

    const next = createRememberedStore(board.root, () => ({}))

    expect(await next.load()).toEqual(FRAMES)
  })

  it('saves a run of results once, a while after the first', async () => {
    vi.useFakeTimers()
    let reads = 0
    const store = createRememberedStore(board.root, () => {
      reads += 1
      return FRAMES
    })

    store.saveSoon()
    await vi.advanceTimersByTimeAsync(1500)
    store.saveSoon()
    await vi.advanceTimersByTimeAsync(1500)
    vi.useRealTimers()
    await store.close()

    expect(reads).toBe(1)
  })

  it('writes nothing for a server that learned nothing', async () => {
    const store = createRememberedStore(board.root, () => FRAMES)

    await store.close()

    expect(existsSync(rememberedPath(board.root))).toBe(false)
  })

  it.each([
    ['a missing store', null],
    ['one that does not parse', '{"version": 1, "fra'],
    ['one of a newer version', JSON.stringify({ version: 2, frames: FRAMES })],
    [
      'one whose shape is not known',
      JSON.stringify({ version: 1, frames: { [HERO]: { checks: 'clean' } } }),
    ],
  ])('reads %s as empty', async (_name, contents) => {
    const path = rememberedPath(board.root)
    mkdirSync(dirname(path), { recursive: true })
    if (contents !== null) writeFileSync(path, contents)

    expect(await createRememberedStore(board.root, () => ({})).load()).toEqual(
      {},
    )
  })
})
