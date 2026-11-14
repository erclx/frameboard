import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { reserve } from '@/server/claims/store'
import { FRAME_GAP, FRAME_SIZES } from '@/shared/frame-sizes'

/** The page a reel pans across, which no committed board carries. */
const CROWD = { project: 'marketing', page: 'crowd', count: 40, columns: 8 }

/**
 * The page holding one frame whose box slides across over four seconds, so
 * the Motion section, its track, and the Held chip have a timeline to drive.
 */
const MOTION = { project: 'marketing', page: 'motion', frame: 'slide' }

/** A box sliding 1000 px right over four seconds and holding there, in the board's tokens. */
const SLIDE_PAGE = join(import.meta.dirname, 'drive-slide.html')

/**
 * The page holding one frame whose text states raw colors, one equal to
 * webapp's own accent in light and one equal to no token, so the
 * inspector's `Use <token>` swap has a row to offer it on and a row to
 * leave plain. Webapp's own sheet sets that accent, so the swap still
 * offers on a board served with a `--tokens` sheet holding no color.
 */
const RAW = { project: 'webapp', page: 'raw', frame: 'swatches' }

const RAW_PAGE = join(import.meta.dirname, 'drive-raw.html')

/**
 * The page holding one phone frame on Scroll over a feed about twice its
 * screen, so the rail, the Height row's round trip, and a scroll frame with
 * no overflow ghost have a frame to show.
 */
const FEED = { project: 'webapp', page: 'feed', frame: 'feed-scroll' }

const FEED_PAGE = join(import.meta.dirname, 'drive-feed.html')

/**
 * The page holding three slides in a row under a Push transition, the middle
 * one marking three steps, so present mode has a transition to draw, a slide
 * to walk, and the inspector a page and a step to read.
 */
const DECK = {
  project: 'webapp',
  page: 'deck',
  slides: ['01-intro', '02-build', '03-closing'],
  width: 1280,
  height: 720,
}

const DECK_PAGES = join(import.meta.dirname, 'drive-deck')

/**
 * The transition of webapp's own the deck's closing slide arrives with, so
 * present mode has a project's keyframes to play and the inspector's two
 * lists a name to show after the built-ins.
 */
const WIPE = { project: 'webapp', name: 'wipe', ms: 700 }

const WIPE_SHEET = join(import.meta.dirname, 'drive-transition.css')

/**
 * The page holding one frame of two free shapes, two free texts side by
 * side, and one text in the flow, so a group has members to box, move,
 * scale, align, and wrap, and Arrange has a selection it refuses.
 */
const GROUP = { project: 'webapp', page: 'shapes', frame: 'group' }

const GROUP_PAGE = join(import.meta.dirname, 'drive-group.html')

/**
 * The page holding three frames in a column 8 px apart, a clean one over one
 * with a warning alone over one with an error, so the lower two labels have
 * no room at any zoom and each frame's corner dot shows in its own hue.
 */
const STACKED = {
  project: 'webapp',
  page: 'stacked',
  width: 640,
  height: 240,
  gap: 8,
  frames: [
    { name: 'top', style: 'font-family: var(--font-text)' },
    { name: 'warned', style: 'font-family: sans-serif' },
    {
      name: 'broken',
      style:
        'background: #fafafa; color: #222222; font-family: var(--font-text)',
    },
  ],
}

/** The folder home opens on in a reel, holding two projects the fixture lacks. */
const FOLDER = { name: 'Drives', projects: ['drive-app', 'drive-site'] }

/** The frames reserved beside `webapp/settings/profile`, which ends at x 834. */
const RESERVED = ['billing', 'security', 'team']
const SETTINGS_RIGHT = 834

/**
 * How far ahead of the real clock the reservation is stamped. `reserve` takes
 * its `now` as the base of a five-minute `expiresAt`, so a day's lead keeps the
 * claim live across a whole drive without a write that bypasses the store.
 * The same `now` is `reserve`'s live cutoff, so a five-minute claim another
 * session holds when the seed runs reads as lapsed and is dropped.
 */
export const HOLD_AHEAD_MS = 24 * 60 * 60_000

/** The session the seed holds its reservation as, apart from a drive's own `drive-review`. */
const SESSION = 'drive-seed'

