import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pruneImages } from './prune'

describe('pruneImages', () => {
  let out: string

  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'frameboard-prune-'))
  })

  afterEach(() => {
    rmSync(out, { recursive: true, force: true })
  })

  function write(...paths: string[]): string[] {
    return paths.map((path) => {
      const full = join(out, path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, path)
      return full
    })
  }

  it.each([
    'home/gone.light.png',
    'home/gone.dark.png',
    'home/gone.light@2x.png',
    'home/gone@390.light.png',
    'home/gone.scroll-1200.dark.png',
    'home/gone@390.at-500.light@3x.png',
    'home/gone.filmstrip-8.light.png',
    'home/gone.v2.light.png',
    'gone.light.png',
    'gone.dark@2x.png',
  ])('removes %s, which a capture could have written', async (path) => {
    const kept = write('studio/home/hero.light.png')
    const [stale] = write(`studio/${path}`)

    const removed = await pruneImages(out, 'studio', kept)

    expect(removed).toEqual([stale])
    expect(existsSync(join(out, 'studio', path))).toBe(false)
    expect(existsSync(join(out, 'studio/home/hero.light.png'))).toBe(true)
  })

  it.each([
    'notes.md',
    'frames.json',
    'logo.png',
    'home/hero.html',
    'home/hero-light.png',
    'home/hero.light.jpg',
    'home/hero.light@4x.png',
    'home/my hero.light.png',
    'home/.hero.light.png',
    'home/.light.png',
    'home@390.light.png',
    'home/old/gone.light.png',
    '.archive/gone.light.png',
    'my page/gone.light.png',
    'assets/logo.dark.png',
    'assets.dark.png',
  ])('keeps %s, which no capture writes', async (path) => {
    const kept = write('studio/home/hero.light.png')
    write(`studio/${path}`)

    const removed = await pruneImages(out, 'studio', kept)

    expect(removed).toEqual([])
    expect(existsSync(join(out, 'studio', path))).toBe(true)
  })

  it("keeps another project's images in the same folder", async () => {
    const kept = write('studio/home/hero.light.png')
    const [other] = write('shop/cart/empty.light.png')

    await pruneImages(out, 'studio', kept)

    expect(existsSync(String(other))).toBe(true)
  })

  it('removes the page folder its last image leaves empty', async () => {
    const kept = write('studio/home/hero.light.png')
    write('studio/old/a.light.png', 'studio/old/a.dark.png')

    await pruneImages(out, 'studio', kept)

    expect(existsSync(join(out, 'studio/old'))).toBe(false)
  })

  it('keeps a page folder still holding a file of another kind', async () => {
    const kept = write('studio/home/hero.light.png')
    write('studio/old/a.light.png', 'studio/old/notes.md')

    await pruneImages(out, 'studio', kept)

    expect(existsSync(join(out, 'studio/old/a.light.png'))).toBe(false)
    expect(existsSync(join(out, 'studio/old/notes.md'))).toBe(true)
  })

  it('keeps an empty folder it emptied nothing from', async () => {
    const kept = write('studio/home/hero.light.png')
    mkdirSync(join(out, 'studio/later'))

    await pruneImages(out, 'studio', kept)

    expect(existsSync(join(out, 'studio/later'))).toBe(true)
  })

  it('sorts the paths it removed', async () => {
    const kept = write('studio/home/hero.light.png')
    const [second, first] = write(
      'studio/work/b.light.png',
      'studio/home/a.light.png',
    )

    expect(await pruneImages(out, 'studio', kept)).toEqual([first, second])
  })

  // Two spellings of one file, as a disk that ignores case gives a renamed frame.
  it('keeps an image it just wrote that the disk lists under another case', async () => {
    const kept = write('studio/home/hero.light.png')
    const listed = join(out, 'studio/home/Hero.light.png')
    if (!existsSync(listed)) linkSync(String(kept[0]), listed)

    expect(await pruneImages(out, 'studio', kept)).toEqual([])
    expect(existsSync(listed)).toBe(true)
  })

  it('removes nothing through a page folder that is a link', async () => {
    const kept = write('studio/home/hero.light.png')
    const [outside] = write('elsewhere/gone.light.png')
    symlinkSync(join(out, 'elsewhere'), join(out, 'studio/linked'))

    expect(await pruneImages(out, 'studio', kept)).toEqual([])
    expect(existsSync(String(outside))).toBe(true)
  })

  it('removes nothing through a project folder that is a link', async () => {
    const [outside] = write('elsewhere/home/gone.light.png')
    write('elsewhere/home/hero.light.png')
    symlinkSync(join(out, 'elsewhere'), join(out, 'studio'))

    expect(
      await pruneImages(out, 'studio', [
        join(out, 'studio/home/hero.light.png'),
      ]),
    ).toEqual([])
    expect(existsSync(String(outside))).toBe(true)
  })
})
