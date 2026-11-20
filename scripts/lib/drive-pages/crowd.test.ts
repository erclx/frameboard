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

import { seedDrive } from '../drive-seed.ts'

const FIXTURE = join(
  import.meta.dirname,
  '..',
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
