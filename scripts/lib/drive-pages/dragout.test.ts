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

import { parseFrame } from '@/server/edit/address'
import { extractElement } from '@/server/edit/insert'

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

describe('the drag out page', () => {
  it.each([
    ['button', true],
    ['div', true],
    ['tr', false],
  ])('lays a frame whose %s drags out as %s', async (tagName, drags) => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(
      join(root, 'webapp/dragout/assistant.html'),
      'utf8',
    )
    const index = parseFrame(html).elements.findIndex(
      (element) => element.tagName === tagName,
    )
    expect(seeded.seeds.dragout).toBe('laid')
    expect(extractElement(html, index).ok).toBe(drags)
  })

  it('leaves a hand-edited drag out page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/dragout/assistant.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.dragout).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
