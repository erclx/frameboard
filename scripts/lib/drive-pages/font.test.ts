import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listFonts } from '@/server/fonts/installed'

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

describe('the installed font', () => {
  it('installs Lora into webapp as an install leaves it, then keeps it on a second run', async () => {
    const first = await seedDrive(root, new Date())
    const second = await seedDrive(root, new Date())

    const listed = await listFonts(root, 'webapp')
    expect(listed.fonts.map((font) => [font.family, font.license])).toEqual([
      ['Lora', 'OFL-1.1'],
    ])
    expect(first.seeds.font).toBe('laid')
    expect(second.seeds.font).toBe('kept')
  })
})
