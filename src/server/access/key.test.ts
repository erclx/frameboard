import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cookieName, KEY_FILE, loadBoardKey } from './key'

describe('loadBoardKey', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-key-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const keyPath = () => join(root, '.run', KEY_FILE)

  it('writes 64 hex at mode 0600 and reads the same key on a second load', async () => {
    const first = await loadBoardKey(root)
    const second = await loadBoardKey(root)

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
    expect(JSON.parse(readFileSync(keyPath(), 'utf8'))).toEqual({
      version: 1,
      key: first,
    })
    expect(statSync(keyPath()).mode & 0o777).toBe(0o600)
  })

  it.each([
    ['not JSON', 'nope'],
    ['a short key', '{"version":1,"key":"abc"}'],
    ['another version', `{"version":2,"key":"${'a'.repeat(64)}"}`],
  ])('replaces a file holding %s', async (_case, text) => {
    await loadBoardKey(root)
    writeFileSync(keyPath(), text)

    const key = await loadBoardKey(root)

    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(await loadBoardKey(root)).toBe(key)
    expect(statSync(keyPath()).mode & 0o777).toBe(0o600)
  })

  it('gives concurrent loads one key and leaves no draft behind', async () => {
    const keys = await Promise.all(
      Array.from({ length: 8 }, () => loadBoardKey(root)),
    )

    expect(new Set(keys).size).toBe(1)
    expect(readdirSync(join(root, '.run')).sort()).toEqual([
      '.gitignore',
      KEY_FILE,
    ])
  })
})

describe('cookieName', () => {
  it('differs by root and holds still for one', () => {
    expect(cookieName('/a/board')).toBe(cookieName('/a/board'))
    expect(cookieName('/a/board')).not.toBe(cookieName('/b/board'))
    expect(cookieName('/a/board')).toMatch(/^frameboard-key-[0-9a-f]{12}$/)
  })
})
