import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { FrameChange } from '@/shared/records/changes'

import { changesFolder, loadChanges, saveChanges } from './persist'

const OLD = 'a'.repeat(64)
const OLDER = 'b'.repeat(64)

function change(id: string, overrides: Partial<FrameChange> = {}): FrameChange {
  return {
    id,
    frame: 'webapp/home/hero',
    at: '2026-11-03T12:00:00.000Z',
    hash: 'c'.repeat(64),
    author: null,
    elements: [5],
    removed: 0,
    whole: false,
    created: false,
    ...overrides,
  }
}

describe('saved changes', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'frameboard-changes-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const versionFiles = () =>
    readdirSync(join(changesFolder(root), 'versions')).sort()

  it('reads back the log and the versions it names', async () => {
    const changes = [
      change('c1', { before: OLD }),
      change('c2', { created: true, whole: true }),
    ]

    await saveChanges(root, changes, new Map([[OLD, '<h1>old</h1>']]))
    const saved = await loadChanges(root, 200)

    expect(saved.changes).toEqual(changes)
    expect(saved.versions).toEqual(new Map([[OLD, '<h1>old</h1>']]))
  })

  it('reads a board with no saved log as empty', async () => {
    const saved = await loadChanges(root, 200)

    expect(saved.changes).toEqual([])
    expect(saved.versions.size).toBe(0)
  })

  it('reads a log that does not parse as empty', async () => {
    await mkdir(changesFolder(root), { recursive: true })
    writeFileSync(join(changesFolder(root), 'log.json'), '{"version": 1, "chan')

    expect((await loadChanges(root, 200)).changes).toEqual([])
  })

  it('reads a log of an unknown version as empty', async () => {
    await mkdir(changesFolder(root), { recursive: true })
    writeFileSync(
      join(changesFolder(root), 'log.json'),
      JSON.stringify({ version: 2, changes: [change('c1')] }),
    )

    expect((await loadChanges(root, 200)).changes).toEqual([])
  })

  it('keeps only the newest changes past the cap', async () => {
    await saveChanges(
      root,
      [change('c1'), change('c2'), change('c3')],
      new Map(),
    )

    const saved = await loadChanges(root, 2)

    expect(saved.changes.map(({ id }) => id)).toEqual(['c2', 'c3'])
  })

  it('removes a version no saved change names any longer', async () => {
    await saveChanges(
      root,
      [change('c1', { before: OLDER }), change('c2', { before: OLD })],
      new Map([
        [OLDER, 'older'],
        [OLD, 'old'],
      ]),
    )

    await saveChanges(
      root,
      [change('c2', { before: OLD })],
      new Map([[OLD, 'old']]),
    )

    expect(versionFiles()).toEqual([`${OLD}.html`])
  })

  it('keeps a change whose version file is gone, with no version', async () => {
    await saveChanges(
      root,
      [change('c1', { before: OLD })],
      new Map([[OLD, 'old']]),
    )
    rmSync(join(changesFolder(root), 'versions', `${OLD}.html`))

    const saved = await loadChanges(root, 200)

    expect(saved.changes.map(({ id }) => id)).toEqual(['c1'])
    expect(saved.versions.size).toBe(0)
  })
})
