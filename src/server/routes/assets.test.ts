import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { assetsRoutes } from './assets'

const TOKEN = 'a'.repeat(64)
const PORT = 4173

describe('assetsRoutes', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  function routes(limit?: number) {
    return assetsRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
      },
      limit,
    )
  }

  function drop(
    files: [name: string, content: string][],
    {
      project = 'webapp',
      token = TOKEN as string | null,
      limit = undefined as number | undefined,
    } = {},
  ) {
    const form = new FormData()
    for (const [name, content] of files)
      form.append('files', new File([content], name))
    return routes(limit).request(`/api/projects/${project}/assets`, {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body: form,
    })
  }

  describe('GET', () => {
    it('answers an empty list in the envelope for a project with no assets', async () => {
      const response = await routes().request('/api/projects/webapp/assets')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, data: { files: [] } })
    })

    it('answers 404 for a project that does not exist', async () => {
      const response = await routes().request('/api/projects/nope/assets')

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'project-not-found' },
      })
    })
  })

  describe('POST', () => {
    it('writes the files and lists them back', async () => {
      const response = await drop([['hero.png', 'pixels']])

      expect(await response.json()).toEqual({
        ok: true,
        data: {
          added: [{ name: 'hero.png', path: 'hero.png' }],
          refused: [],
        },
      })
      expect(
        readFileSync(join(board.root, 'webapp/assets/hero.png'), 'utf8'),
      ).toBe('pixels')
      const listed = await routes().request('/api/projects/webapp/assets')
      expect(await listed.json()).toEqual({
        ok: true,
        data: { files: [{ path: 'hero.png', kind: 'image', size: 6 }] },
      })
    })

    it('reports a mixed drop as added and refused', async () => {
      const response = await drop([
        ['ok.png', 'x'],
        ['page.html', '<p>'],
      ])

      const { data } = await response.json()
      expect(data.added).toEqual([{ name: 'ok.png', path: 'ok.png' }])
      expect(data.refused).toMatchObject([
        { name: 'page.html', code: 'asset-type-refused' },
      ])
    })

    it('refuses a caller that is not a writer with 401 and writes nothing', async () => {
      const response = await drop([['hero.png', 'x']], { token: null })

      expect(response.status).toBe(401)
      expect(existsSync(join(board.root, 'webapp/assets'))).toBe(false)
    })

    it('answers 404 for a project that does not exist', async () => {
      const response = await drop([['hero.png', 'x']], { project: 'nope' })

      expect(response.status).toBe(404)
    })

    it('answers 400 for a body with no files', async () => {
      const response = await drop([])

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'usage' },
      })
    })

    it('answers 413 in the envelope over the body limit and writes nothing', async () => {
      const response = await drop([['big.png', 'x'.repeat(4096)]], {
        limit: 1024,
      })

      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'asset-too-large' },
      })
      expect(existsSync(join(board.root, 'webapp/assets'))).toBe(false)
    })
  })
})
