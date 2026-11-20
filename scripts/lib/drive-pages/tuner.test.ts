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

describe('the drawn controls page', () => {
  it('lays a photo whose three sliders each bind a property it reads', async () => {
    const seeded = await seedDrive(root, new Date())

    const html = readFileSync(
      join(root, 'webapp/tuner/photo-tuner.html'),
      'utf8',
    )
    expect(seeded.seeds.tuner).toBe('laid')
    expect(html.match(/data-binds="#photo --/g)).toHaveLength(3)
    expect(
      checkFrame({
        root,
        project: 'webapp',
        page: 'tuner',
        name: 'photo-tuner',
      }).findings.filter((finding) => finding.rule === 'binding-target'),
    ).toEqual([])
  })

  it('leaves a hand-edited tuner page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/tuner/photo-tuner.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.tuner).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
