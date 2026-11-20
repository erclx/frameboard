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

describe('the tilted card page', () => {
  it('lays one card whose own transform tilts it in the order the 3D section reads', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/tilt/card.html'), 'utf8')
    expect(seeded.seeds.tilt).toBe('laid')
    expect(html).toContain(
      'transform: perspective(800px) rotateX(20deg) rotateY(-30deg)',
    )
  })

  it('leaves a hand-edited tilted card page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/tilt/card.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.tilt).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
