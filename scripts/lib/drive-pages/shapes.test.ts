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

describe('the free shapes page', () => {
  it('lays one frame of free elements beside one in the flow', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/shapes/group.html'), 'utf8')
    expect(seeded.seeds.shapes).toBe('laid')
    expect(html.match(/position: absolute/g)).toHaveLength(4)
    expect(html).toContain(
      '<p data-name="Flowing" style="margin: 0; padding: 40px 160px">',
    )
  })

  it('leaves a hand-edited shapes page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/shapes/group.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.shapes).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
