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

describe('the motion page', () => {
  it('lays one desktop frame whose box slides on a finite timeline', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.motion).toBe('laid')
    expect(readJson('marketing/motion/layout.json')).toEqual({
      version: 1,
      frames: {
        slide: {
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
          order: 0,
          hidden: false,
          locked: false,
        },
      },
    })
    expect(
      readFileSync(join(root, 'marketing/motion/slide.html'), 'utf8'),
    ).toContain('animation: slide 4s linear forwards')
  })

  it('leaves a hand-edited motion page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'marketing/motion/slide.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.motion).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
