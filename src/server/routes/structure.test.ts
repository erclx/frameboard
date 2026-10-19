import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { History } from '../history/stack'
import { structureRoutes } from './structure'

const TOKEN = 'a'.repeat(64)
const BEARER = { authorization: `Bearer ${TOKEN}` }

describe('structureRoutes', () => {
  let board: FixtureBoard
  let history: History

  beforeEach(() => {
    board = copyFixtureBoard('live')
    history = new History(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = BEARER,
  ) {
    return structureRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      history,
    ).request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  const pageOrder = () =>
    JSON.parse(readFileSync(join(board.root, 'studio/project.json'), 'utf8'))
      .pages

  it('refuses a request with no writer and writes nothing', async () => {
    const response = await post('/api/page/add', { ref: 'studio/billing' }, {})

    expect(response.status).toBe(401)
    expect(existsSync(join(board.root, 'studio/billing'))).toBe(false)
  })

  it('answers usage for a body missing its ref', async () => {
    const response = await post('/api/page/rename', { name: 'start' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    })
  })

  it('answers name-taken with 409 and records nothing', async () => {
    const response = await post('/api/page/rename', {
      ref: 'studio/home',
      name: 'pricing',
    })

    expect(response.status).toBe(409)
    expect(history.counts().undo).toBe(0)
  })

  it('adds a page, answering its record, and records one step', async () => {
    const response = await post('/api/page/add', {
      ref: 'studio/billing',
      index: 1,
    })

    expect(await response.json()).toMatchObject({
      ok: true,
      data: { ref: 'studio/billing', index: 1 },
    })
    expect(history.counts()).toEqual({ undo: 1, redo: 0 })
  })

  it('undoes an add back to the page beside it', async () => {
    await post('/api/page/add', { ref: 'studio/billing', index: 1 })

    const answer = await history.undo()

    expect(answer.page).toBe('studio/home')
    expect(existsSync(join(board.root, 'studio/billing'))).toBe(false)
    expect(pageOrder()).toEqual(['home', 'pricing'])
  })

  it('duplicates a page and undoes it back to the source', async () => {
    await post('/api/page/duplicate', { ref: 'studio/home' })

    const answer = await history.undo()

    expect(answer.page).toBe('studio/home')
    expect(existsSync(join(board.root, 'studio/home-2'))).toBe(false)
  })

  it('renames a page and undoes it back to the old name', async () => {
    await post('/api/page/rename', { ref: 'studio/home', name: 'start' })

    const answer = await history.undo()

    expect(answer.page).toBe('studio/home')
    expect(pageOrder()).toEqual(['home', 'pricing'])
  })

  it('moves a page and undoes the order', async () => {
    await post('/api/page/move', { ref: 'studio/pricing', index: 0 })
    expect(pageOrder()).toEqual(['pricing', 'home'])

    await history.undo()

    expect(pageOrder()).toEqual(['home', 'pricing'])
  })

  it('records no step for a move onto its own place', async () => {
    await post('/api/page/move', { ref: 'studio/home', index: 0 })

    expect(history.counts().undo).toBe(0)
  })

  it('deletes a page, answering the page beside it after redo', async () => {
    const response = await post('/api/page/delete', { ref: 'studio/home' })
    expect(await response.json()).toEqual({
      ok: true,
      data: { deleted: 'studio/home' },
    })

    expect((await history.undo()).page).toBe('studio/home')
    expect(existsSync(join(board.root, 'studio/home/hero.html'))).toBe(true)
    expect((await history.redo()).page).toBe('studio/pricing')
  })

  describe('frame routes', () => {
    const layout = () =>
      JSON.parse(
        readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
      ).frames
    const frameFile = (name: string) =>
      join(board.root, `studio/home/${name}.html`)

    it('adds a frame at a preset and point, and undoes it away', async () => {
      const response = await post('/api/frame/add', {
        ref: 'studio/home/card',
        size: 'tablet',
        x: 40,
        y: 60,
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          ref: 'studio/home/card',
          box: { x: 40, y: 60, width: 834, height: 1194 },
        },
      })
      await history.undo()
      expect(existsSync(frameFile('card'))).toBe(false)
      expect(layout().card).toBeUndefined()
    })

    it('duplicates several frames as one step', async () => {
      const response = await post('/api/frame/duplicate', {
        refs: ['studio/home/hero', 'studio/home/mobile'],
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: [{ ref: 'studio/home/hero-2' }, { ref: 'studio/home/mobile-2' }],
      })
      expect(history.counts().undo).toBe(1)
      await history.undo()
      expect(existsSync(frameFile('hero-2'))).toBe(false)
      expect(existsSync(frameFile('mobile-2'))).toBe(false)
    })

    it('renames a frame and undoes it back', async () => {
      await post('/api/frame/rename', { ref: 'studio/home/hero', name: 'top' })
      expect(existsSync(frameFile('top'))).toBe(true)

      await history.undo()

      expect(existsSync(frameFile('hero'))).toBe(true)
      expect(existsSync(frameFile('top'))).toBe(false)
    })

    it('orders a frame to the bottom of the stack', async () => {
      await post('/api/frame/order', { ref: 'studio/home/mobile', index: 0 })

      expect(layout()).toMatchObject({
        mobile: { order: 0 },
        hero: { order: 1 },
      })
    })

    it('sets a flag on several frames as one step', async () => {
      await post('/api/frame/flag', {
        refs: ['studio/home/hero', 'studio/home/mobile'],
        flag: 'hidden',
        on: true,
      })

      expect(layout()).toMatchObject({
        hero: { hidden: true },
        mobile: { hidden: true },
      })
      expect(history.counts().undo).toBe(1)
    })

    it('deletes frames and undoes them back byte for byte', async () => {
      const bytes = readFileSync(frameFile('hero'))

      await post('/api/frame/delete', { refs: ['studio/home/hero'] })
      expect(existsSync(frameFile('hero'))).toBe(false)
      await history.undo()

      expect(readFileSync(frameFile('hero'))).toEqual(bytes)
    })

    it('refuses to delete a locked frame and writes nothing', async () => {
      await post('/api/frame/flag', {
        refs: ['studio/home/hero'],
        flag: 'locked',
        on: true,
      })

      const response = await post('/api/frame/delete', {
        refs: ['studio/home/mobile', 'studio/home/hero'],
      })

      expect(response.status).toBe(423)
      expect(existsSync(frameFile('mobile'))).toBe(true)
      expect(history.counts().undo).toBe(1)
    })

    it('refuses a frame write with no writer', async () => {
      const response = await post(
        '/api/frame/delete',
        { refs: ['studio/home/hero'] },
        {},
      )

      expect(response.status).toBe(401)
      expect(existsSync(frameFile('hero'))).toBe(true)
    })
  })
})
