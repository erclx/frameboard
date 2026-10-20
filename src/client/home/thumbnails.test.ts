import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createLiveStore,
  liveStore,
  receiveBoard,
  receiveReload,
  receiveThumbnails,
} from '@/client/live/store'
import { themeStore } from '@/client/theme/store'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import { useThumbnails } from './thumbnails'

/** Longer than the hook's wait, so a burst has settled into one ask. */
const SETTLE_MS = 500

function frameAt(name: string, width = 390): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width, height: 844 },
    order: 0,
    hidden: false,
    locked: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
  }
}

function boardOf(...frames: FrameRecord[]): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        createdAt: null,
        projectFileError: null,
        pages: [
          {
            ref: 'studio/home',
            project: 'studio',
            name: 'home',
            path: '/board/studio/home',
            index: 0,
            layoutError: null,
            frames,
          },
        ],
      },
    ],
  }
}

/** A thumbnail route answering `stamps`, recording the URL of each ask. */
function server(stamps: Record<string, string> = {}) {
  const asked: string[] = []
  const send = (async (url: string) => {
    asked.push(url)
    return Response.json({ ok: true, data: { stamps } })
  }) as typeof fetch
  return { send, asked }
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
  })
}

describe('useThumbnails', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    liveStore.setState(createLiveStore().getState())
    themeStore.setState({ choice: 'system', system: 'light' })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('asks for the theme shown once connected and keeps the stamps answered', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    liveStore.setState({ connected: true })
    const route = server({ 'studio/home/hero': 'r1-0-390x844' })

    renderHook(() => useThumbnails(route.send))
    await settle()

    expect(route.asked).toEqual(['/api/thumbnails?theme=light'])
    expect(liveStore.getState().thumbnails.light).toEqual({
      'studio/home/hero': 'r1-0-390x844',
    })
  })

  it('asks nothing while the socket is closed', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    const route = server()

    renderHook(() => useThumbnails(route.send))
    await settle()

    expect(route.asked).toEqual([])
  })

  it('does not ask again as a render lands', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    liveStore.setState({ connected: true })
    const route = server()
    renderHook(() => useThumbnails(route.send))
    await settle()

    act(() =>
      receiveThumbnails(liveStore, 'light', {
        'studio/home/hero': 'r1-0-390x844',
      }),
    )
    await settle()

    expect(route.asked).toHaveLength(1)
  })

  it('asks once more for a batch reloading several frames', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero'), frameAt('about')))
    liveStore.setState({ connected: true })
    const route = server()
    renderHook(() => useThumbnails(route.send))
    await settle()

    act(() => {
      receiveReload(liveStore, ['studio/home/hero', 'studio/home/about'])
      receiveThumbnails(liveStore, 'light', {
        'studio/home/hero': null,
        'studio/home/about': null,
      })
    })
    await settle()

    expect(route.asked).toHaveLength(2)
  })

  it('asks again for a frame resized with no reload', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    liveStore.setState({ connected: true })
    const route = server()
    renderHook(() => useThumbnails(route.send))
    await settle()

    act(() => receiveBoard(liveStore, boardOf(frameAt('hero', 768))))
    await settle()

    expect(route.asked).toHaveLength(2)
  })

  it('asks for the other theme on a flip', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    liveStore.setState({ connected: true })
    const route = server()
    renderHook(() => useThumbnails(route.send))
    await settle()

    act(() => themeStore.setState({ choice: 'dark' }))
    await settle()

    expect(route.asked).toEqual([
      '/api/thumbnails?theme=light',
      '/api/thumbnails?theme=dark',
    ])
  })

  it('asks for nothing on a board whose first pages hold no visible frame', async () => {
    receiveBoard(liveStore, boardOf({ ...frameAt('hero'), hidden: true }))
    liveStore.setState({ connected: true })
    const route = server()

    renderHook(() => useThumbnails(route.send))
    await settle()

    expect(route.asked).toEqual([])
  })

  it('keeps the skeleton when the ask fails', async () => {
    receiveBoard(liveStore, boardOf(frameAt('hero')))
    liveStore.setState({ connected: true })
    const send = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch

    renderHook(() => useThumbnails(send))
    await settle()

    expect(liveStore.getState().thumbnails.light).toEqual({})
  })
})