export interface Seeded {
  /** Whether the crowd page was laid now or was already there and kept. */
  crowd: 'laid' | 'kept'
  /** Whether the motion page was laid now or was already there and kept. */
  motion: 'laid' | 'kept'
  /** Whether the raw colors page was laid now or was already there and kept. */
  raw: 'laid' | 'kept'
  /** Whether the scroll feed page was laid now or was already there and kept. */
  feed: 'laid' | 'kept'
  /** Whether the deck page was laid now or was already there and kept. */
  deck: 'laid' | 'kept'
  /** Whether webapp's own transition was laid now or was already there and kept. */
  transition: 'laid' | 'kept'
  /** Whether the free shapes page was laid now or was already there and kept. */
  shapes: 'laid' | 'kept'
  /** Whether the stacked findings page was laid now or was already there and kept. */
  stacked: 'laid' | 'kept'
  /** Whether the Drives folder was laid now or was already there and kept. */
  folder: 'laid' | 'kept'
  /** The frame refs the reservation holds. */
  reserved: string[]
}

/**
 * Lays the states a drive films that the committed `basic` board lacks: a
 * 40-frame `marketing/crowd` page, a `marketing/motion` page whose one frame
 * animates, a `webapp/raw` page stating raw colors, a `webapp/feed` page
 * whose phone frame scrolls, a `webapp/deck` page of three slides under a
 * transition with one stepped and one arriving with webapp's own `wipe`, a `webapp/shapes` page of free elements, a `webapp/stacked` page of three frames whose lower two hide their labels, a Drives folder of two projects, and a live
 * reservation of three boxes on `webapp/settings`. A
 * page already present is left as a reel edited it, and the reservation
 * replaces the seed's own earlier set.
 */
export async function seedDrive(root: string, now: Date): Promise<Seeded> {
  // In turn, since both pages append to one project.json.
  const crowd = await layCrowd(root)
  const motion = await layOne(root, MOTION, SLIDE_PAGE)
  const raw = await layOne(root, RAW, RAW_PAGE)
  const { width, height } = FRAME_SIZES.phone
  const feed = await layOne(root, FEED, FEED_PAGE, {
    width,
    height,
    scroll: true,
  })
  const transition = await layTransition(root)
  const deck = await layDeck(root)
  const shapes = await layOne(root, GROUP, GROUP_PAGE)
  const stacked = await layStacked(root)
  const folder = await layFolder(root)
  const reserved = await reserveSettings(root, now)
  return {
    crowd,
    motion,
    raw,
    feed,
    deck,
    transition,
    shapes,
    stacked,
    folder,
    reserved,
  }
}

/**
 * Files two projects of one empty page each in the Drives folder, so a reel
 * opens a folder, renames it, and deletes a project out of it. A folder a reel
 * already changed is kept while either project is there.
 */
async function layFolder(root: string): Promise<'laid' | 'kept'> {
  if (FOLDER.projects.some((project) => existsSync(join(root, project))))
    return 'kept'
  await Promise.all(
    FOLDER.projects.map(async (project) => {
      await mkdir(join(root, project, 'home'), { recursive: true })
      await Promise.all([
        writeFile(
          join(root, project, 'home', 'layout.json'),
          `${JSON.stringify({ version: 1, frames: {} }, null, 2)}\n`,
        ),
        writeFile(
          join(root, project, 'project.json'),
          `${JSON.stringify({ version: 1, pages: ['home'], group: FOLDER.name }, null, 2)}\n`,
        ),
      ])
    }),
  )
  return 'laid'
}

async function layCrowd(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, CROWD.project, CROWD.page)
  if (existsSync(folder)) {
    await relistKept(root, CROWD.project, CROWD.page)
    return 'kept'
  }
  await mkdir(folder)

  const { width, height } = FRAME_SIZES.desktop
  const frames: Record<string, object> = {}
  const writes: Promise<void>[] = []
  for (let index = 0; index < CROWD.count; index++) {
    const name = `crowd-${String(index + 1).padStart(2, '0')}`
    frames[name] = {
      x: (index % CROWD.columns) * (width + FRAME_GAP),
      y: Math.floor(index / CROWD.columns) * (height + FRAME_GAP),
      width,
      height,
      order: index,
      hidden: false,
      locked: false,
    }
    writes.push(writeFile(join(folder, `${name}.html`), frameHtml(name, index)))
  }
  writes.push(
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    ),
    listPage(root, CROWD.project, CROWD.page),
  )
  await Promise.all(writes)
  return 'laid'
}

/**
 * Lays a page holding one frame copied from `source`, a desktop frame unless
 * `placed` gives its size and flags, unless the page is there.
 */
async function layOne(
  root: string,
  { project, page, frame }: { project: string; page: string; frame: string },
  source: string,
  placed: {
    width: number
    height: number
    scroll?: boolean
  } = FRAME_SIZES.desktop,
): Promise<'laid' | 'kept'> {
  const folder = join(root, project, page)
  if (existsSync(folder)) {
    await relistKept(root, project, page)
    return 'kept'
  }
  await mkdir(folder)

  const frames = {
    [frame]: {
      x: 0,
      y: 0,
      order: 0,
      hidden: false,
      locked: false,
      ...placed,
    },
  }
  await Promise.all([
    copyFile(source, join(folder, `${frame}.html`)),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    ),
  ])
  await listPage(root, project, page)
  return 'laid'
}

