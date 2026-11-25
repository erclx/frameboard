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

import { elementTree } from '@/server/edit/elements'
import { groupSteps } from '@/shared/present-steps'

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

describe('the steps page', () => {
  it('lays one slide of eight steps in four presses, two of them playing a clip', async () => {
    const seeded = await seedDrive(root, new Date())

    const tree = elementTree(
      readFileSync(join(root, 'webapp/steps/build.html'), 'utf8'),
    )
    const steps = Array.isArray(tree)
      ? tree.flatMap((of) => (of.step ? [{ of: of.name, step: of.step }] : []))
      : []
    expect(seeded.seeds.steps).toBe('laid')
    expect(groupSteps(steps).map((press) => press.length)).toEqual([2, 2, 2, 2])
    expect(steps.filter(({ step }) => step.plays).map(({ of }) => of)).toEqual([
      'Phone',
      'Demo clip',
    ])
  })

  it('lays both clips and the viewer script in the project assets', async () => {
    await seedDrive(root, new Date())

    expect(
      ['spin.glb', 'clip.webm', 'model-viewer.min.js'].map((file) =>
        existsSync(join(root, 'webapp/assets', file)),
      ),
    ).toEqual([true, true, true])
  })

  it('leaves a hand-edited steps page alone on a second seed', async () => {
    await seedDrive(root, new Date())
    const edited = join(root, 'webapp/steps/build.html')
    writeFileSync(edited, '<p>edited by a reel</p>')

    const seeded = await seedDrive(root, new Date())

    expect(seeded.seeds.steps).toBe('kept')
    expect(readFileSync(edited, 'utf8')).toBe('<p>edited by a reel</p>')
  })
})
