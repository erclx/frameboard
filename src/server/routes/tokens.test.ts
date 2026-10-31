import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tokenSheetPaths } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import { readTokenTable } from '@/server/look/token-table'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { History } from '../history/stack'
import { tokenRoutes } from './tokens'

const TOKEN = 'a'.repeat(64)
const BEARER = { authorization: `Bearer ${TOKEN}` }
const ACCESS = {
  token: () => TOKEN,
  key: 'b'.repeat(64),
  cookieName: 'frameboard-key-111111111111',
  isOwnOrigin: () => false,
}

describe('tokenRoutes', () => {
  let board: FixtureBoard
  let history: History
  let app: ReturnType<typeof tokenRoutes>

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    history = new History(board.root)
    app = tokenRoutes(board.root, ACCESS, history, {
      sheets: (project) => tokenSheetPaths(board.root, project, null),
    })
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)
  const read = (path: string) => readFileSync(at(path), 'utf8')
  const hashOf = (path: string) => contentHash(readFileSync(at(path)))

  function post(body: unknown, headers: Record<string, string> = BEARER) {
    return app.request('/api/tokens/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  async function codeOf(response: Response): Promise<string> {
    const body = (await response.json()) as { error: { code: string } }
    return body.error.code
  }

  describe('a landed edit', () => {
    it("writes a board token into the project's sheet and answers its values", async () => {
      const response = await post({
        project: 'webapp',
        name: '--primary',
        side: 'light',
        value: '#222222',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        ok: true,
        data: {
          project: 'webapp',
          name: '--primary',
          light: '#222222',
          dark: '#818cf8',
          hash: hashOf('webapp/tokens.css'),
          sheet: 'project',
          created: false,
        },
      })
    })

    it('leaves the board sheet alone when the body names no sheet', async () => {
      const boardSheet = read('tokens.css')

      await post({
        project: 'webapp',
        name: '--primary',
        side: 'both',
        value: '#222222',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(read('tokens.css')).toBe(boardSheet)
    })

    it('records one step whose undo puts the sheet back byte for byte', async () => {
      const original = read('webapp/tokens.css')
      await post({
        project: 'webapp',
        name: '--accent',
        side: 'dark',
        value: '#000000',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read('webapp/tokens.css')).toBe(original)
    })

    it('refuses an undo once an agent rewrote the token', async () => {
      await post({
        project: 'webapp',
        name: '--accent',
        side: 'dark',
        value: '#000000',
        hash: hashOf('webapp/tokens.css'),
      })
      const agent = read('webapp/tokens.css').replace('#000000', '#123456')
      writeFileSync(at('webapp/tokens.css'), agent)

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(read('webapp/tokens.css')).toBe(agent)
    })

    it('resets an override back to the board value', async () => {
      const response = await post({
        project: 'webapp',
        name: '--accent',
        reset: true,
        hash: hashOf('webapp/tokens.css'),
      })

      expect(await response.json()).toMatchObject({
        data: { light: '#f59e0b', dark: '#fbbf24' },
      })
      expect(read('webapp/tokens.css')).not.toContain('--accent')
    })
  })

  describe('a board edit', () => {
    const rowIn = (project: string, name: string) =>
      readTokenTable(
        board.root,
        tokenSheetPaths(board.root, project, null),
      ).tokens.find((row) => row.name === name)

    it('writes the board sheet, which every project without an override follows', async () => {
      const webapp = read('webapp/tokens.css')

      const response = await post({
        project: 'webapp',
        sheet: 'board',
        name: '--primary',
        side: 'light',
        value: '#222222',
        hash: hashOf('tokens.css'),
      })

      expect(await response.json()).toEqual({
        ok: true,
        data: {
          project: 'webapp',
          name: '--primary',
          light: '#222222',
          dark: '#818cf8',
          hash: hashOf('tokens.css'),
          sheet: 'board',
          created: false,
        },
      })
      expect(rowIn('webapp', '--primary')?.light).toBe('#222222')
      expect(rowIn('marketing', '--primary')?.light).toBe('#222222')
      expect(read('webapp/tokens.css')).toBe(webapp)
    })

    it("keeps a project's override of the token", async () => {
      await post({
        project: 'marketing',
        sheet: 'board',
        name: '--accent',
        side: 'both',
        value: '#000000',
        hash: hashOf('tokens.css'),
      })

      expect(rowIn('marketing', '--accent')).toMatchObject({
        light: '#000000',
        dark: '#000000',
      })
      expect(rowIn('webapp', '--accent')).toMatchObject({
        light: '#e11d48',
        dark: '#fb7185',
      })
    })

    it('reaches the theme a project leaves to the board', async () => {
      writeFileSync(
        at('webapp/tokens.css'),
        "[data-theme='light'] { --accent: #e11d48; }\n",
      )

      await post({
        project: 'webapp',
        sheet: 'board',
        name: '--accent',
        side: 'dark',
        value: '#000000',
        hash: hashOf('tokens.css'),
      })

      expect(rowIn('webapp', '--accent')).toMatchObject({
        light: '#e11d48',
        dark: '#000000',
      })
    })

    it('records one step whose undo puts the board sheet back byte for byte', async () => {
      const original = read('tokens.css')
      await post({
        project: 'webapp',
        sheet: 'board',
        name: '--space',
        side: 'both',
        value: '20px',
        hash: hashOf('tokens.css'),
      })

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read('tokens.css')).toBe(original)
    })

    it('refuses stale-tokens for a board hash the sheet no longer has', async () => {
      const original = read('tokens.css')

      const response = await post({
        project: 'webapp',
        sheet: 'board',
        name: '--primary',
        side: 'light',
        value: '#000000',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(response.status).toBe(409)
      expect(await codeOf(response)).toBe('stale-tokens')
      expect(read('tokens.css')).toBe(original)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a reset, since nothing sits under the board sheet', async () => {
      const response = await post({
        project: 'webapp',
        sheet: 'board',
        name: '--primary',
        reset: true,
        hash: hashOf('tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
    })

    it('refuses a token only the project sheet sets', async () => {
      const original = read('tokens.css')

      const response = await post({
        project: 'webapp',
        sheet: 'board',
        name: '--border',
        side: 'light',
        value: '#000000',
        hash: hashOf('tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
      expect(read('tokens.css')).toBe(original)
    })

    it('leaves a --tokens sheet outside the board folder as it is', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'frameboard-tokens-'))
      const sheet = join(outside, 'tokens.css')
      const css = ':root { --primary: red; }\n'
      writeFileSync(sheet, css)
      const consumer = tokenRoutes(board.root, ACCESS, history, {
        sheets: (project) => tokenSheetPaths(board.root, project, sheet),
      })

      try {
        const response = await consumer.request('/api/tokens/edit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...BEARER },
          body: JSON.stringify({
            project: 'webapp',
            sheet: 'board',
            name: '--primary',
            side: 'light',
            value: '#000000',
            hash: contentHash(readFileSync(sheet)),
          }),
        })

        expect(await codeOf(response)).toBe('invalid-edit')
        expect(readFileSync(sheet, 'utf8')).toBe(css)
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })
  })

  describe('a project with no sheet', () => {
    it('creates the sheet for a null hash and says so', async () => {
      const response = await post({
        project: 'marketing',
        name: '--primary',
        side: 'light',
        value: '#222222',
        hash: null,
      })

      expect(await response.json()).toMatchObject({
        data: { created: true, light: '#222222', dark: '#818cf8' },
      })
      expect(read('marketing/tokens.css')).toContain('--primary: #222222;')
    })

    it('takes a created sheet out on undo', async () => {
      await post({
        project: 'marketing',
        name: '--primary',
        side: 'light',
        value: '#222222',
        hash: null,
      })

      await history.undo()

      expect(existsSync(at('marketing/tokens.css'))).toBe(false)
    })

    it('refuses stale-tokens once a sheet was created meanwhile', async () => {
      writeFileSync(at('marketing/tokens.css'), ':root { --primary: red }')

      const response = await post({
        project: 'marketing',
        name: '--primary',
        side: 'light',
        value: '#222222',
        hash: null,
      })

      expect(response.status).toBe(409)
      expect(await codeOf(response)).toBe('stale-tokens')
      expect(read('marketing/tokens.css')).toBe(':root { --primary: red }')
    })
  })

  describe('refusals', () => {
    it('refuses stale-tokens for a hash the sheet no longer has', async () => {
      const original = read('webapp/tokens.css')

      const response = await post({
        project: 'webapp',
        name: '--accent',
        side: 'light',
        value: '#000000',
        hash: 'f'.repeat(64),
      })

      expect(response.status).toBe(409)
      expect(await codeOf(response)).toBe('stale-tokens')
      expect(read('webapp/tokens.css')).toBe(original)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a value that would close the rule', async () => {
      const original = read('webapp/tokens.css')

      const response = await post({
        project: 'webapp',
        name: '--accent',
        side: 'light',
        value: '#fff; } body { display: none',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
      expect(read('webapp/tokens.css')).toBe(original)
    })

    it('refuses a name the sheets do not list', async () => {
      const response = await post({
        project: 'webapp',
        name: '--nowhere',
        side: 'light',
        value: '#000000',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
    })

    it('refuses a reset of a token the board does not set', async () => {
      const response = await post({
        project: 'webapp',
        name: '--border',
        reset: true,
        hash: hashOf('webapp/tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
    })

    it('leaves a project sheet that does not parse as it is', async () => {
      writeFileSync(at('webapp/tokens.css'), ':root { --accent: red')

      const response = await post({
        project: 'webapp',
        name: '--primary',
        side: 'light',
        value: '#000000',
        hash: hashOf('webapp/tokens.css'),
      })

      expect(await codeOf(response)).toBe('invalid-edit')
      expect(read('webapp/tokens.css')).toBe(':root { --accent: red')
    })

    it('answers 401 without the writer token', async () => {
      const response = await post(
        {
          project: 'webapp',
          name: '--accent',
          side: 'light',
          value: '#000000',
          hash: hashOf('webapp/tokens.css'),
        },
        {},
      )

      expect(response.status).toBe(401)
    })
  })
})
