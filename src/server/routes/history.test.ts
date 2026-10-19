import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { addPage } from '../board/pages'
import { History } from '../history/stack'
import { historyRoutes } from './history'

const TOKEN = 'a'.repeat(64)

describe('historyRoutes', () => {
  let board: FixtureBoard
  let history: History

  beforeEach(() => {
    board = copyFixtureBoard('live')
    history = new History(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  function post(path: string, authorized = true) {
    return historyRoutes(
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      history,
    ).request(path, {
      method: 'POST',
      headers: authorized ? { authorization: `Bearer ${TOKEN}` } : {},
    })
  }

  async function addBilling(): Promise<void> {
    const journal = history.journal()
    await addPage(board.root, 'studio/billing', { cwd: board.root, journal })
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: { before: 'studio/pricing', after: 'studio/billing' },
      frames: [],
    })
  }

  it('refuses an undo with no writer and keeps the step', async () => {
    await addBilling()

    const response = await post('/api/undo', false)

    expect(response.status).toBe(401)
    expect(history.counts().undo).toBe(1)
  })

  it('undoes and answers the page to show', async () => {
    await addBilling()

    const response = await post('/api/undo')

    expect(await response.json()).toEqual({
      ok: true,
      data: { page: 'studio/pricing', frames: [] },
    })
    expect(existsSync(join(board.root, 'studio/billing'))).toBe(false)
  })

  it('redoes after an undo', async () => {
    await addBilling()
    await post('/api/undo')

    const response = await post('/api/redo')

    expect(await response.json()).toMatchObject({
      data: { page: 'studio/billing' },
    })
    expect(existsSync(join(board.root, 'studio/billing'))).toBe(true)
  })

  it('refuses an undo after a direct file write with 409', async () => {
    await addBilling()
    writeFileSync(join(board.root, 'studio/billing/plan.html'), '<p>agent</p>')

    const response = await post('/api/undo')

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'undo-overtaken' },
    })
    expect(existsSync(join(board.root, 'studio/billing/plan.html'))).toBe(true)
  })

  it('refuses nothing-to-undo on an empty history', async () => {
    const response = await post('/api/redo')

    expect(await response.json()).toMatchObject({
      error: { code: 'nothing-to-undo' },
    })
  })
})
