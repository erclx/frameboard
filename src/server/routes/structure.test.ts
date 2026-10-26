import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { claim, release } from '../claims/store'
import { History } from '../history/stack'
import { structureRoutes } from './structure'

const TOKEN = 'a'.repeat(64)
const BEARER = { authorization: `Bearer ${TOKEN}` }
const ACCESS = {
  token: () => TOKEN,
  key: 'b'.repeat(64),
  cookieName: 'frameboard-key-111111111111',
  isOwnOrigin: () => false,
}

describe('structureRoutes', () => {
  let board: FixtureBoard
  let history: History
  let app: ReturnType<typeof structureRoutes>

  beforeEach(() => {
    board = copyFixtureBoard('live')
    history = new History(board.root)
    app = structureRoutes(board.root, ACCESS, history)
  })

  afterEach(() => {
    board.cleanup()
  })

  function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = BEARER,
  ) {
    return app.request(path, {
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

  it('records a page rename as a rename, for the board to keep its frames', async () => {
    const wrote: unknown[] = []
    history = new History(board.root, undefined, (step) =>
      wrote.push(step.renamed),
    )
    app = structureRoutes(board.root, ACCESS, history)

    await post('/api/page/rename', { ref: 'studio/home', name: 'start' })

    expect(wrote).toEqual([{ before: 'studio/home', after: 'studio/start' }])
  })

  it('records no rename for a page duplicate', async () => {
    const wrote: unknown[] = []
    history = new History(board.root, undefined, (step) =>
      wrote.push(step.renamed),
    )
    app = structureRoutes(board.root, ACCESS, history)

    await post('/api/page/duplicate', { ref: 'studio/home' })

    expect(wrote).toEqual([undefined])
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

  describe('fit route', () => {
    const access = {
      token: () => TOKEN,
      key: 'b'.repeat(64),
      cookieName: 'frameboard-key-111111111111',
      isOwnOrigin: () => false,
    }
    const hero = () =>
      JSON.parse(
        readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
      ).frames.hero

    it('sets the height to the measured content, hugs it, and undoes back', async () => {
      app = structureRoutes(board.root, access, history, async () => ({
        width: 1440,
        height: 1232,
        contentWidth: 1600,
        empty: false,
      }))

      const response = await post('/api/frame/fit', { ref: 'studio/home/hero' })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          frame: { box: { height: 1232 }, hugHeight: true },
          contentHeight: 1232,
          tooWide: true,
        },
      })
      await history.undo()
      expect(hero()).toMatchObject({ height: 900 })
      expect(hero().hugHeight).toBeUndefined()
    })

    it('refuses content sized off the viewport with 422 and writes nothing', async () => {
      app = structureRoutes(board.root, access, history, async () => {
        throw new FrameboardError('fit-unbounded', 'Grows with the viewport.')
      })

      const response = await post('/api/frame/fit', { ref: 'studio/home/hero' })

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        error: { code: 'fit-unbounded' },
      })
      expect(history.counts().undo).toBe(0)
    })

    it('refuses browser-not-found with 503 where no browser runs', async () => {
      const response = await post('/api/frame/fit', { ref: 'studio/home/hero' })

      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: 'browser-not-found' },
      })
    })
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

    it('adds a frame at a width and height that hugs neither axis', async () => {
      await post('/api/frame/add', {
        ref: 'studio/home/card',
        width: 1440,
        height: 900,
        x: 0,
        y: 0,
      })

      expect(layout().card).toMatchObject({
        width: 1440,
        height: 900,
        hugWidth: false,
        hugHeight: false,
      })
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

    it('lands a copy at an offset from its source and undoes it in one step', async () => {
      const { x, y, width, height } = layout().hero
      const source = { x, y, width, height }

      const response = await post('/api/frame/duplicate', {
        refs: ['studio/home/hero'],
        offset: { x: 30, y: -20 },
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: [
          {
            ref: 'studio/home/hero-2',
            box: { ...source, x: source.x + 30, y: source.y - 20 },
          },
        ],
      })
      expect(history.counts().undo).toBe(1)
      await history.undo()
      expect(existsSync(frameFile('hero-2'))).toBe(false)
    })

    it('lands a copy beside its source with no offset', async () => {
      const { x, y, width, height } = layout().hero
      const source = { x, y, width, height }

      const response = await post('/api/frame/duplicate', {
        refs: ['studio/home/hero'],
      })
      const [copy] = (await response.json()).data

      expect([copy.box.x > source.x + source.width, copy.box.y]).toEqual([
        true,
        source.y,
      ])
    })

    it('refuses an offset that is not two whole coordinates', async () => {
      const response = await post('/api/frame/duplicate', {
        refs: ['studio/home/hero'],
        offset: { x: 1.5 },
      })

      expect(response.status).toBe(400)
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

    it('copies frames and pastes them beside the source as one step', async () => {
      await post('/api/clipboard/copy', {
        refs: ['studio/home/hero', 'studio/home/mobile'],
      })

      const response = await post('/api/clipboard/paste', {
        ref: 'studio/home',
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: [{ ref: 'studio/home/hero-2' }, { ref: 'studio/home/mobile-2' }],
      })
      expect(history.counts().undo).toBe(1)
    })

    it('pastes a frame with its top left at the point the body names', async () => {
      await post('/api/clipboard/copy', { refs: ['studio/home/hero'] })

      const response = await post('/api/clipboard/paste', {
        ref: 'studio/home',
        at: { x: -40, y: 300 },
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: [{ ref: 'studio/home/hero-2', box: { x: -40, y: 300 } }],
      })
    })

    it('refuses a paste at a point off the pixel grid', async () => {
      await post('/api/clipboard/copy', { refs: ['studio/home/hero'] })

      const response = await post('/api/clipboard/paste', {
        ref: 'studio/home',
        at: { x: 10.5, y: 0 },
      })

      expect(response.status).toBe(400)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a paste with nothing held', async () => {
      const response = await post('/api/clipboard/paste', {
        ref: 'studio/home',
      })

      expect(response.status).toBe(400)
      expect(history.counts().undo).toBe(0)
    })

    it('cuts a frame as one step and pastes it onto another page', async () => {
      const bytes = readFileSync(frameFile('hero'))

      await post('/api/clipboard/cut', { refs: ['studio/home/hero'] })
      expect(existsSync(frameFile('hero'))).toBe(false)
      await post('/api/clipboard/paste', { ref: 'studio/pricing' })

      expect(
        readFileSync(join(board.root, 'studio/pricing/hero.html')),
      ).toEqual(bytes)
      expect(history.counts().undo).toBe(2)
    })

    it('undoes a cut, restoring the frame byte for byte', async () => {
      const bytes = readFileSync(frameFile('hero'))
      const entry = layout().hero

      await post('/api/clipboard/cut', { refs: ['studio/home/hero'] })
      await history.undo()

      expect(readFileSync(frameFile('hero'))).toEqual(bytes)
      expect(layout().hero).toEqual(entry)
    })

    it('refuses to cut a locked frame and holds nothing', async () => {
      await post('/api/frame/flag', {
        refs: ['studio/home/hero'],
        flag: 'locked',
        on: true,
      })

      const response = await post('/api/clipboard/cut', {
        refs: ['studio/home/hero'],
      })

      expect(response.status).toBe(423)
      expect(existsSync(frameFile('hero'))).toBe(true)
      expect(
        (await post('/api/clipboard/paste', { ref: 'studio/home' })).status,
      ).toBe(400)
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

  describe('project routes', () => {
    it('adds the next free untitled project on each call', async () => {
      const first = await post('/api/project/add', {})
      const second = await post('/api/project/add', {})

      expect(await first.json()).toMatchObject({
        ok: true,
        data: { name: 'untitled' },
      })
      expect(await second.json()).toMatchObject({
        ok: true,
        data: { name: 'untitled-2' },
      })
      expect(history.counts()).toEqual({ undo: 2, redo: 0 })
    })

    it('adds a project by name and undoes it away, staying on home', async () => {
      await post('/api/project/add', { name: 'brand' })

      const answer = await history.undo()

      expect(answer.page).toBeNull()
      expect(existsSync(join(board.root, 'brand'))).toBe(false)
    })

    it('renames a project and undoes it back on disk', async () => {
      const response = await post('/api/project/rename', {
        ref: 'studio',
        name: 'atelier',
      })
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { name: 'atelier' },
      })

      await history.undo()

      expect(existsSync(join(board.root, 'studio/home/hero.html'))).toBe(true)
      expect(existsSync(join(board.root, 'atelier'))).toBe(false)
    })

    it('records a project rename as a rename, for the board to follow its route', async () => {
      const wrote: unknown[] = []
      history = new History(board.root, undefined, (step) =>
        wrote.push(step.renamed),
      )
      app = structureRoutes(board.root, ACCESS, history)

      await post('/api/project/rename', { ref: 'studio', name: 'atelier' })

      expect(wrote).toEqual([{ before: 'studio', after: 'atelier' }])
    })

    it('renames a project to its own name in another case', async () => {
      const response = await post('/api/project/rename', {
        ref: 'studio',
        name: 'Studio',
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: { name: 'Studio' },
      })
    })

    it('duplicates a project and undoes the copy away', async () => {
      const response = await post('/api/project/duplicate', { ref: 'studio' })
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { name: 'studio-2' },
      })

      await history.undo()

      expect(existsSync(join(board.root, 'studio-2'))).toBe(false)
    })

    it('deletes a project and undoes it back with its assets byte for byte', async () => {
      const asset = readFileSync(join(board.root, 'studio/assets/dot.svg'))

      const response = await post('/api/project/delete', { ref: 'studio' })
      expect(await response.json()).toEqual({
        ok: true,
        data: { deleted: 'studio' },
      })
      expect(existsSync(join(board.root, 'studio'))).toBe(false)
      await history.undo()

      expect(readFileSync(join(board.root, 'studio/assets/dot.svg'))).toEqual(
        asset,
      )
    })

    it('refuses to undo a delete once another project took the name', async () => {
      await post('/api/project/delete', { ref: 'studio' })
      mkdirSync(join(board.root, 'studio/agent-page'), { recursive: true })

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(existsSync(join(board.root, 'studio/agent-page'))).toBe(true)
      expect(existsSync(join(board.root, 'studio/home'))).toBe(false)
    })

    it('writes a starter token sheet and undoes it away', async () => {
      const response = await post('/api/project/tokens', {
        ref: 'studio',
        accent: 'green',
        font: 'geist',
      })
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { project: 'studio', accent: 'green', font: 'geist' },
      })
      expect(
        readFileSync(join(board.root, 'studio/tokens.css'), 'utf8'),
      ).toContain('--accent: #30a46c;')

      await history.undo()

      expect(existsSync(join(board.root, 'studio/tokens.css'))).toBe(false)
    })

    it('answers usage for an accent outside the presets', async () => {
      const response = await post('/api/project/tokens', {
        ref: 'studio',
        accent: 'teal',
      })

      expect(response.status).toBe(400)
      expect(existsSync(join(board.root, 'studio/tokens.css'))).toBe(false)
    })

    it('refuses tokens-exist with 409 over the server --tokens sheet', async () => {
      const given = join(board.root, 'consumer.css')
      writeFileSync(given, ':root{--a:1px}\n')
      app = structureRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
        undefined,
        given,
      )

      const response = await post('/api/project/tokens', { ref: 'studio' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'tokens-exist' },
      })
      expect(existsSync(join(board.root, 'studio/tokens.css'))).toBe(false)
      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('refuses a project write with no writer', async () => {
      const response = await post('/api/project/delete', { ref: 'studio' }, {})

      expect(response.status).toBe(401)
      expect(existsSync(join(board.root, 'studio'))).toBe(true)
    })
  })

  describe('claimed frames', () => {
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

    it.each([
      [
        'a page rename',
        '/api/page/rename',
        { ref: 'studio/home', name: 'start' },
      ],
      ['a page delete', '/api/page/delete', { ref: 'studio/home' }],
      [
        'a frame rename',
        '/api/frame/rename',
        { ref: 'studio/home/hero', name: 'banner' },
      ],
      [
        'a delete naming it among others',
        '/api/frame/delete',
        { refs: ['studio/home/mobile', 'studio/home/hero'] },
      ],
      ['a cut', '/api/clipboard/cut', { refs: ['studio/home/hero'] }],
      [
        'a project rename',
        '/api/project/rename',
        { ref: 'studio', name: 'site' },
      ],
      ['a project delete', '/api/project/delete', { ref: 'studio' }],
    ])(
      'refuses %s with frame-claimed and writes nothing',
      async (_, path, body) => {
        const response = await post(path, body)

        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'frame-claimed',
            details: { frame: 'studio/home/hero', tag: 'claude · studio' },
          },
        })
        expect(existsSync(join(board.root, 'studio/home/hero.html'))).toBe(true)
        expect(existsSync(join(board.root, 'studio/home/mobile.html'))).toBe(
          true,
        )
        expect(history.counts().undo).toBe(0)
      },
    )

    it('holds nothing to paste after a refused cut', async () => {
      await post('/api/clipboard/cut', { refs: ['studio/home/hero'] })

      const response = await post('/api/clipboard/paste', {
        ref: 'studio/pricing',
      })

      expect(response.status).toBe(400)
    })

    it('lets the same write through once the claim is released', async () => {
      await release(board.root, 'sess-a', undefined, new Date())

      const response = await post('/api/frame/rename', {
        ref: 'studio/home/hero',
        name: 'banner',
      })

      expect(response.status).toBe(200)
      expect(existsSync(join(board.root, 'studio/home/banner.html'))).toBe(true)
    })

    it.each([
      [
        'a frame duplicate',
        '/api/frame/duplicate',
        { refs: ['studio/home/hero'] },
      ],
      [
        'a frame flag',
        '/api/frame/flag',
        { refs: ['studio/home/hero'], flag: 'hidden', on: true },
      ],
      ['a page move', '/api/page/move', { ref: 'studio/home', index: 1 }],
      ['a page duplicate', '/api/page/duplicate', { ref: 'studio/home' }],
      ['a project duplicate', '/api/project/duplicate', { ref: 'studio' }],
    ])(
      'lets %s through, since it leaves the claimed frame alone',
      async (_, path, body) => {
        const response = await post(path, body)

        expect(response.status).toBe(200)
      },
    )
  })
})
