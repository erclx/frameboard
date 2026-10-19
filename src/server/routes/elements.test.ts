import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from '@/server/edit/address'
import { createSelectionHolder } from '@/server/live/selection'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { elementsRoutes } from './elements'

const TOKEN = 'a'.repeat(64)
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'
const PORT = 4173
const HERO = 'studio/home/hero'

describe('elementsRoutes', () => {
  let board: FixtureBoard
  let routes: ReturnType<typeof elementsRoutes>

  beforeEach(() => {
    board = copyFixtureBoard('live')
    routes = elementsRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: KEY,
        cookieName: COOKIE,
        isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
      },
      createSelectionHolder(() => 1),
    )
  })

  afterEach(() => {
    board.cleanup()
  })

  function heroHash(): string {
    return contentHash(readFileSync(join(board.root, 'studio/home/hero.html')))
  }

  function report(
    body: unknown,
    headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
  ) {
    return routes.request('/api/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  async function selection() {
    return (await (await routes.request('/api/selection')).json()).data
  }

  describe('GET /api/frames/elements', () => {
    it("answers the frame's elements under body with the file's hash", async () => {
      const response = await routes.request(
        `/api/frames/elements?ref=${encodeURIComponent(HERO)}`,
      )

      expect(await response.json()).toEqual({
        ok: true,
        data: {
          ref: HERO,
          hash: heroHash(),
          elements: [
            {
              index: 6,
              parent: null,
              tag: 'h1',
              name: 'Studio',
              textOnly: true,
            },
            {
              index: 7,
              parent: null,
              tag: 'img',
              name: 'dot',
              textOnly: false,
            },
          ],
        },
      })
    })

    it('refuses a frame missing its tbody as address-mismatch', async () => {
      writeFileSync(
        join(board.root, 'studio/home/hero.html'),
        '<body><table><tr><td>a</td></tr></table></body>',
      )

      const response = await routes.request(
        `/api/frames/elements?ref=${encodeURIComponent(HERO)}`,
      )

      expect(response.status).toBe(422)
      expect((await response.json()).error.code).toBe('address-mismatch')
    })

    it('refuses a frame the board does not hold', async () => {
      const response = await routes.request(
        '/api/frames/elements?ref=studio/home/missing',
      )

      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/frames/styles', () => {
    it("answers the element's colors from the linked sheet with the file's hash", async () => {
      const response = await routes.request(
        `/api/frames/styles?ref=${encodeURIComponent(HERO)}&index=6`,
      )

      const { data } = await response.json()
      expect(data.hash).toBe(heroHash())
      expect(data.element.color).toEqual({
        value: 'rgb(20, 90, 60)',
        token: null,
        percent: 100,
      })
    })

    it('answers the frame’s colors with no element for no index', async () => {
      const response = await routes.request(
        `/api/frames/styles?ref=${encodeURIComponent(HERO)}`,
      )

      const { data } = await response.json()
      expect(data.element).toBeNull()
      expect(
        data.colors.map((color: { value: string }) => color.value),
      ).toEqual(['rgb(250, 247, 240)', 'rgb(20, 90, 60)'])
    })

    it('refuses an index the frame holds no element at', async () => {
      const response = await routes.request(
        `/api/frames/styles?ref=${encodeURIComponent(HERO)}&index=99`,
      )

      expect(response.status).toBe(400)
    })
  })

  describe('selection', () => {
    it('answers nothing selected before any tab reports', async () => {
      expect(await selection()).toEqual({
        project: null,
        page: null,
        frames: [],
        element: null,
        tabs: 1,
      })
    })

    it('refuses a report without the board key', async () => {
      const response = await report(
        { tab: 't', page: 'studio/home', frames: [HERO], element: null },
        {},
      )

      expect(response.status).toBe(401)
      expect((await selection()).frames).toEqual([])
    })

    it('answers the reported element with its tag and name', async () => {
      const hash = heroHash()
      await report({
        tab: 't',
        page: 'studio/home',
        frames: [HERO],
        element: { ref: HERO, index: 6, hash },
      })

      expect(await selection()).toEqual({
        project: 'studio',
        page: 'home',
        frames: [HERO],
        element: { ref: HERO, index: 6, hash, tag: 'h1', name: 'Studio' },
        tabs: 1,
      })
    })

    it('drops the element once the file changed past the reported hash', async () => {
      await report({
        tab: 't',
        page: 'studio/home',
        frames: [HERO],
        element: { ref: HERO, index: 6, hash: heroHash() },
      })
      writeFileSync(
        join(board.root, 'studio/home/hero.html'),
        '<body><p>moved</p><h1>Studio</h1></body>',
      )

      const answered = await selection()

      expect(answered.frames).toEqual([HERO])
      expect(answered.element).toBeNull()
    })

    it('refuses a report whose body does not parse', async () => {
      const response = await report({ tab: 't', frames: 'hero' })

      expect(response.status).toBe(400)
    })
  })
})
