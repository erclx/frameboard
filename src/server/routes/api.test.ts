import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { apiRoutes, type BoardActions } from './api'

const TOKEN = 'a'.repeat(64)

describe('apiRoutes', () => {
  let board: FixtureBoard
  let shown: string[]
  let opens: number

  beforeEach(() => {
    board = copyFixtureBoard('live')
    shown = []
    opens = 0
  })

  afterEach(() => {
    board.cleanup()
  })

  function routes(actions: Partial<BoardActions> = {}) {
    return apiRoutes(board.root, {
      token: () => TOKEN,
      open: async () => {
        opens += 1
        return true
      },
      show: (ref) => {
        shown.push(ref)
        return 1
      },
      ...actions,
    })
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

  describe('GET /api/author', () => {
    it('answers the signing name in the envelope, null when unset', async () => {
      const response = await routes().request('/api/author')

      const body = await response.json()
      expect(body).toEqual({
        ok: true,
        data: {
          name: expect.toSatisfy(
            (name) => name === null || typeof name === 'string',
          ),
        },
      })
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

    it('refuses every token until the address file records one', async () => {
      const response = await routes({ token: () => null }).request(
        '/api/show',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${TOKEN}` },
          body: '{"ref":"studio/home/hero"}',
        },
      )

      expect(response.status).toBe(401)
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
