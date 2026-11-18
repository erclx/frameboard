import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { frameKit, tokenSheetPaths, tokenSheets } from './tokens'

describe('tokenSheetPaths', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function recordTokens(path: string): void {
    writeFileSync(
      join(board.root, '.run/address.json'),
      JSON.stringify({ version: 1, tokens: path }),
    )
  }

  it("resolves the board's and the project's tokens.css when both exist", () => {
    board = writeBoard({
      'tokens.css': ':root { --fg: black }',
      'site/tokens.css': ':root { --fg: navy }',
    })

    expect(tokenSheetPaths(board.root, 'site')).toEqual({
      board: join(board.root, 'tokens.css'),
      project: join(board.root, 'site/tokens.css'),
    })
  })

  it('answers null for a sheet that does not exist', () => {
    board = writeBoard({ 'site/home/hero.html': '<p>x</p>' })

    expect(tokenSheetPaths(board.root, 'site')).toEqual({
      board: null,
      project: null,
    })
  })

  it('takes the --tokens sheet the address file records over the board sheet', () => {
    board = writeBoard({
      'tokens.css': ':root { --fg: black }',
      'outside/brand.css': ':root { --fg: teal }',
      '.run/address.json': '{}',
    })
    recordTokens(join(board.root, 'outside/brand.css'))

    expect(tokenSheetPaths(board.root, 'site').board).toBe(
      join(board.root, 'outside/brand.css'),
    )
  })

  it('reads a recorded --tokens sheet that is gone as no board sheet', () => {
    board = writeBoard({
      'tokens.css': ':root { --fg: black }',
      '.run/address.json': '{}',
    })
    recordTokens(join(board.root, 'gone.css'))

    expect(tokenSheetPaths(board.root, 'site').board).toBeNull()
  })

  it('falls back to the board sheet when the address file does not parse', () => {
    board = writeBoard({
      'tokens.css': ':root { --fg: black }',
      '.run/address.json': '{ not json',
    })

    expect(tokenSheetPaths(board.root, 'site').board).toBe(
      join(board.root, 'tokens.css'),
    )
  })

  it('takes a sheet the caller names over the address file', () => {
    board = writeBoard({
      'given.css': ':root { --fg: red }',
      'recorded.css': ':root { --fg: blue }',
      '.run/address.json': '{}',
    })
    recordTokens(join(board.root, 'recorded.css'))

    expect(
      tokenSheetPaths(board.root, 'site', join(board.root, 'given.css')).board,
    ).toBe(join(board.root, 'given.css'))
  })
})

describe('tokenSheets', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('reads the board sheet ahead of the project sheet', () => {
    board = writeBoard({
      'tokens.css': ':root { --fg: black }',
      'site/tokens.css': ':root { --fg: navy }',
    })

    const sheets = tokenSheets(board.root, 'site')

    expect(sheets.map((sheet) => sheet.css)).toEqual([
      ':root { --fg: black }',
      ':root { --fg: navy }',
    ])
  })

  it("reads a project-wide kit's stylesheet after the project sheet where its folder holds kit.json", () => {
    board = writeBoard({
      'site/tokens.css': ':root { --fg: navy }',
      'site/assets/kit/kit.json': '{ "version": 1 }',
      'site/assets/kit/kit.css': 'body { font-family: var(--font-text) }',
    })

    const sheets = tokenSheets(board.root, 'site')

    expect(sheets.map((sheet) => sheet.css)).toEqual([
      ':root { --fg: navy }',
      'body { font-family: var(--font-text) }',
    ])
  })

  it('leaves out a hand-built assets/kit/kit.css whose folder holds no kit.json', () => {
    board = writeBoard({
      'site/tokens.css': ':root { --fg: navy }',
      'site/assets/kit/kit.css': 'body { font-family: var(--font-text) }',
    })

    const sheets = tokenSheets(board.root, 'site')

    expect(sheets.map((sheet) => sheet.css)).toEqual([':root { --fg: navy }'])
  })

  it("reads the frame's kit tokens then its stylesheet, after the project sheet and a project-wide kit", () => {
    board = writeBoard({
      'site/tokens.css': ':root { --fg: navy }',
      'site/assets/kit/kit.json': '{ "version": 1 }',
      'site/assets/kit/kit.css': '.kit-card { border: 0 }',
      'site/assets/kits/sketch/tokens.css': ':root { --fg: teal }',
      'site/assets/kits/sketch/kit.css': '.kit-card { border: 2px solid }',
    })

    const sheets = tokenSheets(board.root, 'site', undefined, 'sketch')

    expect(sheets.map((sheet) => sheet.css)).toEqual([
      ':root { --fg: navy }',
      '.kit-card { border: 0 }',
      ':root { --fg: teal }',
      '.kit-card { border: 2px solid }',
    ])
  })

  it('reads no kit sheet for a frame naming none in a project that holds kits', () => {
    board = writeBoard({
      'site/tokens.css': ':root { --fg: navy }',
      'site/assets/kits/sketch/tokens.css': ':root { --fg: teal }',
      'site/assets/kits/sketch/kit.css': '.kit-card { border: 2px solid }',
    })

    const sheets = tokenSheets(board.root, 'site')

    expect(sheets.map((sheet) => sheet.css)).toEqual([':root { --fg: navy }'])
  })

  it('reads only the sheets a kit holds, and none for a kit the project lacks', () => {
    board = writeBoard({
      'site/assets/kits/brand/kit.css': '.kit-card { border: 2px solid }',
    })

    const held = tokenSheets(board.root, 'site', undefined, 'brand')
    const missing = tokenSheets(board.root, 'site', undefined, 'sketch')

    expect([
      held.map((sheet) => sheet.css),
      missing.map((sheet) => sheet.css),
    ]).toEqual([['.kit-card { border: 2px solid }'], []])
  })
})

describe('frameKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  const HERO = { project: 'site', page: 'home', name: 'hero' }

  function layout(kit: unknown): string {
    return JSON.stringify({
      version: 1,
      frames: { hero: { x: 0, y: 0, width: 10, height: 10, order: 0, kit } },
    })
  }

  it("reads the kit a frame's layout entry names", () => {
    board = writeBoard({ 'site/home/layout.json': layout('sketch') })

    expect(frameKit({ root: board.root, ...HERO })).toBe('sketch')
  })

  it.each([
    ['an entry naming none', layout(undefined)],
    ['a name climbing out of the kits folder', layout('../../other/kit')],
    ['a layout that does not parse', '{ nope'],
    [
      'a layout holding no entry for the frame',
      '{ "version": 1, "frames": {} }',
    ],
    ['a layout whose frames is not an object', '{ "frames": "hero" }'],
  ])('reads %s as no kit', (_label, file) => {
    board = writeBoard({ 'site/home/layout.json': file })

    expect(frameKit({ root: board.root, ...HERO })).toBeNull()
  })

  it('reads a page with no layout file as no kit', () => {
    board = writeBoard({ 'site/home/hero.html': '<p>x</p>' })

    expect(frameKit({ root: board.root, ...HERO })).toBeNull()
  })
})
