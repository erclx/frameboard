import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { addAssets, listAssets, resolveAsset, splitName } from './assets'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('assets', () => {
  let board: FixtureBoard
  let project: string
  let assets: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    project = join(board.root, 'webapp')
    assets = join(project, 'assets')
  })

  afterEach(() => {
    board.cleanup()
  })

  function put(path: string, content = 'x'): void {
    const target = join(assets, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }

  describe('listAssets', () => {
    it('lists nothing when the project has no assets folder', async () => {
      expect(await listAssets(project)).toEqual([])
    })

    it('lists each file with its kind and size, nested ones by relative path', async () => {
      put('hero.png', '12345')
      put('img/logo.svg', '<svg/>')
      put('notes.json', '{}')

      expect(await listAssets(project)).toEqual([
        { path: 'hero.png', kind: 'image', size: 5 },
        { path: 'img/logo.svg', kind: 'svg', size: 6 },
        { path: 'notes.json', kind: 'other', size: 2 },
      ])
    })

    it('sorts by path ignoring letter case', async () => {
      put('demo.mp4')
      put('Inter.woff2')
      put('hero.png')

      expect((await listAssets(project)).map((file) => file.path)).toEqual([
        'demo.mp4',
        'hero.png',
        'Inter.woff2',
      ])
    })

    it('skips dot-named paths, lock files, and temp files', async () => {
      put('keep.png')
      put('.DS_Store')
      put('.hidden/inner.png')
      put('keep.png.lock')
      put('abc123.tmp')

      expect((await listAssets(project)).map((file) => file.path)).toEqual([
        'keep.png',
      ])
    })

    it('skips a symlink that leaves the folder and keeps one that stays', async () => {
      put('real.png')
      writeFileSync(join(board.root, 'secret.png'), 'secret')
      symlinkSync(join(board.root, 'secret.png'), join(assets, 'escape.png'))
      symlinkSync(join(assets, 'real.png'), join(assets, 'alias.png'))

      expect((await listAssets(project)).map((file) => file.path)).toEqual([
        'alias.png',
        'real.png',
      ])
    })
  })

  describe('resolveAsset', () => {
    it('answers the kind of an image, an SVG, and a video', async () => {
      put('hero.png')
      put('img/logo.svg')
      put('demo.mp4')

      expect(await resolveAsset(project, 'hero.png')).toEqual({
        ok: true,
        kind: 'image',
      })
      expect(await resolveAsset(project, 'img/logo.svg')).toEqual({
        ok: true,
        kind: 'svg',
      })
      expect(await resolveAsset(project, 'demo.mp4')).toEqual({
        ok: true,
        kind: 'video',
      })
    })

    it('refuses a path that is not there as missing', async () => {
      put('hero.png')

      expect(await resolveAsset(project, 'gone.png')).toMatchObject({
        ok: false,
        code: 'asset-missing',
      })
    })

    it('refuses a path climbing out with .. as missing', async () => {
      put('hero.png')
      writeFileSync(join(project, 'outside.png'), 'x')

      expect(await resolveAsset(project, '../outside.png')).toMatchObject({
        ok: false,
        code: 'asset-missing',
      })
    })

    it('refuses an absolute path as missing', async () => {
      writeFileSync(join(board.root, 'secret.png'), 'secret')

      expect(
        await resolveAsset(project, join(board.root, 'secret.png')),
      ).toMatchObject({ ok: false, code: 'asset-missing' })
    })

    it('refuses a symlink out of the folder as missing', async () => {
      put('real.png')
      writeFileSync(join(board.root, 'secret.png'), 'secret')
      symlinkSync(join(board.root, 'secret.png'), join(assets, 'escape.png'))

      expect(await resolveAsset(project, 'escape.png')).toMatchObject({
        ok: false,
        code: 'asset-missing',
      })
    })

    it('refuses a folder as missing', async () => {
      put('img/logo.svg')

      expect(await resolveAsset(project, 'img')).toMatchObject({
        ok: false,
        code: 'asset-missing',
      })
    })

    it('refuses a font as not placeable', async () => {
      put('Inter.woff2')

      expect(await resolveAsset(project, 'Inter.woff2')).toMatchObject({
        ok: false,
        code: 'asset-not-placeable',
      })
    })
  })

  describe('addAssets', () => {
    it('creates the folder on a first drop and keeps the bytes', async () => {
      const result = await addAssets(project, [
        { name: 'hero.png', bytes: bytes('pixels') },
      ])

      expect(result).toEqual({
        added: [{ name: 'hero.png', path: 'hero.png' }],
        refused: [],
      })
      expect(readFileSync(join(assets, 'hero.png'), 'utf8')).toBe('pixels')
    })

    it('takes -2 for a taken name and leaves the existing bytes', async () => {
      put('hero.png', 'agent')

      const result = await addAssets(project, [
        { name: 'hero.png', bytes: bytes('dropped') },
      ])

      expect(result.added).toEqual([{ name: 'hero.png', path: 'hero-2.png' }])
      expect(readFileSync(join(assets, 'hero.png'), 'utf8')).toBe('agent')
      expect(readFileSync(join(assets, 'hero-2.png'), 'utf8')).toBe('dropped')
    })

    it('treats a name taken in another letter case as taken', async () => {
      put('Hero.PNG', 'agent')

      const result = await addAssets(project, [
        { name: 'hero.png', bytes: bytes('dropped') },
      ])

      expect(result.added[0]?.path).toBe('hero-2.png')
    })

    it('lands two files with one name as the name and its -2', async () => {
      const result = await addAssets(project, [
        { name: 'a.png', bytes: bytes('first') },
        { name: 'a.png', bytes: bytes('second') },
      ])

      expect(result.added.map((file) => file.path)).toEqual([
        'a.png',
        'a-2.png',
      ])
      expect(readFileSync(join(assets, 'a-2.png'), 'utf8')).toBe('second')
    })

    it('keeps every file when two drops race for one name', async () => {
      await Promise.all([
        addAssets(project, [{ name: 'a.png', bytes: bytes('one') }]),
        addAssets(project, [{ name: 'a.png', bytes: bytes('two') }]),
      ])

      const stored = readdirSync(assets).sort()
      expect(stored).toEqual(['a-2.png', 'a.png'])
      expect(
        stored.map((name) => readFileSync(join(assets, name), 'utf8')).sort(),
      ).toEqual(['one', 'two'])
    })

    it('refuses an unaccepted extension by name and still lands the others', async () => {
      const result = await addAssets(project, [
        { name: 'page.html', bytes: bytes('<p>') },
        { name: 'tool.exe', bytes: bytes('MZ') },
        { name: 'README', bytes: bytes('hi') },
        { name: 'ok.png', bytes: bytes('ok') },
      ])

      expect(result.added).toEqual([{ name: 'ok.png', path: 'ok.png' }])
      expect(result.refused.map((entry) => entry.name)).toEqual([
        'page.html',
        'tool.exe',
        'README',
      ])
      expect(result.refused.every((e) => e.code === 'asset-type-refused')).toBe(
        true,
      )
      expect(readdirSync(assets)).toEqual(['ok.png'])
    })

    it('leaves no temp file behind', async () => {
      await addAssets(project, [{ name: 'a.png', bytes: bytes('x') }])

      expect(readdirSync(assets).filter((n) => n.endsWith('.tmp'))).toEqual([])
      expect(existsSync(join(assets, 'a.png'))).toBe(true)
    })

    it('sanitizes a name to the board rule before taking a free one', async () => {
      const result = await addAssets(project, [
        { name: 'Hero Image #1.PNG', bytes: bytes('x') },
      ])

      expect(result.added[0]?.path).toBe('Hero-Image-1.png')
    })
  })

  describe('splitName', () => {
    it('takes file for a stem that sanitizes to nothing', () => {
      expect(splitName('...png')).toEqual({ stem: 'file', extension: 'png' })
      expect(splitName('日本語.png')).toEqual({
        stem: 'file',
        extension: 'png',
      })
    })

    it('keeps the whole name within the name cap', () => {
      const { stem, extension } = splitName(`${'a'.repeat(100)}.png`)

      expect(`${stem}.${extension}`.length).toBeLessThanOrEqual(64)
    })
  })
})
