import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  folderRenames,
  type Folders,
  identityOf,
  keepFolders,
  readFolders,
} from './project-folders'

describe('project folders', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-folders-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function make(...names: string[]): void {
    for (const name of names) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'project.json'), '{}')
    }
  }

  function move(from: string, to: string): void {
    renameSync(join(root, from), join(root, to))
  }

  it('finds a renamed folder', async () => {
    make('studio', 'shop')
    const before = await readFolders(root, ['shop', 'studio'])

    move('studio', 'atelier')

    expect(
      folderRenames(before, await readFolders(root, ['atelier', 'shop'])),
    ).toEqual([{ before: 'studio', after: 'atelier' }])
  })

  it('finds a rename that changes only the case', async () => {
    make('studio')
    const before = await readFolders(root, ['studio'])

    move('studio', 'Studio')

    expect(folderRenames(before, await readFolders(root, ['Studio']))).toEqual([
      { before: 'studio', after: 'Studio' },
    ])
  })

  it('finds the last name alone of a folder renamed twice', async () => {
    make('studio')
    const before = await readFolders(root, ['studio'])

    move('studio', 'atelier')
    move('atelier', 'workshop')

    expect(
      folderRenames(before, await readFolders(root, ['workshop'])),
    ).toEqual([{ before: 'studio', after: 'workshop' }])
  })

  it('finds no rename in a copy whose original was deleted', async () => {
    make('studio')
    const before = await readFolders(root, ['studio'])

    cpSync(join(root, 'studio'), join(root, 'atelier'), { recursive: true })
    rmSync(join(root, 'studio'), { recursive: true })

    expect(folderRenames(before, await readFolders(root, ['atelier']))).toEqual(
      [],
    )
  })

  it('finds no rename in a folder made after another was deleted', async () => {
    make('studio')
    const before = await readFolders(root, ['studio'])
    const made = statSync(join(root, 'studio'), { bigint: true }).birthtimeNs
    const probe = join(root, 'probe')
    // A clock can tick this coarsely, and a held identity is a batch old or more.
    await expect
      .poll(() => {
        rmSync(probe, { force: true })
        writeFileSync(probe, '')
        return statSync(probe, { bigint: true }).birthtimeNs
      })
      .toBeGreaterThan(made)

    rmSync(join(root, 'studio'), { recursive: true })
    make('atelier')

    expect(folderRenames(before, await readFolders(root, ['atelier']))).toEqual(
      [],
    )
  })

  it('orders a chain so each target is free when its rename comes', async () => {
    make('a', 'c')
    const before = await readFolders(root, ['a', 'c'])

    move('a', 'b')
    move('c', 'a')

    expect(folderRenames(before, await readFolders(root, ['a', 'b']))).toEqual([
      { before: 'a', after: 'b' },
      { before: 'c', after: 'a' },
    ])
  })

  it('finds no rename in two folders that swapped names', async () => {
    make('a', 'b')
    const before = await readFolders(root, ['a', 'b'])

    move('a', 'held')
    move('b', 'a')
    move('held', 'b')

    expect(folderRenames(before, await readFolders(root, ['a', 'b']))).toEqual(
      [],
    )
  })

  it('finds no rename onto a name another folder still held', async () => {
    make('a', 'b')
    const before = await readFolders(root, ['a', 'b'])

    rmSync(join(root, 'b'), { recursive: true })
    move('a', 'b')

    expect(folderRenames(before, await readFolders(root, ['b']))).toEqual([])
  })

  it('finds no rename in a second name for a folder still under its first', () => {
    const before: Folders = new Map([['studio', '1']])

    expect(
      folderRenames(
        before,
        new Map([
          ['studio', '1'],
          ['mirror', '1'],
        ]),
      ),
    ).toEqual([])
  })

  it('keeps the old identity of a folder gone before its identity was read', async () => {
    make('studio')
    const held = await readFolders(root, ['studio'])

    move('studio', 'atelier')
    const kept = keepFolders(held, await readFolders(root, ['studio']))

    expect(folderRenames(kept, await readFolders(root, ['atelier']))).toEqual([
      { before: 'studio', after: 'atelier' },
    ])
  })
})

describe('identityOf', () => {
  it('tells a folder from the one its inode went to next', () => {
    expect(identityOf({ dev: 1n, ino: 2n, birthtimeNs: 3n })).not.toBe(
      identityOf({ dev: 1n, ino: 2n, birthtimeNs: 4n }),
    )
  })

  it('is none where the file system keeps no birth time', () => {
    expect(identityOf({ dev: 1n, ino: 2n, birthtimeNs: 0n })).toBeNull()
  })
})
