import {
  cpSync,
  existsSync,
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

describe('the model page', () => {
  it('lays one model viewer with its model and the viewer script in the project assets', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(join(root, 'webapp/model/spin.html'), 'utf8')
    expect(seeded.seeds.model).toBe('laid')
    expect(html).toContain(
      '<script type="module" src="../assets/model-viewer.min.js"></script>',
    )
    expect(html).toContain('src="../assets/spin.glb"')
    expect(existsSync(join(root, 'webapp/assets/spin.glb'))).toBe(true)
    expect(existsSync(join(root, 'webapp/assets/model-viewer.min.js'))).toBe(
      true,
    )
  })

  it('leaves a hand-edited model page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/model/spin.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.model).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