async function layDeck(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, DECK.project, DECK.page)
  if (existsSync(folder)) {
    await relistKept(root, DECK.project, DECK.page)
    return 'kept'
  }
  await mkdir(folder)

  const frames = Object.fromEntries(
    DECK.slides.map((name, index) => [
      name,
      {
        x: index * (DECK.width + FRAME_GAP),
        y: 0,
        width: DECK.width,
        height: DECK.height,
        order: index,
        hidden: false,
        locked: false,
        ...(index === DECK.slides.length - 1
          ? { transition: { name: WIPE.name, ms: WIPE.ms } }
          : {}),
      },
    ]),
  )
  const layout = {
    version: 1,
    present: { transition: { name: 'push', ms: 500 } },
    frames,
  }
  await Promise.all([
    ...DECK.slides.map((name) =>
      copyFile(join(DECK_PAGES, `${name}.html`), join(folder, `${name}.html`)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify(layout, null, 2)}\n`,
    ),
  ])
  await listPage(root, DECK.project, DECK.page)
  return 'laid'
}

async function layTransition(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, WIPE.project, 'assets', 'transitions')
  const sheet = join(folder, `${WIPE.name}.css`)
  if (existsSync(sheet)) return 'kept'
  await mkdir(folder, { recursive: true })
  await copyFile(WIPE_SHEET, sheet)
  return 'laid'
}

async function layStacked(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, STACKED.project, STACKED.page)
  if (existsSync(folder)) {
    await relistKept(root, STACKED.project, STACKED.page)
    return 'kept'
  }
  await mkdir(folder)

  const layout = {
    version: 1,
    frames: Object.fromEntries(
      STACKED.frames.map(({ name }, index) => [
        name,
        {
          x: 0,
          y: index * (STACKED.height + STACKED.gap),
          width: STACKED.width,
          height: STACKED.height,
          order: index,
          hidden: false,
          locked: false,
        },
      ]),
    ),
  }
  await Promise.all([
    ...STACKED.frames.map(({ name, style }) =>
      writeFile(join(folder, `${name}.html`), stackedHtml(name, style)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify(layout, null, 2)}\n`,
    ),
  ])
  await listPage(root, STACKED.project, STACKED.page)
  return 'laid'
}

/** A frame naming itself in one heading, whose body takes `style` for the rule it trips or passes. */
function stackedHtml(name: string, style: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${name}</title></head>
  <body style="margin: 0; padding: 16px; ${style}"><h1>${name}</h1></body>
</html>
`
}

/**
 * A frame carrying its number in the board's tokens, at a height of its own,
 * so it draws in both themes and passes every content rule a reel would show.
 */
function frameHtml(name: string, index: number): string {
  const { height } = FRAME_SIZES.desktop
  const style = `margin: 0; height: ${height}px; display: grid; place-items: center; background: var(--surface); color: var(--text); font-family: var(--font-text); font-size: 96px`
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${name}</title></head>
  <body style="${style}"><h1>${index + 1}</h1></body>
</html>
`
}

async function listPage(
  root: string,
  project: string,
  page: string,
): Promise<void> {
  const path = join(root, project, 'project.json')
  const listed = JSON.parse(await readFile(path, 'utf8')) as {
    pages: string[]
  }
  if (listed.pages.includes(page)) return
  listed.pages.push(page)
  await writeFile(path, `${JSON.stringify(listed, null, 2)}\n`)
}

/**
 * Lists a page left in place, since a drive copy rebuilt from a seeded checkout
 * can carry its folder beside a `project.json` reset to the fixture's own. A
 * project with no `project.json` is left as it is rather than given one.
 */
async function relistKept(
  root: string,
  project: string,
  page: string,
): Promise<void> {
  if (!existsSync(join(root, project, 'project.json'))) return
  await listPage(root, project, page)
}

async function reserveSettings(root: string, now: Date): Promise<string[]> {
  const { width, height } = FRAME_SIZES.desktop
  const claims = await reserve(
    root,
    { session: SESSION, agent: 'claude', tag: 'claude · basic' },
    RESERVED.map((name, index) => ({
      frame: `webapp/settings/${name}`,
      box: {
        x: SETTINGS_RIGHT + FRAME_GAP + index * (width + FRAME_GAP),
        y: 0,
        width,
        height,
      },
    })),
    new Date(now.getTime() + HOLD_AHEAD_MS),
  )
  return claims.map((each) => each.frame)
}
