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

describe('the walk page', () => {
  it('lays two rows with the top left frame drawn last and one frame hidden', async () => {
    const seeded = await seedDrive(root, new Date())

    const layout: unknown = JSON.parse(
      readFileSync(join(root, 'webapp/walk/layout.json'), 'utf8'),
    )
    expect(seeded.seeds.walk).toBe('laid')
    expect(layout).toMatchObject({
      frames: {
        one: { x: 0, y: 12, order: 6 },
        two: { x: 480, y: 0 },
        three: { x: 960, y: 0 },
        four: { x: 0, y: 400 },
        hidden: { x: 480, y: 400, hidden: true },
        five: { x: 960, y: 400 },
        six: { x: 1440, y: 400 },
      },
    })
  })

  it('leaves a hand-edited walk page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/walk/one.html')
    writeFileSync(edited, '<p>edited</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.walk).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited</p>')
  })
})
