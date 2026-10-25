import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const CLI = resolve('dist/cli.js')
const SESSION = 'e2e-session-1'
const run = promisify(execFile)

test.describe('notes sent to a listening session', () => {
  let board: FixtureBoard
  let server: BoardServer
  let follower: ChildProcess | undefined

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    follower?.kill('SIGTERM')
    await server.stop()
    board.cleanup()
  })

  /** Starts `inbox --follow` the way the plugin monitor does, collecting what it prints. */
  function follow(): string[] {
    const lines: string[] = []
    follower = spawn('node', [
      CLI,
      'inbox',
      '--follow',
      '--session',
      SESSION,
      '--root',
      board.root,
    ])
    let pending = ''
    follower.stdout?.on('data', (chunk: Buffer) => {
      pending += chunk.toString()
      const complete = pending.split('\n')
      pending = complete.pop() ?? ''
      lines.push(...complete.filter(Boolean))
    })
    return lines
  }

  test('a note sent from the board reaches the follower once and the reply comes back to its thread', async ({
    page,
  }) => {
    const printed = follow()
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    const hero = page.locator('[data-frame="studio/home/hero"]')
    await expect(hero.locator('iframe')).toBeVisible()

    await page.getByRole('button', { name: 'Note', exact: true }).click()
    const box = await hero.boundingBox()
    if (!box) throw new Error('the hero frame has no box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const composer = page.getByRole('region', { name: 'New note on hero' })
    await expect(composer.getByText('1 listening')).toBeVisible()
    await composer.getByRole('textbox').fill('Make the sky warmer')
    await composer.getByRole('button', { name: 'Send' }).click()

    await expect.poll(() => printed, { timeout: 10_000 }).toHaveLength(1)
    const [line = ''] = printed
    expect(line).toMatch(
      /^frameboard note n_[0-9a-f]{8} on studio\/home\/hero.*: Make the sky warmer \(/,
    )
    const id = /n_[0-9a-f]{8}/.exec(line)?.[0] ?? ''

    await run('node', [
      CLI,
      'notes',
      'reply',
      id,
      'Warmed the horizon',
      '--root',
      board.root,
    ])
    await page.getByRole('button', { name: /^Note \d+ on hero$/ }).click()
    const thread = page.getByRole('region', { name: /^Note \d+$/ })
    await expect(thread.getByText('Warmed the horizon')).toBeVisible()

    await thread.getByRole('button', { name: 'Done' }).click()

    await expect(
      page.getByRole('button', { name: /^Note \d+ on hero$/ }),
    ).toHaveCount(0)
    expect(printed).toHaveLength(1)
  })
})
