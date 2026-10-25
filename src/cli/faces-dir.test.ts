import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveFacesDir } from './faces-dir'

describe('resolveFacesDir', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'frameboard-faces-dir-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns the folder beside a built bundle and writes nothing', () => {
    const bundle = pathToFileURL(join(root, 'dist', 'cli.js')).href

    expect(resolveFacesDir(bundle)).toBe(join(root, 'dist', 'faces'))
    expect(existsSync(join(root, 'node_modules'))).toBe(false)
  })

  describe('from source', () => {
    const cacheIn = (dir: string) =>
      join(dir, 'node_modules', '.cache', 'frameboard', 'faces')
    const source = () =>
      pathToFileURL(join(root, 'src', 'cli', 'faces-dir.ts')).href

    it('writes every face into the cache on the first call', () => {
      const dir = resolveFacesDir(source())

      expect(dir).toBe(cacheIn(root))
      expect(existsSync(join(dir, 'caveat', 'index.css'))).toBe(true)
      expect(existsSync(join(dir, 'geist', 'index.css'))).toBe(true)
      expect(existsSync(join(dir, 'geist-mono', 'index.css'))).toBe(true)
    })

    it('reuses a complete cache without rewriting it', () => {
      const dir = resolveFacesDir(source())
      const written = statSync(join(dir, 'geist', 'index.css')).mtimeMs
      writeFileSync(join(dir, 'marker'), 'x')

      resolveFacesDir(source())

      expect(existsSync(join(dir, 'marker'))).toBe(true)
      expect(statSync(join(dir, 'geist', 'index.css')).mtimeMs).toBe(written)
    })

    it('completes a cache holding one face of three', () => {
      const dir = cacheIn(root)
      mkdirSync(join(dir, 'geist'), { recursive: true })
      writeFileSync(join(dir, 'geist', 'index.css'), '')

      resolveFacesDir(source())

      expect(existsSync(join(dir, 'caveat', 'index.css'))).toBe(true)
      expect(existsSync(join(dir, 'geist-mono', 'index.css'))).toBe(true)
    })
  })
})
