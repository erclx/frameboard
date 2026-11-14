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

import { listTransitionNames } from '@/server/board/transitions'
import { checkFrame } from '@/server/checks/frame'
import { claim, readClaims } from '@/server/claims/store'

import { seedDrive, type Seeded } from './drive-seed.ts'

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

  it("lists the page after the fixture's own, ahead of the motion page", async () => {
    await seedDrive(root, new Date())

    expect(readJson('marketing/project.json')).toMatchObject({
      pages: ['launch', 'states', 'crowd', 'motion'],
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
      JSON.stringify({
        version: 1,
        pages: ['crowd', 'launch', 'motion', 'states'],
      }),
    )

    await seedDrive(root, new Date())

    expect(readJson('marketing/project.json')).toMatchObject({
      pages: ['crowd', 'launch', 'motion', 'states'],
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
  /** A token's light value as the webapp project's own sheet states it. */
  function lightValue(token: string): string {
    const sheet = readFileSync(join(root, 'webapp/tokens.css'), 'utf8')
    const light = sheet.slice(0, sheet.indexOf('[data-theme'))
    const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(light)
    if (!value?.[1]) throw new Error(`The webapp sheet sets no ${token}`)
    return value[1]
  }

  it('lays one webapp frame stating its own accent raw beside a color no token holds', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/raw/swatches.html'), 'utf8')
    expect(seeded.raw).toBe('laid')
    expect(html).toContain(
      `data-name="Equal" style="color: ${lightValue('--accent')}"`,
    )
    expect(html).toContain('data-name="Unequal" style="color: #be123c"')
    expect(
      Object.keys(
        (readJson('webapp/raw/layout.json') as { frames: object }).frames,
      ),
    ).toEqual(['swatches'])
  })

  it("lists the page after the webapp project's own", async () => {
    await seedDrive(root, new Date())

    expect(readJson('webapp/project.json')).toMatchObject({
      pages: ['settings', 'home', 'raw', 'feed', 'deck', 'shapes', 'stacked'],
    })
  })

  it('leaves a hand-edited raw colors page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/raw/swatches.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.raw).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the scroll feed page', () => {
  it('lays one phone frame that scrolls a page longer than its screen', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.feed).toBe('laid')
    expect(readJson('webapp/feed/layout.json')).toMatchObject({
      frames: { 'feed-scroll': { width: 390, height: 844, scroll: true } },
    })
    expect(
      readFileSync(join(root, 'webapp/feed/feed-scroll.html'), 'utf8'),
    ).toContain('data-name="Section 12"')
  })

  it('lists the page after the raw colors page', async () => {
    await seedDrive(root, new Date())

    expect(readJson('webapp/project.json')).toMatchObject({
      pages: ['settings', 'home', 'raw', 'feed', 'deck', 'shapes', 'stacked'],
    })
  })

  it('leaves a hand-edited feed page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/feed/feed-scroll.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.feed).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the deck page', () => {
  it('lays three slides in a row with a page transition', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.deck).toBe('laid')
    expect(readJson('webapp/deck/layout.json')).toMatchObject({
      present: { transition: { name: 'push', ms: 500 } },
      frames: {
        '01-intro': { x: 0, order: 0 },
        '02-build': { x: 1360, order: 1 },
        '03-closing': { x: 2720, order: 2 },
      },
    })
  })

  it("brings the closing slide in with a transition the board lists as webapp's own", async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.transition).toBe('laid')
    expect(await listTransitionNames(join(root, 'webapp'))).toEqual(['wipe'])
    expect(readJson('webapp/deck/layout.json')).toMatchObject({
      frames: { '03-closing': { transition: { name: 'wipe', ms: 700 } } },
    })
  })

  it('leaves a hand-edited transition alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/assets/transitions/wipe.css')
    writeFileSync(edited, '@keyframes enter { from { opacity: 0 } }')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.transition).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe(
      '@keyframes enter { from { opacity: 0 } }',
    )
  })

  it('marks three steps on the middle slide, the last after the one before', async () => {
    await seedDrive(root, new Date())

    const build = readFileSync(join(root, 'webapp/deck/02-build.html'), 'utf8')
    expect(build).toContain('data-step="1"')
    expect(build).toMatch(/data-step="2"\s+data-step-effect="fly"/)
    expect(build).toMatch(/data-step="3"\s+data-step-effect="fade"/)
  })

  it('leaves a hand-edited deck page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/deck/02-build.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.deck).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the free shapes page', () => {
  it('lays one frame of free elements beside one in the flow', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/shapes/group.html'), 'utf8')
    expect(seeded.shapes).toBe('laid')
    expect(html.match(/position: absolute/g)).toHaveLength(4)
    expect(html).toContain(
      '<p data-name="Flowing" style="margin: 0; padding: 40px 160px">',
    )
  })

  it('leaves a hand-edited shapes page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/shapes/group.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.shapes).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})

describe('the stacked page', () => {
  const rulesOf = (name: string) =>
    checkFrame({ root, project: 'webapp', page: 'stacked', name }).findings.map(
      (finding) => `${finding.rule}:${finding.severity}`,
    )

  it('lays three frames in a column, each 8 px under the one above', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.stacked).toBe('laid')
    expect(readJson('webapp/stacked/layout.json')).toMatchObject({
      frames: {
        top: { x: 0, y: 0, height: 240 },
        warned: { x: 0, y: 248, height: 240 },
        broken: { x: 0, y: 496, height: 240 },
      },
    })
  })

  it('gives the lower two frames a warning alone and an error alone', async () => {
    await seedDrive(root, new Date())

    expect({
      top: rulesOf('top'),
      warned: rulesOf('warned'),
      broken: rulesOf('broken'),
    }).toEqual({
      top: [],
      warned: ['generic-font:warning'],
      broken: ['theme:error'],
    })
  })

  it('leaves a hand-edited stacked page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/stacked/warned.html')
    writeFileSync(edited, '<p>edited</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.stacked).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited</p>')
  })
})

