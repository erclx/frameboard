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

describe('the mixed text page', () => {
  it('lays list items whose text runs sit beside an inline child', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/mixed/notes.html'), 'utf8')
    expect(seeded.seeds.mixed).toBe('laid')
    expect(html).toContain(
      '<li>Wipes in beside it, <code>wipe</code> same press</li>',
    )
  })

  it('leaves a hand-edited mixed text page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/mixed/notes.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.mixed).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
