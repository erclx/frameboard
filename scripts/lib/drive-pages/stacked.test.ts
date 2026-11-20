import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkFrame } from '@/server/checks/frame'

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

describe('the stacked page', () => {
  const rulesOf = (name: string) =>
    checkFrame({ root, project: 'webapp', page: 'stacked', name }).findings.map(
      (finding) => `${finding.rule}:${finding.severity}`,
    )

  it('lays three frames in a column, each 8 px under the one above', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.stacked).toBe('laid')
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

    expect(seeded.seeds.stacked).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited</p>')
  })
})