describe('a kept page whose project listing was reset', () => {
  it.each<{
    project: string
    page: Exclude<keyof Seeded, 'reserved'>
    own: string[]
  }>([
    { project: 'marketing', page: 'crowd', own: ['launch', 'states'] },
    { project: 'marketing', page: 'motion', own: ['launch', 'states'] },
    { project: 'webapp', page: 'raw', own: ['settings', 'home'] },
    { project: 'webapp', page: 'feed', own: ['settings', 'home'] },
    { project: 'webapp', page: 'deck', own: ['settings', 'home'] },
    { project: 'webapp', page: 'shapes', own: ['settings', 'home'] },
    { project: 'webapp', page: 'stacked', own: ['settings', 'home'] },
  ])('lists $project/$page again', async ({ project, page, own }) => {
    await seedDrive(root, new Date())
    writeFileSync(
      join(root, project, 'project.json'),
      JSON.stringify({ version: 1, pages: own }),
    )

    const seeded = await seedDrive(root, new Date())

    expect(seeded[page]).toBe('kept')
    expect(
      (readJson(`${project}/project.json`) as { pages: string[] }).pages,
    ).toContain(page)
  })

  it('leaves a project file that already lists every page byte for byte', async () => {
    await seedDrive(root, new Date())
    const path = join(root, 'marketing/project.json')
    const listed = '{"version":1,"pages":["motion","crowd","launch","states"]}'
    writeFileSync(path, listed)

    await seedDrive(root, new Date())

    expect(readFileSync(path, 'utf8')).toBe(listed)
  })

  it('keeps a kept page whose project file is missing without throwing', async () => {
    await seedDrive(root, new Date())
    rmSync(join(root, 'marketing/project.json'))

    const seeded = await seedDrive(root, new Date())

    expect(seeded.crowd).toBe('kept')
    expect(seeded.motion).toBe('kept')
    expect(readdirSync(join(root, 'marketing'))).not.toContain('project.json')
  })
})

describe('the Drives folder', () => {
  it('files two projects of one page each in one folder', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.folder).toBe('laid')
    expect([
      readJson('drive-app/project.json'),
      readJson('drive-site/project.json'),
    ]).toEqual([
      { version: 1, pages: ['home'], group: 'Drives' },
      { version: 1, pages: ['home'], group: 'Drives' },
    ])
    expect(readdirSync(join(root, 'drive-app/home'))).toContain('layout.json')
  })

  it('leaves a folder a reel deleted from alone on a second seed', async () => {
    await seedDrive(root, new Date())
    rmSync(join(root, 'drive-site'), { recursive: true })

    const seeded = await seedDrive(root, new Date())

    expect(seeded.folder).toBe('kept')
    expect(readdirSync(root)).not.toContain('drive-site')
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
