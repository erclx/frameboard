import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { History } from '../history/stack'
import { kitRoutes } from './kits'

const TOKEN = 'a'.repeat(64)
const BEARER = { authorization: `Bearer ${TOKEN}` }
const ACCESS = {
  token: () => TOKEN,
  key: 'b'.repeat(64),
  cookieName: 'frameboard-key-111111111111',
  isOwnOrigin: () => false,
}

describe('kitRoutes', () => {
  let board: TempBoard
  let history: History
  let app: ReturnType<typeof kitRoutes>

  beforeEach(() => {
    board = writeBoard({
      'acme/project.json': '{ "version": 1, "pages": [] }\n',
    })
    history = new History(board.root)
    app = kitRoutes(board.root, ACCESS, history, { tokens: null })
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

  it('lists the kits the board can install', async () => {
    const response = await app.request('/api/kits')

    const body = (await response.json()) as { data: { name: string }[] }
    expect(body.data.map((kit) => kit.name)).toEqual([
      'clean',
      'sketch',
      'wireframe',
    ])
  })

  it('installs a kit and records one step an undo takes back', async () => {
    const response = await post('/api/kits/install', {
      project: 'acme',
      kit: 'sketch',
    })
    expect(response.status).toBe(200)
    expect(existsSync(join(board.root, 'acme/assets/kit/kit.css'))).toBe(true)

    await history.undo()

    expect(existsSync(join(board.root, 'acme/tokens.css'))).toBe(false)
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
    expect(existsSync(join(board.root, 'acme/kit'))).toBe(false)
  })

  it('answers 401 to an install from a tab without the board key', async () => {
    const response = await post(
      '/api/kits/install',
      { project: 'acme', kit: 'sketch' },
      {},
    )

    expect(response.status).toBe(401)
    expect(existsSync(join(board.root, 'acme/tokens.css'))).toBe(false)
  })

  it('answers tokens-exist for a project a sheet already reaches', async () => {
    await post('/api/kits/install', { project: 'acme', kit: 'clean' })

    const response = await post('/api/kits/install', {
      project: 'acme',
      kit: 'sketch',
    })

    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('tokens-exist')
  })

  it("saves a project's look as a kit the list then answers", async () => {
    await post('/api/kits/install', { project: 'acme', kit: 'sketch' })

    await post('/api/kits/save', { project: 'acme', name: 'mine' })
    const listed = (await (await app.request('/api/kits')).json()) as {
      data: { name: string; source: string }[]
    }

    expect(listed.data.at(-1)).toMatchObject({ name: 'mine', source: 'board' })
  })

  it("serves a kit's sample frame with the kit's own sheets in its head", async () => {
    const response = await app.request('/kits/sketch/kit/sample.html')

    const served = await response.text()
    expect(served).toContain('@import url("/kits/sketch/tokens.css");')
    expect(served).toContain('@import url("/kits/sketch/kit.css");')
  })

  it("serves a kit's stylesheet byte for byte", async () => {
    const response = await app.request('/kits/sketch/kit.css')

    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(await response.text()).toBe(
      readFileSync(
        join(import.meta.dirname, '../kits/shipped/sketch/kit.css'),
        'utf8',
      ),
    )
  })

  it.each([
    ['a kit nobody holds', '/kits/missing/kit.css'],
    ['a path out of the kit', '/kits/sketch/..%2Fclean%2Fkit.css'],
    ['the kit folder itself', '/kits/sketch'],
  ])('answers 404 for %s', async (_case, path) => {
    const response = await app.request(path)

    expect(response.status).toBe(404)
  })
})
