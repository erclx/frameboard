import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanBoard } from '@/server/board/scan'

import { editUnrelated, OPEN_PAGE, UNRELATED_FRAME, writeBoard } from './board'

describe('the generated board', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'perf-board-')))
    writeBoard(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const scannedFrames = async () =>
    (await scanBoard(root)).projects
      .flatMap(({ pages }) => pages)
      .flatMap(({ frames }) => frames)

  it('holds a thousand placed frames, more than half of them hugging', async () => {
    const frames = await scannedFrames()

    expect(frames).toHaveLength(1000)
    expect(frames.filter(({ placed }) => placed)).toHaveLength(1000)
    expect(frames.filter(({ hugHeight }) => hugHeight)).toHaveLength(576)
  })

  it('opens on a page of forty frames', async () => {
    const frames = await scannedFrames()

    const open = frames.filter(
      ({ project, page }) =>
        project === OPEN_PAGE.project && page === OPEN_PAGE.page,
    )
    expect(open).toHaveLength(OPEN_PAGE.frames)
  })

  it('edits a frame in another project that hugs nothing', async () => {
    const frames = await scannedFrames()

    const edited = frames.find(({ ref }) => ref === UNRELATED_FRAME)
    expect(edited?.project).not.toBe(OPEN_PAGE.project)
    expect(edited?.hugHeight).toBe(false)
  })

  it('gives each edit bytes of its own, the same on every board', () => {
    const path = join(root, `${UNRELATED_FRAME}.html`)
    const edit = (step: number) => {
      editUnrelated(root, step)
      return readFileSync(path, 'utf8')
    }
    const before = readFileSync(path, 'utf8')

    const [first, second, again] = [edit(1), edit(2), edit(1)]

    expect(new Set([before, first, second]).size).toBe(3)
    expect(again).toBe(first)
  })
})
