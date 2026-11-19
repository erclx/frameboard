import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THEME_SCRIPT } from '@/server/look/inject'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { History } from '../history/stack'
import { boardKitsDir } from '../kits/list'
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
    expect(
      existsSync(join(board.root, 'acme/assets/kits/sketch/kit.css')),
    ).toBe(true)

    await history.undo()

    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  it('answers 401 to an install from a tab without the board key', async () => {
    const response = await post(
      '/api/kits/install',
      { project: 'acme', kit: 'sketch' },
      {},
    )

    expect(response.status).toBe(401)
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  it('answers name-taken for a kit the project already holds', async () => {
    await post('/api/kits/install', { project: 'acme', kit: 'clean' })

    const response = await post('/api/kits/install', {
      project: 'acme',
      kit: 'clean',
    })

    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('name-taken')
  })

  it('accepts replace and ignores it, adding the kit beside a project sheet it leaves alone', async () => {
    writeFileSync(join(board.root, 'acme/tokens.css'), ':root { --a: 1 }\n')

    const response = await post('/api/kits/install', {
      project: 'acme',
      kit: 'sketch',
      replace: true,
    })

    expect(response.status).toBe(200)
    expect(readFileSync(join(board.root, 'acme/tokens.css'), 'utf8')).toBe(
      ':root { --a: 1 }\n',
    )
    expect(history.counts().undo).toBe(1)
  })

  describe('remove', () => {
    /** Gives acme the sketch kit and a `hero` frame naming it. */
    function withKitFrame(): void {
      mkdirSync(join(board.root, 'acme/assets/kits/sketch'), {
        recursive: true,
      })
      writeFileSync(join(board.root, 'acme/assets/kits/sketch/kit.css'), '')
      mkdirSync(join(board.root, 'acme/home'))
      writeFileSync(join(board.root, 'acme/home/hero.html'), '<p>Hero</p>\n')
      writeFileSync(
        join(board.root, 'acme/home/layout.json'),
        `${JSON.stringify({
          version: 1,
          frames: {
            hero: {
              x: 0,
              y: 0,
              width: 400,
              height: 300,
              order: 0,
              kit: 'sketch',
            },
          },
        })}\n`,
      )
    }

    function heroEntry(): Record<string, unknown> {
      return JSON.parse(
        readFileSync(join(board.root, 'acme/home/layout.json'), 'utf8'),
      ).frames.hero
    }

    it('removes a kit and answers the frames it cleared', async () => {
      withKitFrame()

      const response = await post('/api/kits/remove', {
        project: 'acme',
        kit: 'sketch',
      })

      expect(await response.json()).toEqual({
        ok: true,
        data: { project: 'acme', kit: 'sketch', frames: ['acme/home/hero'] },
      })
      expect(existsSync(join(board.root, 'acme/assets/kits/sketch'))).toBe(
        false,
      )
      expect(heroEntry()).not.toHaveProperty('kit')
    })

    it('records one step, and its undo restores the folder and the frame naming it', async () => {
      withKitFrame()
      await post('/api/kits/remove', { project: 'acme', kit: 'sketch' })
      expect(history.counts().undo).toBe(1)

      const undone = await history.undo()

      expect(
        existsSync(join(board.root, 'acme/assets/kits/sketch/kit.css')),
      ).toBe(true)
      expect(heroEntry().kit).toBe('sketch')
      expect(undone.frames).toEqual(['acme/home/hero'])
    })

    it('answers 401 to a remove from a tab without the board key', async () => {
      withKitFrame()

      const response = await post(
        '/api/kits/remove',
        { project: 'acme', kit: 'sketch' },
        {},
      )

      expect(response.status).toBe(401)
      expect(existsSync(join(board.root, 'acme/assets/kits/sketch'))).toBe(true)
    })

    it('answers kit-not-found for a kit the project lacks and records no step', async () => {
      withKitFrame()

      const response = await post('/api/kits/remove', {
        project: 'acme',
        kit: 'wireframe',
      })

      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('kit-not-found')
      expect(history.counts().undo).toBe(0)
    })
  })

  it("saves a project's look as a kit the list then answers", async () => {
    writeFileSync(join(board.root, 'acme/tokens.css'), ':root { --a: 1 }\n')

    await post('/api/kits/save', { project: 'acme', name: 'mine' })
    const listed = (await (await app.request('/api/kits')).json()) as {
      data: { name: string; source: string }[]
    }

    expect(listed.data.at(-1)).toMatchObject({ name: 'mine', source: 'board' })
  })

  it("serves a kit's sample frame with the kit's own sheets in its head", async () => {
    const response = await app.request(
      '/frameboard/kits/sketch/kit/sample.html',
    )

    const served = await response.text()
    expect(served).toContain(
      '@import url("/frameboard/kits/sketch/tokens.css");',
    )
    expect(served).toContain('@import url("/frameboard/kits/sketch/kit.css");')
  })

  it('lets a sample frame run the injected theme script alone, by its hash', async () => {
    const response = await app.request(
      '/frameboard/kits/sketch/kit/sample.html',
    )

    expect(response.headers.get('content-security-policy')).toBe(
      `script-src 'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`,
    )
  })

  it.each([
    ['another page', 'notes.html'],
    ['an SVG', 'logo.svg'],
  ])(
    "runs no script from a saved kit's %s, which a frame could embed on the board's origin",
    async (_case, file) => {
      writeFileSync(join(board.root, 'acme/tokens.css'), ':root { --a: 1 }\n')
      await post('/api/kits/save', { project: 'acme', name: 'mine' })
      writeFileSync(
        join(boardKitsDir(board.root), 'mine', file),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>parent.x=1</script></svg>',
      )

      const response = await app.request(`/frameboard/kits/mine/${file}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-security-policy')).toBe(
        `script-src 'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`,
      )
    },
  )

  it("serves a kit's stylesheet byte for byte", async () => {
    const response = await app.request('/frameboard/kits/sketch/kit.css')

    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(await response.text()).toBe(
      readFileSync(
        join(import.meta.dirname, '../kits/shipped/sketch/kit.css'),
        'utf8',
      ),
    )
  })

  it.each([
    ['a kit nobody holds', '/frameboard/kits/missing/kit.css'],
    ['a path out of the kit', '/frameboard/kits/sketch/..%2Fclean%2Fkit.css'],
    ['the kit folder itself', '/frameboard/kits/sketch'],
  ])('answers 404 for %s', async (_case, path) => {
    const response = await app.request(path)

    expect(response.status).toBe(404)
  })
})
