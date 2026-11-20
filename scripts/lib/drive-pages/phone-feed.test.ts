import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

describe('the phone feed page', () => {
  it('lays the feed in a phone frame as tall as its page, off Scroll', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds['phone-feed']).toBe('laid')
    const { frames } = readJson('webapp/phone-feed/layout.json') as {
      frames: Record<string, Record<string, unknown>>
    }
    expect(frames.feed).toMatchObject({
      width: 390,
      height: 2326,
      showDevice: true,
    })
    expect(frames.feed?.scroll).toBeUndefined()
  })
})
