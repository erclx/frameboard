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

describe('the seeded webapp pages', () => {
  it("lists them after the webapp project's own, in module name order", async () => {
    await seedDrive(root, new Date())

    const { pages } = readJson('webapp/project.json') as { pages: string[] }

    expect(pages.slice(0, 2)).toEqual(['settings', 'home'])
    expect(pages.slice(2)).toEqual(pages.slice(2).toSorted())
    expect(pages.slice(2)).toContain('raw')
  })
})

describe('a kept page whose project listing was reset', () => {
  it.each<{
    project: string
    page: string
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

    expect(seeded.seeds[page]).toBe('kept')
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

    expect(seeded.seeds.crowd).toBe('kept')
    expect(seeded.seeds.motion).toBe('kept')
    expect(readdirSync(join(root, 'marketing'))).not.toContain('project.json')
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
