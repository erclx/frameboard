import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/checks/frame-source'
import { tokenSheets } from '@/server/checks/tokens'
import { elementTree } from '@/server/edit/elements'
import { elementHidden } from '@/server/edit/hide'

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

describe('the flags page', () => {
  it('lays a frame with one element hidden, one locked, and no script row', async () => {
    const seeded = await seedDrive(root, new Date())

    const target = { root, project: 'webapp', page: 'flags', name: 'flags' }
    const source = readFrame(target)
    const tree = elementTree(
      readFileSync(source.path, 'utf8'),
      [],
      [],
      [],
      elementHidden(source, tokenSheets(root, 'webapp')),
    )
    expect(seeded.seeds.flags).toBe('laid')
    expect(
      Array.isArray(tree) &&
        tree
          .filter(({ parent }) => parent === null)
          .map(({ name, hidden, locked }) => [name, hidden, locked]),
    ).toEqual([
      ['Backdrop', undefined, true],
      ['Card', undefined, undefined],
      ['Stats', true, undefined],
    ])
  })
})
