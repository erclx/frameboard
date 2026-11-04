import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { hashImages, sortDrift } from './evidence-drift.ts'

function images(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries))
}

describe('sortDrift', () => {
  it('calls an image noise when the two runs disagree, whatever the committed set holds', () => {
    const drift = sortDrift(
      images({ 'a.png': '1' }),
      images({ 'a.png': '1' }),
      images({ 'a.png': '2' }),
    )
    expect(drift).toEqual({ noise: ['a.png'], stale: [], equal: [] })
  })

  it('calls an image noise when only one run wrote it', () => {
    const drift = sortDrift(images({}), images({ 'a.png': '1' }), images({}))
    expect(drift.noise).toEqual(['a.png'])
  })

  it('calls an image stale when both runs agree against the committed set', () => {
    const drift = sortDrift(
      images({ 'a.png': '1' }),
      images({ 'a.png': '2' }),
      images({ 'a.png': '2' }),
    )
    expect(drift).toEqual({ noise: [], stale: ['a.png'], equal: [] })
  })

  it('calls an image stale when both runs wrote it and nothing committed it', () => {
    const drift = sortDrift(
      images({}),
      images({ 'a.png': '1' }),
      images({ 'a.png': '1' }),
    )
    expect(drift.stale).toEqual(['a.png'])
  })

  it('calls a committed image stale when neither run wrote it', () => {
    const drift = sortDrift(images({ 'a.png': '1' }), images({}), images({}))
    expect(drift.stale).toEqual(['a.png'])
  })

  it('calls an image equal when all three hold the same bytes', () => {
    const drift = sortDrift(
      images({ 'a.png': '1' }),
      images({ 'a.png': '1' }),
      images({ 'a.png': '1' }),
    )
    expect(drift).toEqual({ noise: [], stale: [], equal: ['a.png'] })
  })
})

describe('hashImages', () => {
  let root: string

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('keys nested PNGs by their path from the root, and hashes equal bytes alike', () => {
    root = mkdtempSync(join(tmpdir(), 'evidence-drift-'))
    mkdirSync(join(root, 'case/section'), { recursive: true })
    writeFileSync(join(root, 'case/320--light.png'), 'same')
    writeFileSync(join(root, 'case/section/320--light.png'), 'same')
    writeFileSync(join(root, 'case/notes.txt'), 'not an image')

    const hashes = hashImages(root)

    expect([...hashes.keys()].sort()).toEqual([
      'case/320--light.png',
      'case/section/320--light.png',
    ])
    expect(hashes.get('case/320--light.png')).toBe(
      hashes.get('case/section/320--light.png'),
    )
  })

  it('hashes different bytes differently', () => {
    root = mkdtempSync(join(tmpdir(), 'evidence-drift-'))
    writeFileSync(join(root, 'a.png'), 'one')
    writeFileSync(join(root, 'b.png'), 'two')

    const hashes = hashImages(root)

    expect(hashes.get('a.png')).not.toBe(hashes.get('b.png'))
  })
})
