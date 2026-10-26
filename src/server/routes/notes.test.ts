import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDispatcher } from '@/server/notes/dispatch'
import { queuedFor } from '@/server/notes/store'
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

  const routes = (imageLimit?: number) =>
    notesRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: KEY,
        cookieName: COOKIE,
        isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
      },
      undefined,
      undefined,
      imageLimit,
    )

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

  describe('dispatch: true', () => {
    // Writes the session and the note line it was handed, then exits 0.
    const STUB =
      'printf "%s\\n%s" "$FRAMEBOARD_SESSION" "$FRAMEBOARD_NOTE" > "$FRAMEBOARD_ROOT/.run/started.txt"'

    const starting = (command = STUB) =>
      notesRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: KEY,
          cookieName: COOKIE,
          isOwnOrigin: () => false,
        },
        undefined,
        createDispatcher({
          command,
          cwd: board.root,
          root: board.root,
          env: { PATH: process.env.PATH },
        }),
      )

    function postTo(
      app: ReturnType<typeof starting>,
      path: string,
      body: unknown,
    ) {
      return app.request(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    function started(): { session: string; line: string } {
      const [session = '', line = ''] = readFileSync(
        join(board.root, '.run/started.txt'),
        'utf8',
      ).split('\n')
      return { session, line }
    }

    it('starts the command with the note when nobody listens', async () => {
      await postTo(starting(), '/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        dispatch: true,
      })

      expect(started().line).toMatch(
        /^frameboard note n_[0-9a-f]{8} on studio\/home\/hero: Tighten the header /,
      )
    })

    it('marks the note delivered to the session it minted', async () => {
      const response = await postTo(starting(), '/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        dispatch: true,
      })

      const { session } = started()
      expect(session).toMatch(/^[0-9a-f-]{36}$/)
      expect(onDisk()[0]).toMatchObject({ state: 'delivered', to: session })
      expect((await response.json()).data.note.state).toBe('delivered')
    })

    it('leaves nothing queued for a follower of the minted session', async () => {
      await postTo(starting(), '/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        dispatch: true,
      })

      await expect(queuedFor(board.root, started().session)).resolves.toEqual(
        [],
      )
    })

    it('hands a saved note to a new session through send', async () => {
      const root = await pinned()

      await postTo(starting(), `/api/notes/${root.id}/send`, { dispatch: true })

      expect(onDisk()[0]).toMatchObject({
        state: 'delivered',
        to: started().session,
      })
    })

    it('starts the session on the reply that hands the thread on', async () => {
      const root = await pinned()

      await postTo(starting(), `/api/notes/${root.id}/replies`, {
        text: 'Make it bolder',
        dispatch: true,
      })

      expect(started().line).toContain(
        `${root.id} on studio/home/hero: Make it bolder`,
      )
      expect(onDisk()).toMatchObject([
        { id: root.id, state: 'delivered' },
        { thread: root.id, text: 'Make it bolder' },
      ])
    })

    it('refuses with no command configured as dispatch-unavailable, writing nothing', async () => {
      const response = await post('/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        dispatch: true,
      })

      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('dispatch-unavailable')
      expect(existsSync(notesFile)).toBe(false)
    })

    it('takes back a pin whose command failed at once', async () => {
      const response = await postTo(starting('exit 3'), '/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        dispatch: true,
      })

      expect(response.status).toBe(502)
      expect((await response.json()).error.code).toBe('dispatch-failed')
      expect(onDisk()).toEqual([])
    })

    it('leaves a sent note open when its command failed at once', async () => {
      const root = await pinned()

      await postTo(starting('exit 3'), `/api/notes/${root.id}/send`, {
        dispatch: true,
      })

      expect(onDisk()[0]).toMatchObject({ state: 'open', to: null })
    })

    it('takes back a reply whose command failed at once', async () => {
      const root = await pinned()

      const response = await postTo(
        starting('exit 3'),
        `/api/notes/${root.id}/replies`,
        { text: 'Make it bolder', dispatch: true },
      )

      expect(response.status).toBe(502)
      expect(onDisk()).toMatchObject([{ id: root.id, state: 'open' }])
      expect(onDisk()).toHaveLength(1)
    })

    it('refuses a session and dispatch together as usage', async () => {
      const response = await postTo(starting(), '/api/notes', {
        frame: 'studio/home/hero',
        text: 'Tighten the header',
        to: 'sess-1',
        dispatch: true,
      })

      expect(response.status).toBe(400)
      expect(existsSync(join(board.root, '.run/started.txt'))).toBe(false)
    })
  })

  describe('note images', () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ])
    const SVG = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )

    function upload(
      files: [name: string, bytes: Uint8Array<ArrayBuffer>][],
      { page = 'studio/home', limit = undefined as number | undefined } = {},
    ) {
      const form = new FormData()
      form.append('page', page)
      for (const [name, bytes] of files)
        form.append('files', new File([bytes], name))
      return routes(limit).request('/api/notes/images', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: form,
      })
    }

    async function uploaded(): Promise<string> {
      const response = await upload([['shot.png', PNG]])
      return (await response.json()).data.images[0]
    }

    it("saves an upload to the page's .notes and answers its path", async () => {
      const response = await upload([['shot.png', PNG]])

      const { images } = (await response.json()).data
      expect(images).toEqual([
        expect.stringMatching(/^\.notes\/[0-9a-f]{12}\.png$/),
      ])
      expect(readFileSync(join(board.root, 'studio/home', images[0]))).toEqual(
        Buffer.from(PNG),
      )
    })

    it('refuses an SVG and saves nothing', async () => {
      const response = await upload([
        ['shot.png', PNG],
        ['logo.svg', SVG],
      ])

      expect(response.status).toBe(415)
      expect((await response.json()).error.code).toBe('image-type-refused')
      expect(existsSync(join(board.root, 'studio/home/.notes'))).toBe(false)
    })

    it('refuses an upload over the limit as asset-too-large', async () => {
      const response = await upload([['shot.png', new Uint8Array(4096)]], {
        limit: 1024,
      })

      expect(response.status).toBe(413)
      expect((await response.json()).error.code).toBe('asset-too-large')
    })

    it('refuses an upload to a page the board does not hold', async () => {
      const response = await upload([['shot.png', PNG]], {
        page: 'studio/nope',
      })

      expect(response.status).toBe(404)
    })

    it('pins a note carrying an uploaded image', async () => {
      const image = await uploaded()

      await pinned({ images: [image] })

      expect(onDisk()[0]?.images).toEqual([image])
    })

    it('refuses a note naming an image its page does not hold', async () => {
      const response = await post('/api/notes', {
        frame: 'studio/home/hero',
        text: 'x',
        images: ['.notes/000000000000.png'],
      })

      expect(response.status).toBe(400)
      expect(existsSync(notesFile)).toBe(false)
    })

    it('refuses an image path reaching out of .notes', async () => {
      const response = await post('/api/notes', {
        frame: 'studio/home/hero',
        text: 'x',
        images: ['hero.html'],
      })

      expect(response.status).toBe(400)
    })

    it('threads a reply carrying its images', async () => {
      const root = await pinned()
      const image = await uploaded()

      const response = await post(`/api/notes/${root.id}/replies`, {
        text: 'Like this',
        images: [image],
      })

      expect((await response.json()).data.note).toMatchObject({
        thread: root.id,
        images: [image],
      })
    })

    it('serves a stored image with no writer check', async () => {
      const image = await uploaded()

      const response = await routes().request(
        `/api/note-images/studio/home/${image.slice('.notes/'.length)}`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    })

    it('answers 404 for a page file that is not a stored image', async () => {
      const response = await routes().request(
        '/api/note-images/studio/home/notes.json',
      )

      expect(response.status).toBe(404)
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
