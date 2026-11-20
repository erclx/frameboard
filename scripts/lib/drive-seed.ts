import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { reserve } from '@/server/claims/store'
import type { Pose } from '@/shared/frame-device'
import { FRAME_GAP, FRAME_SIZES } from '@/shared/frame-sizes'

/**
 * One module per state the seed lays, each exporting `lay`, keyed in the
 * record by its file name. A new page is a new file, so two branches adding
 * one never edit the same line.
 */
const PAGES = join(import.meta.dirname, 'drive-pages')

/** The frames reserved beside `webapp/settings/profile`, which ends at x 834. */
const RESERVED = ['billing', 'security', 'team']
const SETTINGS_RIGHT = 834

/**
 * The reservation's lead on the clock, keeping it live across a drive without
 * bypassing the store, which also lapses another session's claim.
 */
export const HOLD_AHEAD_MS = 24 * 60 * 60_000

/** The session the seed holds its reservation as, apart from a drive's own `drive-review`. */
const SESSION = 'drive-seed'

export interface Seeded {
  /** Each page module's state by its file name, laid now or already there and kept. */
  seeds: Record<string, 'laid' | 'kept'>
  /** The frame refs the reservation holds. */
  reserved: string[]
}

interface SeedPage {
  lay: (root: string) => Promise<'laid' | 'kept'>
}

/**
 * Lays the drive's states the committed board lacks, leaving a page already
 * present as a reel edited it, then reserves the settings frames.
 */
export async function seedDrive(root: string, now: Date): Promise<Seeded> {
  const files = (await readdir(PAGES)).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  )
  const seeds: Record<string, 'laid' | 'kept'> = {}
  // In turn and in name order, since several pages append to one project.json.
  for (const file of files.sort()) {
    const page = (await import(
      pathToFileURL(join(PAGES, file)).href
    )) as SeedPage
    seeds[file.slice(0, -'.ts'.length)] = await page.lay(root)
  }
  const reserved = await reserveSettings(root, now)
  return { seeds, reserved }
}

/**
 * Lays a page holding one frame copied from `source`, a desktop frame unless
 * `placed` gives its size and flags, unless the page is there.
 */
export async function layOne(
  root: string,
  { project, page, frame }: { project: string; page: string; frame: string },
  source: string,
  placed: {
    width: number
    height: number
    scroll?: boolean
    hugWidth?: boolean
    widths?: { width: number; height: number }[]
    showDevice?: boolean
    foldable?: boolean
    pose?: Pose
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

export async function listPage(
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
export async function relistKept(
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
