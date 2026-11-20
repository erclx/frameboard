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

describe('the long sheet path project', () => {
  it('lays one page and a token sheet under a folder name with no break in it', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds['long-path']).toBe('laid')
    const project = 'northwindbrandsystemworkspacedesigntokens'
    expect(readJson(`${project}/project.json`)).toEqual({
      version: 1,
      pages: ['home'],
    })
    expect(readFileSync(join(root, project, 'tokens.css'), 'utf8')).toContain(
      '--brand',
    )
  })

  it('leaves the project alone on a second seed', async () => {
    await seedDrive(root, new Date())

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds['long-path']).toBe('kept')
  })
})
