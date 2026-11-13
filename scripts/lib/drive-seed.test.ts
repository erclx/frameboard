import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { claim, readClaims } from '@/server/claims/store'

import { seedDrive } from './drive-seed.ts'

const FIXTURE = join(
  import.meta.dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'boards',
  'basic',
)

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'drive-seed-'))
  cpSync(FIXTURE, root, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function crowdLayout(): Record<string, Box> {
  return (
    readJson('marketing/crowd/layout.json') as { frames: Record<string, Box> }
  ).frames
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

describe('the crowd page', () => {
  it('lays 40 frames, each with a layout entry and an HTML file', async () => {
    await seedDrive(root, new Date())

    const html = readdirSync(join(root, 'marketing/crowd'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => name.replace(/\.html$/, ''))
      .sort()
    expect(html).toHaveLength(40)
    expect(Object.keys(crowdLayout()).sort()).toEqual(html)
  })

  it('places no frame over another', async () => {
    await seedDrive(root, new Date())

    const boxes = Object.values(crowdLayout())
    const overlapping = boxes.flatMap((a, i) =>
      boxes.slice(i + 1).filter((b) => overlaps(a, b)),
    )
    expect(overlapping).toEqual([])
  })

  it("lists the page after the fixture's own, ahead of the motion and raw pages", async () => {
    await seedDrive(root, new Date())

    expect(readJson('marketing/project.json')).toMatchObject({
      pages: ['launch', 'states', 'crowd', 'motion', 'raw'],
    })
  })

  it('leaves a hand-edited crowd page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'marketing/crowd/crowd-01.html')
    writeFileSync(edited, '<p>edited by a reel</p>')
    rmSync(join(root, 'marketing/crowd/crowd-40.html'))

    await seedDrive(root, new Date())

    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
    expect(readdirSync(join(root, 'marketing/crowd'))).not.toContain(
      'crowd-40.html',
    )
  })

  it('keeps a changed page order on a second seed', async () => {
    await seedDrive(root, new Date())
    writeFileSync(
      join(root, 'marketing/project.json'),
      JSON.stringify({ version: 1, pages: ['crowd', 'launch', 'states'] }),
    )

    await seedDrive(root, new Date())

    expect(readJson('marketing/project.json')).toMatchObject({
      pages: ['crowd', 'launch', 'states'],
    })
  })
})

describe('the motion page', () => {
  it('lays one desktop frame whose box slides on a finite timeline', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.motion).toBe('laid')
    expect(readJson('marketing/motion/layout.json')).toEqual({
      version: 1,
      frames: {
        slide: {
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
          order: 0,
          hidden: false,
          locked: false,
        },
      },
    })
    expect(
      readFileSync(join(root, 'marketing/motion/slide.html'), 'utf8'),
    ).toContain('animation: slide 4s linear forwards')
  })

  it('leaves a hand-edited motion page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'marketing/motion/slide.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.motion).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the raw colors page', () => {
  /** A token's light value as the fixture's board sheet states it. */
  function lightValue(token: string): string {
    const sheet = readFileSync(join(root, 'tokens.css'), 'utf8')
    const light = sheet.slice(0, sheet.indexOf('[data-theme'))
    const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(light)
    if (!value?.[1]) throw new Error(`The board sheet sets no ${token}`)
    return value[1]
  }

  it('lays one frame stating primary’s light value raw beside a color no token holds', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'marketing/raw/swatches.html'), 'utf8')
    expect(seeded.raw).toBe('laid')
    expect(html).toContain(
      `data-name="Equal" style="color: ${lightValue('--primary')}"`,
    )
    expect(html).toContain('data-name="Unequal" style="color: #be123c"')
    expect(
      Object.keys(
        (readJson('marketing/raw/layout.json') as { frames: object }).frames,
      ),
    ).toEqual(['swatches'])
  })

  it('leaves a hand-edited raw colors page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'marketing/raw/swatches.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.raw).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the settings reservation', () => {
  it('holds three boxes on webapp/settings live at the real clock', async () => {
    await seedDrive(root, new Date())

    const live = await readClaims(root, new Date())
    expect(live.map((each) => each.frame).sort()).toEqual([
      'webapp/settings/billing',
      'webapp/settings/security',
      'webapp/settings/team',
    ])
    expect(live.every((each) => each.box)).toBe(true)
  })

  it('outlives a reel window of an hour', async () => {
    await seedDrive(root, new Date())

    const later = new Date(Date.now() + 60 * 60_000)
    expect(await readClaims(root, later)).toHaveLength(3)
  })

  it('holds one set after a second seed', async () => {
    await seedDrive(root, new Date())

    await seedDrive(root, new Date())

    const live = await readClaims(root, new Date())
    expect(live).toHaveLength(3)
    expect(new Set(live.map((each) => each.set)).size).toBe(1)
  })

  it('drops a claim in .run that lapses before the day-ahead stamp', async () => {
    await claim(
      root,
      {
        frame: 'webapp/home/hero',
        session: 'drive-review',
        agent: 'claude',
        tag: 'claude · basic',
      },
      new Date(),
    )

    await seedDrive(root, new Date())

    const live = await readClaims(root, new Date())
    expect(live.map((each) => each.frame).sort()).toEqual([
      'webapp/settings/billing',
      'webapp/settings/security',
      'webapp/settings/team',
    ])
  })
})
