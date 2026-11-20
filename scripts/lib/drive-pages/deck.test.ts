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

import { listTransitionNames } from '@/server/board/transitions'

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

describe('the deck page', () => {
  it('lays three slides in a row with a page transition', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.deck).toBe('laid')
    expect(readJson('webapp/deck/layout.json')).toMatchObject({
      present: { transition: { name: 'push', ms: 500 } },
      frames: {
        '01-intro': { x: 0, order: 0 },
        '02-build': { x: 1360, order: 1 },
        '03-closing': { x: 2720, order: 2 },
      },
    })
  })

  it('gives the middle slide a speaker note and no other slide one', async () => {
    await seedDrive(root, new Date())

    const layout = readJson('webapp/deck/layout.json')
    expect(layout).toMatchObject({
      frames: { '02-build': { speakerNotes: expect.any(String) } },
    })
    expect(layout).not.toHaveProperty(['frames', '01-intro', 'speakerNotes'])
    expect(layout).not.toHaveProperty(['frames', '03-closing', 'speakerNotes'])
  })

  it("brings the closing slide in with a transition the board lists as webapp's own", async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.transition).toBe('laid')
    expect(await listTransitionNames(join(root, 'webapp'))).toEqual(['wipe'])
    expect(readJson('webapp/deck/layout.json')).toMatchObject({
      frames: { '03-closing': { transition: { name: 'wipe', ms: 700 } } },
    })
  })

  it('leaves a hand-edited transition alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/assets/transitions/wipe.css')
    writeFileSync(edited, '@keyframes enter { from { opacity: 0 } }')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.transition).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe(
      '@keyframes enter { from { opacity: 0 } }',
    )
  })

  it('marks three steps on the middle slide, the last after the one before', async () => {
    await seedDrive(root, new Date())

    const build = readFileSync(join(root, 'webapp/deck/02-build.html'), 'utf8')
    expect(build).toContain('data-step="1"')
    expect(build).toMatch(/data-step="2"\s+data-step-effect="fly"/)
    expect(build).toMatch(/data-step="3"\s+data-step-effect="fade"/)
  })

  it('leaves a hand-edited deck page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/deck/02-build.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.deck).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
