import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkFrame } from '@/server/checks/frame'

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

describe('the past-edge page', () => {
  it('lays one desktop frame that clips', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds['past-edge']).toBe('laid')
    const { frames } = JSON.parse(
      readFileSync(join(root, 'webapp/past-edge/layout.json'), 'utf8'),
    )
    expect(frames.edges).toMatchObject({ width: 1440, height: 900 })
    expect(frames.edges).not.toHaveProperty('showOverflow')
  })

  it('draws a frame no static rule reports, leaving clipped alone to find', async () => {
    await seedDrive(root, new Date())

    expect(
      checkFrame({ root, project: 'webapp', page: 'past-edge', name: 'edges' })
        .findings,
    ).toEqual([])
  })
})
