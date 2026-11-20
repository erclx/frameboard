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

describe('the extra width page', () => {
  it('lays one desktop frame that also shows at 834', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.widths).toBe('laid')
    expect(readJson('webapp/widths/layout.json')).toMatchObject({
      frames: { panel: { widths: [{ width: 834, height: 1194 }] } },
    })
  })

  it('leaves the page alone on a second seed', async () => {
    await seedDrive(root, new Date())

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.widths).toBe('kept')
  })
})
