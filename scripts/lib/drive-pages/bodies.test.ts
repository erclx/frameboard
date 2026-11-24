import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

describe('the bodies page', () => {
  it('lays a phone with two linked widths, a laptop, and a tablet upright and turned, each in its device', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.bodies).toBe('laid')
    expect(readJson('webapp/bodies/layout.json')).toMatchObject({
      frames: {
        phone: {
          width: 390,
          showDevice: true,
          widths: [{ width: 834 }, { width: 1440 }],
        },
        laptop: { width: 1440, showDevice: true },
        tablet: { width: 834, showDevice: true },
        turned: { width: 1194, showDevice: true, turn: 'left' },
      },
    })
  })
})
