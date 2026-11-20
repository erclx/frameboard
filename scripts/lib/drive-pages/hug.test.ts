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

describe('the width-hugging frame page', () => {
  it('lays one frame that hugs its width', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.hug).toBe('laid')
    expect(readJson('webapp/hug/layout.json')).toMatchObject({
      frames: { badge: { width: 320, height: 200, hugWidth: true } },
    })
  })

  it('leaves the page alone on a second seed', async () => {
    await seedDrive(root, new Date())

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.hug).toBe('kept')
  })
})
