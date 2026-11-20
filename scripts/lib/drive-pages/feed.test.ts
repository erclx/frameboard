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

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

describe('the scroll feed page', () => {
  it('lays one phone frame that scrolls a page longer than its screen', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.feed).toBe('laid')
    expect(readJson('webapp/feed/layout.json')).toMatchObject({
      frames: { 'feed-scroll': { width: 390, height: 844, scroll: true } },
    })
    expect(
      readFileSync(join(root, 'webapp/feed/feed-scroll.html'), 'utf8'),
    ).toContain('data-name="Section 12"')
  })

  it('leaves a hand-edited feed page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/feed/feed-scroll.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.feed).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
