import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Note } from '@/shared/records/notes'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { notesRoutes } from './notes'

const TOKEN = 'a'.repeat(64)
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'
const PORT = 4173
const OWN = `http://127.0.0.1:${PORT}`

describe('notesRoutes', () => {
  let board: FixtureBoard
  let frame: string
  let notesFile: string

  beforeEach(() => {
    board = copyFixtureBoard('live')
    frame = join(board.root, 'studio/home/hero.html')
    notesFile = join(board.root, 'studio/home/notes.json')
  })

  afterEach(() => {
    board.cleanup()
  })

  const routes = () =>
    notesRoutes(board.root, {
      token: () => TOKEN,
      key: KEY,
      cookieName: COOKIE,
      isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
    })

  function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
  ) {
    return routes().request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  function onDisk(): Note[] {
    return JSON.parse(readFileSync(notesFile, 'utf8')).notes
  }

  function renderedAt(): string {
    return new Date(statSync(frame).mtimeMs).toISOString()
  }

  async function pinned(body: Record<string, unknown> = {}): Promise<Note> {
    const response = await post('/api/notes', {
      frame: 'studio/home/hero',
      text: 'Tighten the header',
      ...body,
    })
    return (await response.json()).data.note
  }

  describe('POST /api/notes', () => {
    it('pins a frame note and answers it in the envelope', async () => {
      const note = await pinned()

      expect(note).toMatchObject({
        number: 1,
        frame: 'hero',
        anchor: null,
        state: 'open',
        id: expect.stringMatching(/^n_[0-9a-f]{8}$/),
      })
      expect(onDisk()).toHaveLength(1)
    })

    it('queues a note pinned with a session', async () => {
      expect(await pinned({ to: 'sess-1' })).toMatchObject({
        state: 'queued',
        to: 'sess-1',
      })
    })

    it('anchors an element note the board rendered', async () => {
      const note = await pinned({ element: 4, renderedAt: renderedAt() })

      expect(note.anchor).toMatchObject({ index: 4 })
    })

    it('refuses an element pick from before the frame changed as stale-address', async () => {
      // The board rendered the file as it stood in 2000, before the rewrite.
      const response = await post('/api/notes', {
        frame: 'studio/home/hero',
        text: 'x',
        element: 2,
        renderedAt: '2000-01-01T00:00:00.000Z',
      })

      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('stale-address')
    })

    it('refuses an empty text as usage', async () => {
      const response = await post('/api/notes', {
        frame: 'studio/home/hero',
        text: '  ',
      })

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/notes/:id/replies', () => {
    it('threads a developer reply', async () => {
      const root = await pinned()

      const response = await post(`/api/notes/${root.id}/replies`, {
        text: 'And the footer',
      })

      expect((await response.json()).data.note).toMatchObject({
        thread: root.id,
        from: 'developer',
      })
    })

    it('hands the thread to the session the reply names', async () => {
      const root = await pinned()

      await post(`/api/notes/${root.id}/replies`, { text: 'over', to: 's2' })

      expect(onDisk()[0]).toMatchObject({ to: 's2', state: 'queued' })
    })

    it('refuses an id the board does not hold as note-not-found', async () => {
      const response = await post('/api/notes/n_ffffffff/replies', {
        text: 'x',
      })

      expect(response.status).toBe(404)
      expect((await response.json()).error.code).toBe('note-not-found')
    })
  })

  describe('POST /api/notes/:id/send and done', () => {
    it('queues a saved note to a session', async () => {
      const root = await pinned()

      await post(`/api/notes/${root.id}/send`, { to: 'sess-1' })

      expect(onDisk()[0]).toMatchObject({ state: 'queued', to: 'sess-1' })
    })

    it('closes a note', async () => {
      const root = await pinned()

      await post(`/api/notes/${root.id}/done`, {})

      expect(onDisk()[0]?.state).toBe('done')
    })
  })

  describe('who may write', () => {
    it('refuses a request with neither the bearer nor the cookie as 401', async () => {
      const response = await post(
        '/api/notes',
        { frame: 'studio/home/hero', text: 'x' },
        {},
      )

      expect(response.status).toBe(401)
    })

    it('refuses the cookie from another origin as 401', async () => {
      const response = await post(
        '/api/notes/n_0000000a/done',
        {},
        { cookie: `${COOKIE}=${KEY}`, origin: 'http://127.0.0.1:9999' },
      )

      expect(response.status).toBe(401)
    })

    it("takes the cookie with the board's own origin", async () => {
      const response = await post(
        '/api/notes',
        { frame: 'studio/home/hero', text: 'x' },
        { cookie: `${COOKIE}=${KEY}`, origin: OWN },
      )

      expect(response.status).toBe(200)
    })
  })
})
