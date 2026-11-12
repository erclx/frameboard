import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
  /** The frame refs the reservation holds. */
  reserved: string[]
}

/**
 * Lays the states a drive films that the committed `basic` board lacks: a
 * 40-frame `marketing/crowd` page, a `marketing/motion` page whose one frame
 * animates, and a live reservation of three boxes on `webapp/settings`. A
 * page already present is left as a reel edited it, and the reservation
 * replaces the seed's own earlier set.
 */
export async function seedDrive(root: string, now: Date): Promise<Seeded> {
  // In turn, since both pages append to one project.json.
  const crowd = await layCrowd(root)
  const motion = await layMotion(root)
  const reserved = await reserveSettings(root, now)
  return { crowd, motion, reserved }
}

async function layCrowd(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, CROWD.project, CROWD.page)
  if (existsSync(folder)) return 'kept'
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
    listPage(root, CROWD.page),
  )
  await Promise.all(writes)
  return 'laid'
}

async function layMotion(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, MOTION.project, MOTION.page)
  if (existsSync(folder)) return 'kept'
  await mkdir(folder)

  const { width, height } = FRAME_SIZES.desktop
  const frames = {
    [MOTION.frame]: {
      x: 0,
      y: 0,
      width,
      height,
      order: 0,
      hidden: false,
      locked: false,
    },
  }
  await Promise.all([
    writeFile(join(folder, `${MOTION.frame}.html`), slideHtml()),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    ),
  ])
  await listPage(root, MOTION.page)
  return 'laid'
}

/**
 * A box sliding 1000 px right over four seconds and holding there, painted in
 * the board's tokens, so it reads in both themes and its filmstrip has an end.
 */
function slideHtml(): string {
  const { height } = FRAME_SIZES.desktop
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${MOTION.frame}</title>
    <style>
      @keyframes slide { from { transform: translateX(0) } to { transform: translateX(1000px) } }
      body { margin: 0; height: ${height}px; display: grid; align-items: center; padding: 0 120px; background: var(--surface); }
      [data-name="Box"] { width: 160px; height: 160px; border-radius: 24px; background: var(--text); animation: slide 4s linear forwards; }
    </style>
  </head>
  <body><div data-name="Box"></div></body>
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

async function listPage(root: string, page: string): Promise<void> {
  const path = join(root, 'marketing', 'project.json')
  const project = JSON.parse(await readFile(path, 'utf8')) as {
    pages: string[]
  }
  if (project.pages.includes(page)) return
  project.pages.push(page)
  await writeFile(path, `${JSON.stringify(project, null, 2)}\n`)
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
