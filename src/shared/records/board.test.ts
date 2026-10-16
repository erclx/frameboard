import { describe, expect, it } from 'vitest'

import { boardFileSchema, layoutFileSchema, projectFileSchema } from './board'

describe('layoutFileSchema', () => {
  it('accepts an entry with no hidden or locked key', () => {
    expect(
      layoutFileSchema.safeParse({
        version: 1,
        frames: { hero: { x: 0, y: 0, width: 10, height: 10, order: 0 } },
      }).success,
    ).toBe(true)
  })

  it('keeps unknown keys on the file and on an entry', () => {
    const layout = layoutFileSchema.parse({
      version: 1,
      grid: 8,
      frames: {
        hero: { x: 0, y: 0, width: 10, height: 10, order: 0, tint: 'red' },
      },
    })

    expect(layout).toMatchObject({ grid: 8, frames: { hero: { tint: 'red' } } })
  })

  it('rejects another version', () => {
    expect(layoutFileSchema.safeParse({ version: 2, frames: {} }).success).toBe(
      false,
    )
  })

  it.each([
    ['a fractional x', { x: 0.5, y: 0, width: 10, height: 10, order: 0 }],
    ['a zero width', { x: 0, y: 0, width: 0, height: 10, order: 0 }],
    ['a negative order', { x: 0, y: 0, width: 10, height: 10, order: -1 }],
  ])('rejects %s', (_label, entry) => {
    expect(
      layoutFileSchema.safeParse({ version: 1, frames: { hero: entry } })
        .success,
    ).toBe(false)
  })
})

describe('projectFileSchema', () => {
  it('rejects pages that are not a list of names', () => {
    expect(
      projectFileSchema.safeParse({ version: 1, pages: 'home' }).success,
    ).toBe(false)
  })

  it('reads a checks config with an unknown rule kept', () => {
    const project = projectFileSchema.parse({
      version: 1,
      pages: [],
      checks: { allowedFonts: ['Geist'], noUppercase: true, minFontSize: 12 },
    })

    expect(project.checks).toEqual({
      allowedFonts: ['Geist'],
      noUppercase: true,
      minFontSize: 12,
    })
  })

  it('keeps a checks value the rules cannot read as written', () => {
    const project = projectFileSchema.parse({
      version: 1,
      pages: ['home'],
      checks: { allowedFonts: 'Geist' },
    })

    expect(project).toEqual({
      version: 1,
      pages: ['home'],
      checks: { allowedFonts: 'Geist' },
    })
  })
})

describe('boardFileSchema', () => {
  it('keeps unknown keys', () => {
    expect(boardFileSchema.parse({ version: 1, theme: 'dark' })).toEqual({
      version: 1,
      theme: 'dark',
    })
  })
})
