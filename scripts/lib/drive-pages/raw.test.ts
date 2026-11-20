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

describe('the raw colors page', () => {
  /** A token's light value as the webapp project's own sheet states it. */
  function lightValue(token: string): string {
    const sheet = readFileSync(join(root, 'webapp/tokens.css'), 'utf8')
    const light = sheet.slice(0, sheet.indexOf('[data-theme'))
    const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(light)
    if (!value?.[1]) throw new Error(`The webapp sheet sets no ${token}`)
    return value[1]
  }

  it('lays one webapp frame stating its own accent raw beside a color no token holds', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/raw/swatches.html'), 'utf8')
    expect(seeded.seeds.raw).toBe('laid')
    expect(html).toContain(
      `data-name="Equal" style="color: ${lightValue('--accent')}"`,
    )
    expect(html).toContain('data-name="Unequal" style="color: #be123c"')
    expect(
      Object.keys(
        (readJson('webapp/raw/layout.json') as { frames: object }).frames,
      ),
    ).toEqual(['swatches'])
  })

  it('leaves a hand-edited raw colors page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/raw/swatches.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.raw).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
