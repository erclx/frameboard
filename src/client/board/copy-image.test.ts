import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  copyFrameImage,
  copyFramesToClipboard,
  copyStitchedImage,
  stitchLayout,
} from './copy-image'

describe('copyFrameImage', () => {
  it('starts the clipboard write before the image arrives, inside the key press', () => {
    const items: ClipboardItem[][] = []
    const clipboard = {
      write: async (data: ClipboardItem[]) => {
        items.push(data)
        // No board serves the image here, so the pending value refuses.
        await data[0]?.getType('image/png').catch(() => null)
      },
    }

    void copyFrameImage('studio/home/hero', 'dark', clipboard)

    expect(items).toHaveLength(1)
    expect(items[0]?.[0]?.types).toEqual(['image/png'])
  })
})

describe('stitchLayout', () => {
  it('lays the frames out at 2x from the top-left frame, keeping their gaps', () => {
    const layout = stitchLayout([
      { x: 100, y: 50, width: 375, height: 812 },
      { x: 515, y: 50, width: 375, height: 600 },
      { x: 100, y: 902, width: 790, height: 100 },
    ])

    expect(layout).toEqual({
      width: 1580,
      height: 1904,
      places: [
        { x: 0, y: 0, width: 750, height: 1624 },
        { x: 830, y: 0, width: 750, height: 1200 },
        { x: 0, y: 1704, width: 1580, height: 200 },
      ],
    })
  })

  it('scales down so the wider side fits a canvas', () => {
    const layout = stitchLayout([
      { x: 0, y: 0, width: 16384, height: 100 },
      { x: 16384, y: 0, width: 16384, height: 100 },
    ])

    expect(layout).toEqual({
      width: 16384,
      height: 50,
      places: [
        { x: 0, y: 0, width: 8192, height: 50 },
        { x: 8192, y: 0, width: 8192, height: 50 },
      ],
    })
  })
})

describe('copyFramesToClipboard', () => {
  it('posts the refs and theme to the clipboard route and resolves its data', async () => {
    const sent: { path: string; body: unknown }[] = []
    const send = (async (path: string, init?: RequestInit) => {
      sent.push({ path, body: JSON.parse(String(init?.body)) })
      return Response.json({ ok: true, data: { copied: 2, backend: 'wsl' } })
    }) as typeof fetch

    const copied = await copyFramesToClipboard(
      ['studio/home/hero', 'studio/home/about'],
      'light',
      {},
      send,
    )

    expect(sent).toEqual([
      {
        path: '/api/frames/clipboard',
        body: {
          refs: ['studio/home/hero', 'studio/home/about'],
          theme: 'light',
        },
      },
    ])
    expect(copied).toEqual({ copied: 2, backend: 'wsl' })
  })

  it('posts the per-frame themes beside the board theme', async () => {
    const sent: unknown[] = []
    const send = (async (_path: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({ ok: true, data: { copied: 2, backend: 'wsl' } })
    }) as typeof fetch

    await copyFramesToClipboard(
      ['studio/home/hero', 'studio/home/about'],
      'light',
      { 'studio/home/about': 'dark' },
      send,
    )

    expect(sent).toEqual([
      {
        refs: ['studio/home/hero', 'studio/home/about'],
        theme: 'light',
        themes: { 'studio/home/about': 'dark' },
      },
    ])
  })

  it('rejects with the refusal the route answers', async () => {
    const send = (async () =>
      Response.json(
        {
          ok: false,
          error: { code: 'clipboard-unsupported', message: 'No backend.' },
        },
        { status: 501 },
      )) as typeof fetch

    await expect(
      copyFramesToClipboard(['studio/home/hero'], 'dark', {}, send),
    ).rejects.toMatchObject({ code: 'clipboard-unsupported' })
  })
})

describe('copyStitchedImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches each frame in its own theme, falling back to the board theme', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const query = new URL(String(input), location.href).searchParams
      requested.push(`${query.get('ref')} ${query.get('theme')}`)
      return new Response(null, { status: 404 })
    })
    const clipboard = {
      write: async (data: ClipboardItem[]) => {
        // No board serves the images here, so the composition refuses.
        await data[0]?.getType('image/png').catch(() => null)
      },
    }
    const box = { x: 0, y: 0, width: 10, height: 10 }

    await copyStitchedImage(
      [
        { ref: 'studio/home/hero', box },
        { ref: 'studio/home/about', box, theme: 'dark' },
      ],
      'light',
      'white',
      clipboard,
    )

    expect(requested).toEqual([
      'studio/home/hero light',
      'studio/home/about dark',
    ])
  })
})
