import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'

import {
  changedImages,
  listImages,
  type MatchFiles,
  matchImages,
  RASTER_TOLERANCE,
  sortDrift,
} from './evidence-drift.ts'

function files(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries))
}

/** Reads a file name carrying `~` as a raster difference from the same name without it. */
const byName: MatchFiles = (a, b) => {
  if (a === b) return 'identical'
  return a?.replace('~', '') === b?.replace('~', '') ? 'raster' : 'different'
}

/** A white image with its first `count` pixels moved by `delta` in the red channel. */
function image(count = 0, delta = 0, width = 40, height = 40): Buffer {
  const png = new PNG({ width, height })
  png.data.fill(255)
  for (let pixel = 0; pixel < count; pixel++) {
    png.data[pixel * 4] = 255 - delta
  }
  return PNG.sync.write(png)
}

describe('sortDrift', () => {
  it('calls an image noise when the two runs disagree, whatever the committed set holds', () => {
    const drift = sortDrift(
      files({ 'a.png': '1' }),
      files({ 'a.png': '1' }),
      files({ 'a.png': '2' }),
      byName,
    )
    expect(drift.noise).toEqual(['a.png'])
    expect(drift.stale).toEqual([])
    expect(drift.equal).toEqual([])
  })

  it('calls an image noise when only one run wrote it', () => {
    const drift = sortDrift(
      files({}),
      files({ 'a.png': '1' }),
      files({}),
      byName,
    )
    expect(drift.noise).toEqual(['a.png'])
  })

  it('calls an image stale when both runs agree against the committed set', () => {
    const drift = sortDrift(
      files({ 'a.png': '1' }),
      files({ 'a.png': '2' }),
      files({ 'a.png': '2' }),
      byName,
    )
    expect(drift.stale).toEqual(['a.png'])
    expect(drift.noise).toEqual([])
    expect(drift.equal).toEqual([])
  })

  it('calls an image stale when both runs wrote it and nothing committed it', () => {
    const drift = sortDrift(
      files({}),
      files({ 'a.png': '1' }),
      files({ 'a.png': '1' }),
      byName,
    )
    expect(drift.stale).toEqual(['a.png'])
  })

  it('calls a committed image stale when neither run wrote it', () => {
    const drift = sortDrift(
      files({ 'a.png': '1' }),
      files({}),
      files({}),
      byName,
    )
    expect(drift.stale).toEqual(['a.png'])
  })

  it('calls an image equal, and not tolerated, when all three hold the same bytes', () => {
    const drift = sortDrift(
      files({ 'a.png': '1' }),
      files({ 'a.png': '1' }),
      files({ 'a.png': '1' }),
      byName,
    )
    expect(drift.equal).toEqual(['a.png'])
    expect(drift.tolerated).toEqual([])
  })

  it('names an image the runs split by raster alone as equal and tolerated', () => {
    const drift = sortDrift(
      files({ 'a.png': '1' }),
      files({ 'a.png': '1' }),
      files({ 'a.png': '1~' }),
      byName,
    )
    expect(drift.equal).toEqual(['a.png'])
    expect(drift.tolerated).toEqual(['a.png'])
    expect(drift.noise).toEqual([])
  })
})

describe('matchImages', () => {
  it('reads the same bytes as identical', () => {
    expect(matchImages(image(3, 40), image(3, 40))).toBe('identical')
  })

  it('reads a few antialiased pixels as raster', () => {
    expect(matchImages(image(), image(RASTER_TOLERANCE.pixels, 44))).toBe(
      'raster',
    )
  })

  it('reads one pixel past the count as different', () => {
    expect(matchImages(image(), image(RASTER_TOLERANCE.pixels + 1, 1))).toBe(
      'different',
    )
  })

  it('reads one pixel past the channel delta as different', () => {
    expect(
      matchImages(image(), image(1, RASTER_TOLERANCE.channelDelta + 1)),
    ).toBe('different')
  })

  it('reads a resized image as different', () => {
    expect(matchImages(image(), image(0, 0, 40, 41))).toBe('different')
  })
})

describe('changedImages', () => {
  it('takes a changed image and a new one, and leaves an equal or raster one', () => {
    const changed = changedImages(
      files({
        'changed.png': '2',
        'equal.png': '1',
        'new.png': '1',
        'raster.png': '1~',
      }),
      files({
        'changed.png': '1',
        'equal.png': '1',
        'raster.png': '1',
      }),
      byName,
    )
    expect(changed).toEqual(['changed.png', 'new.png'])
  })

  it('leaves a committed image a filtered capture did not write', () => {
    const changed = changedImages(
      files({}),
      files({ 'other.png': '1' }),
      byName,
    )
    expect(changed).toEqual([])
  })
})

describe('listImages', () => {
  let root: string

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('keys nested PNGs by their path from the root, skipping anything else', () => {
    root = mkdtempSync(join(tmpdir(), 'evidence-drift-'))
    mkdirSync(join(root, 'case/section'), { recursive: true })
    writeFileSync(join(root, 'case/320--light.png'), 'one')
    writeFileSync(join(root, 'case/section/320--light.png'), 'two')
    writeFileSync(join(root, 'case/notes.txt'), 'not an image')

    const images = listImages(root)

    expect([...images.keys()].sort()).toEqual([
      'case/320--light.png',
      'case/section/320--light.png',
    ])
    expect(images.get('case/320--light.png')).toBe(
      join(root, 'case/320--light.png'),
    )
  })

  it('reads a root that does not exist as empty', () => {
    root = mkdtempSync(join(tmpdir(), 'evidence-drift-'))
    expect(listImages(join(root, 'absent')).size).toBe(0)
  })
})
