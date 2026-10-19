import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { tokenSheetPaths, tokenSheets } from './tokens'

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
})
