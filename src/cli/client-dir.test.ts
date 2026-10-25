import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import { resolveClientDir } from './client-dir'

describe('resolveClientDir', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'frameboard-client-dir-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const bundle = () => pathToFileURL(join(root, 'dist', 'cli.js')).href
  const source = () =>
    pathToFileURL(join(root, 'src', 'cli', 'client-dir.ts')).href
  const build = (dir: string, files: string[] = ['index.html']) => {
    mkdirSync(dir, { recursive: true })
    for (const file of files) writeFileSync(join(dir, file), '<title></title>')
  }
  const refusal = (moduleUrl: string) => {
    try {
      resolveClientDir(moduleUrl)
    } catch (error) {
      return error
    }
    return null
  }

  it('returns the folder beside a built bundle', () => {
    build(join(root, 'dist', 'client'))

    expect(resolveClientDir(bundle())).toBe(join(root, 'dist', 'client'))
  })

  it('reads dist/client at the repository root from source', () => {
    build(join(root, 'dist', 'client'))

    expect(resolveClientDir(source())).toBe(join(root, 'dist', 'client'))
  })

  it.each([
    ['built', bundle, 'Reinstall'],
    ['source', source, 'bun run build'],
  ])('refuses a missing folder in a %s run', (_name, moduleUrl, fix) => {
    const error = refusal(moduleUrl())

    expect(error).toBeInstanceOf(FrameboardError)
    expect(error).toMatchObject({ code: 'client-not-built' })
    expect((error as Error).message).toContain(fix)
  })

  it.each([
    ['built', bundle],
    ['source', source],
  ])(
    'refuses a folder holding no index.html in a %s run',
    (_name, moduleUrl) => {
      build(join(root, 'dist', 'client'), ['app.js'])

      expect(refusal(moduleUrl())).toMatchObject({ code: 'client-not-built' })
    },
  )

  it('reads nothing from a repository dist when built', () => {
    build(join(root, 'dist', 'client'))
    const elsewhere = join(root, 'pkg', 'cli.js')

    expect(refusal(pathToFileURL(elsewhere).href)).toMatchObject({
      code: 'client-not-built',
    })
  })
})
