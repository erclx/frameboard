import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { tokenSheetPaths } from '@/server/checks/tokens'
import { readTokenTable } from '@/server/look/token-table'

import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { writeStarterSheet } from './starter'

const PROJECT = { 'acme/project.json': '{ "version": 1, "pages": [] }\n' }

describe('writeStarterSheet', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('writes the project sheet with the chosen accent in both themes', async () => {
    board = writeBoard(PROJECT)

    await writeStarterSheet(board.root, 'acme', {
      accent: 'red',
      font: 'geist-mono',
    })

    const table = readTokenTable(
      board.root,
      tokenSheetPaths(board.root, 'acme', null),
    )
    expect(table.tokens).toContainEqual(
      expect.objectContaining({
        name: '--accent',
        light: '#e5484d',
        dark: '#ff6369',
      }),
    )
    expect(table.tokens).toContainEqual(
      expect.objectContaining({
        name: '--font-text',
        light: "'Geist Mono', monospace",
      }),
    )
  })

  it.each([
    ['inter', 'Inter, sans-serif'],
    ['source-serif-4', "'Source Serif 4', serif"],
  ] as const)('writes the %s stack as the text font', async (font, stack) => {
    board = writeBoard(PROJECT)

    await writeStarterSheet(board.root, 'acme', { accent: 'blue', font })

    const table = readTokenTable(
      board.root,
      tokenSheetPaths(board.root, 'acme', null),
    )
    expect(table.tokens).toContainEqual(
      expect.objectContaining({ name: '--font-text', light: stack }),
    )
  })

  it('answers the sheet it wrote and the look it holds', async () => {
    board = writeBoard(PROJECT)

    const record = await writeStarterSheet(board.root, 'acme', {
      accent: 'blue',
      font: 'geist',
    })

    expect(record).toEqual({
      project: 'acme',
      path: join(board.root, 'acme', 'tokens.css'),
      accent: 'blue',
      font: 'geist',
    })
  })

  it('reports the sheet as created, so an undo removes it', async () => {
    board = writeBoard(PROJECT)
    const { journal, calls } = recordingJournal(board.root)

    await writeStarterSheet(
      board.root,
      'acme',
      { accent: 'blue', font: 'geist' },
      { journal },
    )

    expect(calls).toEqual([{ kind: 'created', path: 'acme/tokens.css' }])
  })

  it('refuses tokens-exist over a project sheet and leaves it as it was', async () => {
    board = writeBoard({ ...PROJECT, 'acme/tokens.css': ':root{--a:1px}\n' })

    await expect(
      writeStarterSheet(board.root, 'acme', { accent: 'blue', font: 'geist' }),
    ).rejects.toMatchObject({ code: 'tokens-exist' })
    expect(readFileSync(join(board.root, 'acme', 'tokens.css'), 'utf8')).toBe(
      ':root{--a:1px}\n',
    )
  })

  it('refuses tokens-exist under a board sheet', async () => {
    board = writeBoard({ ...PROJECT, 'tokens.css': ':root{--a:1px}\n' })

    await expect(
      writeStarterSheet(board.root, 'acme', { accent: 'blue', font: 'geist' }),
    ).rejects.toMatchObject({
      code: 'tokens-exist',
      details: { sheet: join(board.root, 'tokens.css') },
    })
  })

  it('refuses tokens-exist under a --tokens sheet outside the board', async () => {
    board = writeBoard(PROJECT)
    const given = join(board.root, '..', 'consumer.css')
    writeFileSync(given, ':root{--a:1px}\n')

    await expect(
      writeStarterSheet(
        board.root,
        'acme',
        { accent: 'blue', font: 'geist' },
        { tokens: given },
      ),
    ).rejects.toMatchObject({ code: 'tokens-exist', details: { sheet: given } })
  })

  it('refuses tokens-exist under the --tokens sheet a running server recorded', async () => {
    board = writeBoard({
      ...PROJECT,
      'consumer.css': ':root{--a:1px}\n',
      '.run/address.json': '{}',
    })
    const given = join(board.root, 'consumer.css')
    writeFileSync(
      join(board.root, '.run', 'address.json'),
      JSON.stringify({ tokens: given }),
    )

    await expect(
      writeStarterSheet(board.root, 'acme', { accent: 'blue', font: 'geist' }),
    ).rejects.toMatchObject({ code: 'tokens-exist' })
  })

  it('fails project-not-found for a project the board lacks', async () => {
    board = writeBoard(PROJECT)

    await expect(
      writeStarterSheet(board.root, 'nope', { accent: 'blue', font: 'geist' }),
    ).rejects.toMatchObject({ code: 'project-not-found' })
  })
})
