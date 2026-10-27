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

import { type Face, FACES } from '@/shared/faces'

import { referencedFiles, writeFaces } from './write-faces'

const CASES = FACES.map((face) => [face.family, face] as const)

describe('referencedFiles', () => {
  it('reads unquoted and quoted references', () => {
    const sheet = `src: url(./files/a.woff2) format('woff2');
src: url("./files/b.woff2");
src: url('./files/c.woff2');`

    expect(referencedFiles(sheet)).toEqual(['a.woff2', 'b.woff2', 'c.woff2'])
  })

  it('lists a file referenced twice once', () => {
    const sheet = 'a{src:url(./files/a.woff2)} b{src:url(./files/a.woff2)}'

    expect(referencedFiles(sheet)).toEqual(['a.woff2'])
  })

  it('ignores a reference outside the files folder', () => {
    expect(referencedFiles('src: url(https://x.test/a.woff2)')).toEqual([])
  })
})

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

  it.each(CASES)(
    'copies exactly the files the sheet references for %s',
    (_family, face) => {
      writeFaces(out)

      const sheet = readFileSync(join(out, face.folder, 'index.css'), 'utf8')
      const copied = readdirSync(join(out, face.folder, 'files')).sort()
      expect(copied).toEqual(referencedFiles(sheet).sort())
    },
  )

  it('throws on a referenced file the package lacks and leaves no folder', () => {
    const pkg = join(out, 'pkg')
    mkdirSync(join(pkg, 'files'), { recursive: true })
    writeFileSync(join(pkg, 'package.json'), '{}')
    writeFileSync(join(pkg, 'LICENSE'), 'x')
    writeFileSync(
      join(pkg, 'index.css'),
      "font-family: 'Fake Variable'; src: url(./files/gone.woff2);",
    )
    const fake: Face = {
      ...FACES[0]!,
      family: 'Fake',
      package: pkg,
      packageFamily: 'Fake Variable',
      folder: 'fake',
    }
    const target = join(out, 'faces')

    expect(() => writeFaces(target, { faces: [fake] })).toThrow(/gone\.woff2/)

    expect(readdirSync(out).sort()).toEqual(['pkg'])
  })

  it('leaves an unreferenced italic file out', () => {
    writeFaces(out)

    expect(readdirSync(join(out, 'geist', 'files'))).not.toContain(
      'geist-latin-wght-italic.woff2',
    )
  })

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
