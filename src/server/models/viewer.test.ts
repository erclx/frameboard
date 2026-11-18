import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { ensureViewer, shippedViewerPath } from './viewer'

describe('ensureViewer', () => {
  let board: TempBoard
  let project: string
  let shipped: string

  beforeEach(() => {
    board = writeBoard({ 'shipped/viewer.js': '/* the shipped viewer */' })
    project = join(board.root, 'acme')
    mkdirSync(project)
    shipped = join(board.root, 'shipped/viewer.js')
  })

  afterEach(() => {
    board.cleanup()
  })

  it('copies the shipped script into a project with no assets folder', async () => {
    const wrote = await ensureViewer(project, shipped)

    expect(wrote).toBe(true)
    expect(
      readFileSync(join(project, 'assets/model-viewer.min.js'), 'utf8'),
    ).toBe('/* the shipped viewer */')
  })

  it('keeps a script already holding the name, as an agent or an older release wrote it', async () => {
    mkdirSync(join(project, 'assets'))
    writeFileSync(join(project, 'assets/model-viewer.min.js'), '/* theirs */')

    const wrote = await ensureViewer(project, shipped)

    expect(wrote).toBe(false)
    expect(
      readFileSync(join(project, 'assets/model-viewer.min.js'), 'utf8'),
    ).toBe('/* theirs */')
  })

  it('fails rather than placing a model with no script when the shipped file is gone', async () => {
    await expect(
      ensureViewer(project, join(board.root, 'shipped/missing.js')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(existsSync(join(project, 'assets/model-viewer.min.js'))).toBe(false)
  })
})

describe('shippedViewerPath', () => {
  it('finds the pinned build in a source run', () => {
    expect(statSync(shippedViewerPath()).size).toBeGreaterThan(500_000)
  })

  it('reads the viewer folder beside the bundle in a built run', () => {
    expect(shippedViewerPath('file:///opt/frameboard/dist/cli.js')).toBe(
      '/opt/frameboard/dist/viewer/model-viewer.min.js',
    )
  })
})
