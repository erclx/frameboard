import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FACES } from '@/shared/faces'

import { writeFaces } from './write-faces'

const CASES = FACES.map((face) => [face.family, face] as const)

describe('writeFaces', () => {
  let out: string

  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
  })

  afterEach(() => {
    rmSync(out, { recursive: true, force: true })
  })

  it.each(CASES)('declares the plain family for %s', (_family, face) => {
    writeFaces(out)

    const sheet = readFileSync(join(out, face.folder, 'index.css'), 'utf8')
    expect(sheet).toContain(`font-family: '${face.family}'`)
    expect(sheet).not.toContain(face.packageFamily)
  })

  it.each(CASES)(
    'copies the woff2 files and licence for %s',
    (_family, face) => {
      writeFaces(out)

      const files = readdirSync(join(out, face.folder, 'files'))
      expect(files.length).toBeGreaterThan(0)
      expect(files.every((file) => file.endsWith('.woff2'))).toBe(true)
      expect(existsSync(join(out, face.folder, 'LICENSE'))).toBe(true)
    },
  )

  it('replaces what the folder held', () => {
    writeFaces(out)
    const stray = join(out, 'geist', 'stray.txt')
    writeFileSync(stray, 'x')

    writeFaces(out)

    expect(existsSync(stray)).toBe(false)
  })

  it('leaves only the faces folder beside its parent', () => {
    const target = join(out, 'faces')

    writeFaces(target)

    expect(readdirSync(out)).toEqual(['faces'])
  })

  it('keeps a complete folder when asked to', () => {
    writeFaces(out)
    const marker = join(out, 'marker')
    writeFileSync(marker, 'x')

    writeFaces(out, { keepComplete: true })

    expect(existsSync(marker)).toBe(true)
  })

  it('replaces an incomplete folder even when asked to keep a complete one', () => {
    mkdirSync(join(out, 'geist'))
    writeFileSync(join(out, 'geist', 'index.css'), '')

    writeFaces(out, { keepComplete: true })

    expect(existsSync(join(out, 'caveat', 'index.css'))).toBe(true)
  })
})
