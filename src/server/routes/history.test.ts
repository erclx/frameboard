import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame } from '../board/frames'
import { addPage } from '../board/pages'
import { renameProject } from '../board/projects'
import { claim, release } from '../claims/store'
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

  describe('a frame another session holds', () => {
    const heroX = () =>
      JSON.parse(
        readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
      ).frames.hero.x

    async function moveHero(x: number): Promise<void> {
      const journal = history.journal()
      await moveFrame(board.root, 'studio/home/hero', {
        cwd: board.root,
        x,
        journal,
      })
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: ['studio/home/hero'],
      })
    }

    beforeEach(async () => {
      await claim(
        board.root,
        {
          frame: 'studio/home/hero',
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
        },
        new Date(),
      )
    })

    it('refuses an undo naming it, keeping the step and the frame', async () => {
      await moveHero(40)

      const response = await post('/api/undo')

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'frame-claimed',
          details: { frame: 'studio/home/hero' },
        },
      })
      expect(heroX()).toBe(40)
      expect(history.counts()).toEqual({ undo: 1, redo: 0 })
    })

    it('checks the step each of two quick undos takes, not the one on top when it arrived', async () => {
      await moveHero(40)
      const journal = history.journal()
      await moveFrame(board.root, 'studio/home/mobile', {
        cwd: board.root,
        x: 2000,
        journal,
      })
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: ['studio/home/mobile'],
      })

      const answers = await Promise.all([post('/api/undo'), post('/api/undo')])

      expect(answers.map((answer) => answer.status)).toEqual([200, 409])
      expect(heroX()).toBe(40)
      expect(history.counts()).toEqual({ undo: 1, redo: 1 })
    })

    it('refuses a redo naming it, keeping the step', async () => {
      await release(board.root, 'sess-a', undefined, new Date())
      await moveHero(40)
      await post('/api/undo')
      await claim(
        board.root,
        {
          frame: 'studio/home/hero',
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
        },
        new Date(),
      )

      const response = await post('/api/redo')

      expect(response.status).toBe(409)
      expect(history.counts()).toEqual({ undo: 0, redo: 1 })
    })

    it('refuses an undo of a project rename moving it', async () => {
      const journal = history.journal()
      await renameProject(board.root, 'studio', 'site', { journal })
      history.record({
        id: journal.id,
        changes: journal.changes,
        page: null,
        frames: [],
      })

      const response = await post('/api/undo')

      expect(response.status).toBe(409)
      expect(existsSync(join(board.root, 'site'))).toBe(true)
    })

    it('lets an undo through that writes no claimed frame', async () => {
      await addBilling()

      const response = await post('/api/undo')

      expect(response.status).toBe(200)
      expect(existsSync(join(board.root, 'studio/billing'))).toBe(false)
    })

    it('undoes once the claim is released', async () => {
      await moveHero(40)
      await release(board.root, 'sess-a', undefined, new Date())

      const response = await post('/api/undo')

      expect(response.status).toBe(200)
      expect(heroX()).toBe(0)
    })

    it('still answers nothing-to-undo on an empty history', async () => {
      const response = await post('/api/undo')

      expect(await response.json()).toMatchObject({
        error: { code: 'nothing-to-undo' },
      })
    })
  })
})
