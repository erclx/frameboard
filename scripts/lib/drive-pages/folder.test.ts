import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
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

describe('the Drives folder', () => {
  it('files two projects of one page each in one folder', async () => {
    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.folder).toBe('laid')
    expect([
      readJson('drive-app/project.json'),
      readJson('drive-site/project.json'),
    ]).toEqual([
      { version: 1, pages: ['home'], group: 'Drives' },
      { version: 1, pages: ['home'], group: 'Drives' },
    ])
    expect(readdirSync(join(root, 'drive-app/home'))).toContain('layout.json')
  })

  it('lays one frame in drive-app, so the folder card draws a capture', async () => {
    await seedDrive(root, new Date())
    const framesOf = (path: string) =>
      Object.keys((readJson(path) as { frames: object }).frames)

    expect([
      framesOf('drive-app/home/layout.json'),
      readdirSync(join(root, 'drive-app/home')).includes('app.html'),
      framesOf('drive-site/home/layout.json'),
    ]).toEqual([['app'], true, []])
  })

  it('leaves a folder a reel deleted from alone on a second seed', async () => {
    await seedDrive(root, new Date())
    rmSync(join(root, 'drive-site'), { recursive: true })

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.folder).toBe('kept')
    expect(readdirSync(root)).not.toContain('drive-site')
  })
})
