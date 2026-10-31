import { afterEach, describe, expect, it } from 'vitest'

import type { RenderFrame } from '@/server/capture/render'
import type { ClipboardFile, ClipboardFiles } from '@/server/clipboard/files'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { clipboardRoutes } from './clipboard'

const TOKEN = 'a'.repeat(64)

describe('POST /api/frames/clipboard', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function setup(clipboard: ClipboardFiles | null) {
    board = writeBoard({
      'studio/home/hero.html': '<p>Hello</p>',
      'studio/home/about.html': '<p>About</p>',
    })
    const renders: string[] = []
    const render: RenderFrame = async (frame, theme, scale) => {
      renders.push(`${frame.ref} ${theme} ${scale}`)
      return Buffer.from(frame.ref)
    }
    const routes = clipboardRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      render,
      clipboard,
    )
    const post = (body: unknown, token: string | null = TOKEN) =>
      routes.request('/api/frames/clipboard', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      })
    return { post, renders }
  }

  function recordingClipboard() {
    const written: ClipboardFile[][] = []
    const clipboard: ClipboardFiles = {
      backend: 'wsl',
      write: async (files) => {
        written.push(files)
      },
    }
    return { clipboard, written }
  }

  it('renders each frame at 2x and puts them on the clipboard as one list', async () => {
    const { clipboard, written } = recordingClipboard()
    const { post, renders } = setup(clipboard)

    const response = await post({
      refs: ['home/hero', 'home/about'],
      theme: 'dark',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: { copied: 2, backend: 'wsl' },
    })
    expect(renders).toEqual([
      'studio/home/hero dark 2',
      'studio/home/about dark 2',
    ])
    expect(written.map((files) => files.map((file) => file.name))).toEqual([
      ['hero', 'about'],
    ])
  })

  it('refuses a request without the board key before rendering', async () => {
    const { clipboard, written } = recordingClipboard()
    const { post, renders } = setup(clipboard)

    const response = await post({ refs: ['home/hero'], theme: 'light' }, null)

    expect(response.status).toBe(401)
    expect([renders, written]).toEqual([[], []])
  })

  it.each([
    ['no refs', { refs: [], theme: 'light' }],
    [
      'a theme other than light or dark',
      { refs: ['home/hero'], theme: 'both' },
    ],
  ])('refuses usage for %s', async (_case, body) => {
    const { clipboard } = recordingClipboard()
    const { post } = setup(clipboard)

    const response = await post(body)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'usage' } })
  })

  it('refuses clipboard-unsupported with no backend, rendering nothing', async () => {
    const { post, renders } = setup(null)

    const response = await post({ refs: ['home/hero'], theme: 'light' })

    expect(response.status).toBe(501)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'clipboard-unsupported' },
    })
    expect(renders).toEqual([])
  })

  it('answers 404 for an unknown frame, writing nothing', async () => {
    const { clipboard, written } = recordingClipboard()
    const { post } = setup(clipboard)

    const response = await post({
      refs: ['home/hero', 'home/missing'],
      theme: 'light',
    })

    expect(response.status).toBe(404)
    expect(written).toEqual([])
  })
})
