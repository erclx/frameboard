import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from '@/server/edit/address'
import type { SelectionResult } from '@/shared/records/selection'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

const HERO = 'studio/home/hero'

describe('selection', () => {
  let board: FixtureBoard
  let stop: AbortController

  beforeEach(() => {
    board = copyFixtureBoard('live')
    stop = new AbortController()
  })

  afterEach(async () => {
    stop.abort()
    // Let the aborted server remove its address file and close.
    await new Promise((resolve) => setImmediate(resolve))
    board.cleanup()
  })

  function selection(...flags: string[]) {
    return cli(['selection', ...flags, '--root', board.root], {
      cwd: board.root,
    })
  }

  async function serve(): Promise<string> {
    const run = await cli(
      ['serve', '--json', '--no-open', '--port', '0', '--root', board.root],
      { cwd: board.root, signal: stop.signal },
    )
    return (run.json().data as { url: string }).url
  }

  /** Reports a selection the way the writing tab does, with the address token standing in for its cookie. */
  async function report(url: string, body: unknown): Promise<void> {
    const { token } = JSON.parse(
      readFileSync(join(board.root, '.run/address.json'), 'utf8'),
    ) as { token: string }
    const response = await fetch(`${url}/api/selection`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tab: 't-1', ...(body as object) }),
    })
    expect(response.status).toBe(200)
  }

  it('exits 3 with server-not-running when no server serves the board', async () => {
    const run = await selection('--json')

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('server-not-running')
  })

  it('prints Nothing selected before any tab reports', async () => {
    await serve()

    const run = await selection()

    expect(run.exitCode).toBe(0)
    expect(run.stdout.trim()).toBe('Nothing selected')
  })

  it('reports the selected frames', async () => {
    const url = await serve()
    await report(url, { page: 'studio/home', frames: [HERO], element: null })

    const run = await selection('--json')

    expect(run.json().data).toEqual({
      project: 'studio',
      page: 'home',
      frames: [HERO],
      element: null,
      tabs: 0,
    })
  })

  it("reports an element with a hash 'edit' then accepts", async () => {
    const url = await serve()
    const hash = contentHash(
      readFileSync(join(board.root, 'studio/home/hero.html')),
    )
    await report(url, {
      page: 'studio/home',
      frames: [HERO],
      element: { ref: HERO, index: 6, hash },
    })
    const { element } = (await selection('--json')).json()
      .data as SelectionResult

    const edit = await cli(
      [
        'edit',
        element?.ref ?? '',
        '--index',
        String(element?.index),
        '--hash',
        element?.hash ?? '',
        '--text',
        'Studio two',
        '--json',
        '--root',
        board.root,
      ],
      { cwd: board.root },
    )

    expect(element).toMatchObject({ tag: 'h1', name: 'Studio' })
    expect(edit.exitCode).toBe(0)
  })
})
