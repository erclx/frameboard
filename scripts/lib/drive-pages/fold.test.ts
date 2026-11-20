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

describe('the foldable page', () => {
  it('lays one frame naming the foldable, closed at the cover screen', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.fold).toBe('laid')
    expect(readJson('webapp/fold/layout.json')).toMatchObject({
      frames: {
        inbox: {
          width: 466,
          height: 678,
          showDevice: true,
          foldable: true,
          pose: 'closed',
        },
      },
    })
  })
})
