import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tokenSheetPaths } from '@/server/checks/tokens'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { claim, release } from '../claims/store'
import { History } from '../history/stack'
import { apiRoutes, type BoardActions } from './api'

const TOKEN = 'a'.repeat(64)
const HOLDER = {
  frame: 'studio/home/hero',
  session: 'sess-a',
  agent: 'claude',
  tag: 'claude · studio',
}
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'
const PORT = 4173
const OWN = `http://127.0.0.1:${PORT}`

describe('apiRoutes', () => {
  let board: FixtureBoard
  let shown: string[]
  let opens: number
  let history: History

  beforeEach(() => {
    board = copyFixtureBoard('live')
    shown = []
    opens = 0
    history = new History(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  function routes(actions: Partial<BoardActions> = {}) {
    return apiRoutes(
      board.root,
      {
        access: {
          token: () => TOKEN,
          key: KEY,
          cookieName: COOKIE,
          isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
        },
        open: async () => {
          opens += 1
          return true
        },
        show: (ref) => {
          shown.push(ref)
          return 1
        },
        ...actions,
      },
      {
        sheets: (project) => tokenSheetPaths(board.root, project, null),
      },
      history,
    )
  }

  function post(path: string, body: unknown, token: string | null = TOKEN) {
    return routes().request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    })
  }

  describe('GET /api/board', () => {
    it('answers the scanned board in the envelope', async () => {
      const response = await routes().request('/api/board')

      const body = await response.json()
      expect(body).toMatchObject({ ok: true, data: { root: board.root } })
      expect(
        body.data.projects[0].pages.map((page: { name: string }) => page.name),
      ).toEqual(['home', 'pricing'])
    })
  })

  describe('GET /api/projects/:project/tokens', () => {
    it("answers the project's token table in the envelope", async () => {
      writeFileSync(
        join(board.root, 'tokens.css'),
        ':root { --fg: #111111 } .dark { --fg: #eeeeee }',
      )

      const response = await routes().request('/api/projects/studio/tokens')

      expect(await response.json()).toEqual({
        ok: true,
        data: {
          sheets: [{ path: 'tokens.css', kind: 'board', error: null }],
          tokens: [
            {
              name: '--fg',
              group: 'color',
              light: '#111111',
              dark: '#eeeeee',
              sheet: 'tokens.css',
            },
          ],
        },
      })
    })

    it('names a sheet that fails to parse rather than answering an empty table', async () => {
      writeFileSync(join(board.root, 'tokens.css'), ':root { --fg: #111')

      const response = await routes().request('/api/projects/studio/tokens')

      const body = await response.json()
      expect(body.data.sheets[0].error).toMatch(/Unclosed block/)
    })

    it.each([
      ['a project that does not exist', '/api/projects/nowhere/tokens'],
      ['a name the board refuses', '/api/projects/.run/tokens'],
    ])('answers project-not-found for %s', async (_case, path) => {
      const response = await routes().request(path)

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'project-not-found' },
      })
    })
  })

  describe('author', () => {
    let config: string

    /**
     * Points the saved name into a temporary folder and shuts out the
     * machine's git config, so no test reads or writes the developer's own
     * name.
     */
    beforeEach(() => {
      config = mkdtempSync(join(tmpdir(), 'frameboard-config-'))
      vi.stubEnv('XDG_CONFIG_HOME', config)
      vi.stubEnv('GIT_CONFIG_GLOBAL', join(config, 'no-global'))
      vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
      vi.stubEnv('GIT_DIR', undefined)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      rmSync(config, { recursive: true, force: true })
    })

    function savedConfig(): unknown {
      return JSON.parse(
        readFileSync(join(config, 'frameboard', 'config.json'), 'utf8'),
      )
    }

    it('reads null with its source when no name is set', async () => {
      const response = await routes().request('/api/author')

      expect(await response.json()).toEqual({
        ok: true,
        data: { name: null, source: null },
      })
    })

    it('saves a name that the read then answers from config', async () => {
      const response = await post('/api/author', { name: '  Grace Hopper ' })

      expect(await response.json()).toEqual({
        ok: true,
        data: { name: 'Grace Hopper', source: 'config' },
      })
      expect(
        await (await routes().request('/api/author')).json(),
      ).toMatchObject({ data: { name: 'Grace Hopper', source: 'config' } })
    })

    it('clears the saved name on an empty one', async () => {
      await post('/api/author', { name: 'Grace Hopper' })

      const response = await post('/api/author', { name: '' })

      expect(await response.json()).toEqual({
        ok: true,
        data: { name: null, source: null },
      })
      expect(savedConfig()).toEqual({})
    })

    it('refuses a name holding a line break with invalid-name', async () => {
      const response = await post('/api/author', { name: 'Grace\nHopper' })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-name' },
      })
    })

    it('refuses a name over 80 characters with invalid-name', async () => {
      const response = await post('/api/author', { name: 'a'.repeat(81) })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'invalid-name' },
      })
    })

    it('refuses a body with no name', async () => {
      const response = await post('/api/author', {})

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'usage' },
      })
    })

    it('refuses a caller with no token and saves nothing', async () => {
      const response = await post('/api/author', { name: 'Mallory' }, null)

      expect(response.status).toBe(401)
      expect(
        await (await routes().request('/api/author')).json(),
      ).toMatchObject({ data: { name: null } })
    })
  })

  describe('POST /api/show', () => {
    it('tells the board tabs to show the frame', async () => {
      const response = await post('/api/show', { ref: 'studio/home/hero' })

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: 'studio/home/hero', tabs: 1 },
      })
      expect(shown).toEqual(['studio/home/hero'])
    })

    it('refuses a body with no ref', async () => {
      const response = await post('/api/show', { frame: 'hero' })

      expect(response.status).toBe(400)
      expect(shown).toEqual([])
    })

    it.each([
      ['no token', null],
      ['a wrong token', 'b'.repeat(64)],
      ['a token of another length', 'short'],
    ])('refuses %s before showing anything', async (_case, token) => {
      const response = await post(
        '/api/show',
        { ref: 'studio/home/hero' },
        token,
      )

      expect(response.status).toBe(401)
      expect(shown).toEqual([])
    })

    it('lets a tab with the board cookie and origin show a frame', async () => {
      const response = await routes().request('/api/show', {
        method: 'POST',
        headers: { cookie: `${COOKIE}=${KEY}`, origin: OWN },
        body: '{"ref":"studio/home/hero"}',
      })

      expect(response.status).toBe(200)
      expect(shown).toEqual(['studio/home/hero'])
    })

    it('refuses the board cookie sent from another local port', async () => {
      const response = await routes().request('/api/show', {
        method: 'POST',
        headers: {
          cookie: `${COOKIE}=${KEY}`,
          origin: 'http://127.0.0.1:9999',
        },
        body: '{"ref":"studio/home/hero"}',
      })

      expect(response.status).toBe(401)
      expect(shown).toEqual([])
    })

    it('refuses every token until the address file records one', async () => {
      const response = await routes({
        access: {
          token: () => null,
          key: KEY,
          cookieName: COOKIE,
          isOwnOrigin: () => false,
        },
      }).request('/api/show', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: '{"ref":"studio/home/hero"}',
      })

      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/frames/boxes', () => {
    const HERO = { x: 0, y: 0, width: 1440, height: 900 }

    function layout() {
      return readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8')
    }

    it('sets the boxes and answers the frames in the envelope', async () => {
      const response = await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: { frames: [{ name: 'hero', box: { ...HERO, x: 40 } }] },
      })
      expect(JSON.parse(layout()).frames.hero).toMatchObject({ x: 40 })
    })

    it('moves a section box beside its members in one write', async () => {
      const box = { x: -40, y: -40, width: 2000, height: 1000 }
      writeFileSync(
        join(board.root, 'studio/home/layout.json'),
        JSON.stringify({
          ...JSON.parse(layout()),
          sections: { flow: { ...box, order: 0 } },
        }),
      )

      await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
        sections: { flow: { ...box, x: 0 } },
        expectedSections: { flow: box },
      })

      const written = JSON.parse(layout())
      expect([written.sections.flow.x, written.frames.hero.x]).toEqual([0, 40])
    })

    it('refuses a request with no token and writes nothing', async () => {
      const bytes = layout()

      const response = await post(
        '/api/frames/boxes',
        {
          page: 'studio/home',
          boxes: { hero: { ...HERO, x: 40 } },
          expected: { hero: HERO },
        },
        null,
      )

      expect(response.status).toBe(401)
      expect(layout()).toBe(bytes)
    })

    it.each([
      ['no expected boxes', { page: 'studio/home', boxes: { hero: HERO } }],
      [
        'a fractional position',
        {
          page: 'studio/home',
          boxes: { hero: { ...HERO, x: 0.5 } },
          expected: { hero: HERO },
        },
      ],
      [
        'a zero width',
        {
          page: 'studio/home',
          boxes: { hero: { ...HERO, width: 0 } },
          expected: { hero: HERO },
        },
      ],
    ])('refuses %s as usage', async (_case, body) => {
      const response = await post('/api/frames/boxes', body)

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'usage' },
      })
    })

    it('answers 409 when the stored box moved since the edit began', async () => {
      const response = await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: { ...HERO, x: 7 } },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-layout' },
      })
    })

    it('records one step a later undo reverts', async () => {
      await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(history.counts()).toEqual({ undo: 1, redo: 0 })
      expect(await history.undo()).toEqual({
        page: null,
        frames: ['studio/home/hero'],
      })
      expect(JSON.parse(layout()).frames.hero).toMatchObject({ x: 0 })
    })

    it('records nothing when it refuses a stale layout', async () => {
      await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: { ...HERO, x: 7 } },
      })

      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('refuses a frame another session holds, writing and recording nothing', async () => {
      await claim(board.root, HOLDER, new Date())
      const bytes = layout()

      const response = await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'frame-claimed',
          details: { frame: 'studio/home/hero' },
        },
      })
      expect(layout()).toBe(bytes)
      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('sets the boxes once the claim is released', async () => {
      await claim(board.root, HOLDER, new Date())
      await release(board.root, HOLDER.session, undefined, new Date())

      const response = await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(response.status).toBe(200)
      expect(JSON.parse(layout()).frames.hero).toMatchObject({ x: 40 })
    })

    it('records nothing when it refuses a locked frame', async () => {
      const page = JSON.parse(layout())
      page.frames.hero.locked = true
      writeFileSync(
        join(board.root, 'studio/home/layout.json'),
        JSON.stringify(page),
      )

      await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('answers 423 for a locked frame', async () => {
      const page = JSON.parse(layout())
      page.frames.hero.locked = true
      writeFileSync(
        join(board.root, 'studio/home/layout.json'),
        JSON.stringify(page),
      )

      const response = await post('/api/frames/boxes', {
        page: 'studio/home',
        boxes: { hero: { ...HERO, x: 40 } },
        expected: { hero: HERO },
      })

      expect(response.status).toBe(423)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-locked' },
      })
    })
  })

  describe('POST /api/open', () => {
    it('answers whether it opened a tab', async () => {
      const response = await post('/api/open', {})

      expect(await response.json()).toEqual({
        ok: true,
        data: { opened: true },
      })
      expect(opens).toBe(1)
    })

    it('refuses a request with no token', async () => {
      const response = await post('/api/open', {}, null)

      expect(response.status).toBe(401)
      expect(opens).toBe(0)
    })
  })
})
