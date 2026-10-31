import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { readTokenTable } from './token-table'

describe('readTokenTable', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function boardSheet(css: string) {
    board = writeBoard({ 'tokens.css': css })
    return readTokenTable(board.root, {
      board: join(board.root, 'tokens.css'),
      project: null,
    })
  }

  function rowOf(table: ReturnType<typeof readTokenTable>, name: string) {
    return table.tokens.find((row) => row.name === name)
  }

  describe('light and dark', () => {
    it.each([
      ['[data-theme="dark"]'],
      ["[data-theme='dark']"],
      [':root[data-theme="dark"]'],
      ['.dark'],
    ])('reads %s as dark over a :root light value', (selector) => {
      const table = boardSheet(
        `:root { --fg: #111111 } ${selector} { --fg: #eeeeee }`,
      )

      expect(rowOf(table, '--fg')).toMatchObject({
        light: '#111111',
        dark: '#eeeeee',
      })
    })

    it('reads a :root rule inside a dark prefers-color-scheme query as dark', () => {
      const table = boardSheet(
        ':root { --fg: #111111 } @media (prefers-color-scheme: dark) { :root { --fg: #eeeeee } }',
      )

      expect(rowOf(table, '--fg')).toMatchObject({
        light: '#111111',
        dark: '#eeeeee',
      })
    })

    it.each([
      ['[data-theme="light"]'],
      [':root[data-theme="light"]'],
      ['.light'],
    ])('reads %s as light over a :root value', (selector) => {
      const table = boardSheet(
        `:root { --fg: #eeeeee } ${selector} { --fg: #111111 }`,
      )

      expect(rowOf(table, '--fg')).toMatchObject({
        light: '#111111',
        dark: '#eeeeee',
      })
    })

    it('fills both sides from :root when no theme selector sets the property', () => {
      const table = boardSheet(':root { --radius-sm: 4px }')

      expect(rowOf(table, '--radius-sm')).toMatchObject({
        light: '4px',
        dark: '4px',
      })
    })

    it('leaves out a property set under no recognized selector', () => {
      const table = boardSheet('.card { --inset: 8px } :root { --fg: #111 }')

      expect(table.tokens.map((row) => row.name)).toEqual(['--fg'])
    })

    it('leaves a side null when only the other theme sets it', () => {
      const table = boardSheet('.dark { --glow: #ffffff }')

      expect(rowOf(table, '--glow')).toMatchObject({
        light: null,
        dark: '#ffffff',
      })
    })
  })

  describe('groups', () => {
    it.each([
      ['a hex value', '--brand: #4f46e5', 'color'],
      ['a color function', '--brand: oklch(0.6 0.2 260)', 'color'],
      ['a named color', '--brand: white', 'color'],
      [
        'a color value whose name says radius',
        '--radius-ring: #4f46e5',
        'color',
      ],
      ['a radius', '--radius-md: 8px', 'radius'],
      ['a font', '--font-mono: "Geist Mono", monospace', 'font'],
      ['a reference to another token', '--ring: var(--brand)', 'other'],
      ['anything else', '--space: 16px', 'other'],
    ])('groups %s', (_case, declaration, group) => {
      const table = boardSheet(`:root { ${declaration} }`)

      expect(table.tokens[0]?.group).toBe(group)
    })
  })

  describe('the cascade', () => {
    it("takes the project's value over the board's on each side it sets", () => {
      board = writeBoard({
        'tokens.css': ':root { --accent: #f59e0b } .dark { --accent: #fbbf24 }',
        'site/tokens.css': '.dark { --accent: #fb7185 }',
      })

      const table = readTokenTable(board.root, {
        board: join(board.root, 'tokens.css'),
        project: join(board.root, 'site/tokens.css'),
      })

      expect(rowOf(table, '--accent')).toEqual({
        name: '--accent',
        group: 'color',
        light: '#f59e0b',
        dark: '#fb7185',
        sheet: 'site/tokens.css',
        overrides: true,
      })
    })

    it('marks no override on a token only one sheet sets', () => {
      board = writeBoard({
        'tokens.css': ':root { --board-only: 1px }',
        'site/tokens.css': ':root { --project-only: 2px }',
      })

      const table = readTokenTable(board.root, {
        board: join(board.root, 'tokens.css'),
        project: join(board.root, 'site/tokens.css'),
      })

      expect(rowOf(table, '--board-only')?.overrides).toBe(false)
      expect(rowOf(table, '--project-only')?.overrides).toBe(false)
    })

    it("hashes each sheet's bytes as read, so an edit can tell a changed sheet", () => {
      const css = ':root { --a: 1px }'
      board = writeBoard({ 'tokens.css': css })

      const table = readTokenTable(board.root, {
        board: join(board.root, 'tokens.css'),
        project: null,
      })

      expect(table.sheets[0]?.hash).toBe(
        createHash('sha256').update(css).digest('hex'),
      )
    })

    it('names both sheets in cascade order', () => {
      board = writeBoard({
        'tokens.css': ':root { --a: 1px }',
        'site/tokens.css': ':root { --b: 2px }',
      })

      const table = readTokenTable(board.root, {
        board: join(board.root, 'tokens.css'),
        project: join(board.root, 'site/tokens.css'),
      })

      expect(table.sheets).toEqual([
        {
          path: 'tokens.css',
          kind: 'board',
          error: null,
          hash: expect.any(String),
        },
        {
          path: 'site/tokens.css',
          kind: 'project',
          error: null,
          hash: expect.any(String),
        },
      ])
    })

    it('names a sheet outside the board by its absolute path', () => {
      board = writeBoard({ 'brand/tokens.css': ':root { --a: 1px }' })
      const boardRoot = join(board.root, 'inner')

      const table = readTokenTable(boardRoot, {
        board: join(board.root, 'brand/tokens.css'),
        project: null,
      })

      expect(table.sheets[0]?.path).toBe(join(board.root, 'brand/tokens.css'))
    })
  })

  it('names a sheet that does not parse and keeps the rows of the others', () => {
    board = writeBoard({
      'tokens.css': ':root { --a: #111',
      'site/tokens.css': ':root { --b: 2px }',
    })

    const table = readTokenTable(board.root, {
      board: join(board.root, 'tokens.css'),
      project: join(board.root, 'site/tokens.css'),
    })

    expect(table.sheets[0]?.error).toMatch(/Unclosed block at line 1/)
    expect(table.tokens.map((row) => row.name)).toEqual(['--b'])
  })

  it('answers no sheets and no rows when the project has no token sheet', () => {
    board = writeBoard({})

    expect(readTokenTable(board.root, { board: null, project: null })).toEqual({
      sheets: [],
      tokens: [],
    })
  })
})
