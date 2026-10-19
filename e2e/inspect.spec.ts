import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import type {
  InspectedElement,
  InspectResult,
} from '../src/shared/records/inspect'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string; details: Record<string, unknown> }
}

test.describe('inspect', () => {
  let board: FixtureBoard

  test.beforeEach(() => {
    board = copyFixtureBoard('capture')
  })

  test.afterEach(() => {
    board.cleanup()
  })

  /** Runs the built CLI on the copied capture board, resolving its exit code and envelope. */
  async function frameboard<T>(
    args: string[],
  ): Promise<{ exitCode: number; envelope: Envelope<T> }> {
    try {
      const { stdout } = await run('node', [
        CLI,
        ...args,
        '--root',
        board.root,
        '--json',
      ])
      return { exitCode: 0, envelope: JSON.parse(stdout) }
    } catch (error) {
      const failed = error as { code: number; stdout: string }
      return { exitCode: failed.code, envelope: JSON.parse(failed.stdout) }
    }
  }

  async function inspect(args: string[]): Promise<InspectResult> {
    const { envelope } = await frameboard<InspectResult>(['inspect', ...args])
    if (!envelope.data) throw new Error(JSON.stringify(envelope.error))
    return envelope.data
  }

  function byIndex(result: InspectResult, index: number): InspectedElement {
    const found = result.elements.find((element) => element.index === index)
    if (!found) throw new Error(`No element ${index} in the report.`)
    return found
  }

  test('reports each rendered element at its file position, leaving unrendered ones out', async () => {
    const result = await inspect(['inspect/basic'])

    expect(result.editable).toBe(true)
    expect(result.elements.map(({ index, tag }) => `${index}:${tag}`)).toEqual([
      '0:html',
      '5:body',
      '6:h1',
      '7:section',
      '8:p',
      '11:footer',
    ])
  })

  test('reports a box, a computed color, and a computed type per element', async () => {
    const result = await inspect(['inspect/basic'])

    expect(byIndex(result, 8)).toMatchObject({
      id: 'note',
      text: 'Note',
      color: 'rgb(255, 0, 0)',
      fontSize: '14px',
      lineHeight: '20px',
      box: { x: 36, width: 328, height: 20 },
    })
    expect(byIndex(result, 6).fontFamily).toContain('Geist')
    expect(byIndex(result, 6)).toMatchObject({
      fontSize: '24px',
      fontWeight: '700',
    })
  })

  test('reads colors from the theme asked for', async () => {
    const light = await inspect(['inspect/basic', '--theme', 'light'])
    const dark = await inspect(['inspect/basic', '--theme', 'dark'])

    expect(byIndex(light, 6).color).toBe('rgb(24, 24, 27)')
    expect(byIndex(dark, 6).color).toBe('rgb(244, 244, 245)')
  })

  test('edits the element at a reported index and changes that element alone', async () => {
    const before = await inspect(['inspect/basic'])

    const edit = await frameboard([
      'edit',
      'inspect/basic',
      '--index',
      '8',
      '--hash',
      before.hash,
      '--style',
      'color=rgb(0, 0, 255)',
    ])
    const after = await inspect(['inspect/basic'])

    expect(edit.exitCode).toBe(0)
    expect(byIndex(after, 8).color).toBe('rgb(0, 0, 255)')
    const changed = after.elements.filter(
      (element, position) =>
        JSON.stringify(element) !== JSON.stringify(before.elements[position]),
    )
    expect(changed.map((element) => element.index)).toEqual([8])
  })

  test('refuses a frame whose script adds an element, naming the first differing index', async () => {
    const { exitCode, envelope } = await frameboard([
      'inspect',
      'inspect/scripted',
    ])

    expect(exitCode).toBe(7)
    expect(envelope.error).toMatchObject({
      code: 'address-mismatch',
      details: {
        ref: 'studio/inspect/scripted',
        index: 7,
        live: 'div',
        file: 'p',
      },
    })
  })

  test('marks a frame with an element the file does not state as not editable', async () => {
    const result = await inspect(['inspect/implied'])

    expect(result.editable).toBe(false)
    expect(result.elements.map((element) => element.tag)).toContain('tbody')
  })

  test('reports one element alone with --index', async () => {
    const result = await inspect(['inspect/basic', '--index', '11'])

    expect(result.elements.map((element) => element.tag)).toEqual(['footer'])
  })

  test('refuses --index on an element with no layout box', async () => {
    const { exitCode, envelope } = await frameboard([
      'inspect',
      'inspect/basic',
      '--index',
      '10',
    ])

    expect(exitCode).toBe(7)
    expect(envelope.error).toMatchObject({
      code: 'invalid-address',
      details: { index: 10 },
    })
  })

  test('refuses font-missing for a face the frame asks for and cannot load', async () => {
    const { exitCode, envelope } = await frameboard(['inspect', 'fonts/brand'])

    expect(exitCode).toBe(10)
    expect(envelope.error).toMatchObject({
      code: 'font-missing',
      details: { family: 'Brand' },
    })
  })
})
