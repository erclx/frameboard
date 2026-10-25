import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type {
  ThumbnailFrame,
  ThumbnailStore,
} from '@/server/capture/thumbnails'
import type { Theme } from '@/shared/theme'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { thumbnailRoutes } from './thumbnails'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

/**
 * A store answering `stamp` for every frame it is asked about, and serving
 * `file` for that stamp alone, recording each ask.
 */
function fakeStore(file: string | null = null) {
  const asked: { theme: Theme; frames: ThumbnailFrame[] }[] = []
  const store: ThumbnailStore = {
    ask: (theme, frames) => {
      asked.push({ theme, frames: [...frames] })
      return Object.fromEntries(frames.map((frame) => [frame.ref, 's1']))
    },
    invalidate: () => {},
    file: (_ref, _theme, stamp) => (stamp === 's1' ? file : null),
    settled: async () => {},
    empty: async () => {},
  }
  return { store, asked }
}

function layout(frames: Record<string, object>): string {
  return JSON.stringify({ version: 1, frames })
}

describe('GET /api/thumbnails', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('asks for the visible frames of each project first page and answers their stamps', async () => {
    board = writeBoard({
      'studio/home/hero.html': '<p>Hero</p>',
      'studio/home/draft.html': '<p>Draft</p>',
      'studio/home/layout.json': layout({
        hero: { x: 0, y: 0, width: 390, height: 844, order: 0 },
        draft: {
          x: 400,
          y: 0,
          width: 390,
          height: 844,
          order: 1,
          hidden: true,
        },
      }),
      'studio/settings/form.html': '<p>Form</p>',
      'blog/index/post.html': '<p>Post</p>',
    })
    const { store, asked } = fakeStore()

    const response = await thumbnailRoutes(board.root, store).request(
      '/api/thumbnails?theme=dark',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: { stamps: { 'blog/index/post': 's1', 'studio/home/hero': 's1' } },
    })
    expect(asked).toEqual([
      {
        theme: 'dark',
        frames: [
          { ref: 'blog/index/post', box: { width: 1440, height: 900 } },
          { ref: 'studio/home/hero', box: { width: 390, height: 844 } },
        ],
      },
    ])
  })

  it('asks for the next page when every frame on the first is hidden', async () => {
    board = writeBoard({
      'studio/home/draft.html': '<p>Draft</p>',
      'studio/home/layout.json': layout({
        draft: { x: 0, y: 0, width: 390, height: 844, order: 0, hidden: true },
      }),
      'studio/settings/form.html': '<p>Form</p>',
    })
    const { store, asked } = fakeStore()

    await thumbnailRoutes(board.root, store).request(
      '/api/thumbnails?theme=light',
    )

    expect(asked[0]?.frames.map((frame) => frame.ref)).toEqual([
      'studio/settings/form',
    ])
  })

  it('answers 400 for a theme other than light or dark', async () => {
    board = writeBoard({})
    const { store, asked } = fakeStore()

    const response = await thumbnailRoutes(board.root, store).request(
      '/api/thumbnails?theme=both',
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    })
    expect(asked).toEqual([])
  })
})

describe('GET /api/thumbnails/png', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function served() {
    board = writeBoard({})
    const path = join(board.root, 'hero.light.png')
    writeFileSync(path, PNG)
    return thumbnailRoutes(board.root, fakeStore(path).store)
  }

  it('serves the stored capture for the current stamp, cached for good', async () => {
    const response = await served().request(
      '/api/thumbnails/png?ref=studio/home/hero&theme=light&v=s1',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG)
  })

  it('answers 404 with the envelope for a stale stamp', async () => {
    const response = await served().request(
      '/api/thumbnails/png?ref=studio/home/hero&theme=light&v=s0',
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'frame-not-found' },
    })
  })

  it('answers 400 for a theme other than light or dark', async () => {
    const response = await served().request(
      '/api/thumbnails/png?ref=studio/home/hero&theme=sepia&v=s1',
    )

    expect(response.status).toBe(400)
  })
})
