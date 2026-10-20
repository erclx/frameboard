import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore, receiveReload } from '@/client/live/store'
import type { FindResult } from '@/shared/records/find'

import { fetchFind, QUIET_MS, useFindAnswer } from './query'

function result(query: string): FindResult {
  return { project: 'studio', query, hits: [], truncated: false }
}

function deferred() {
  const loads: { query: string; resolve: (result: FindResult) => void }[] = []
  const load = (_project: string, query: string) =>
    new Promise<FindResult>((resolve) => loads.push({ query, resolve }))
  return { load, loads }
}

describe('useFindAnswer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    liveStore.setState({ reloads: {} })
  })

  it('sends one search once the field is quiet', () => {
    const { load, loads } = deferred()
    const { rerender } = renderHook(
      ({ query }) => useFindAnswer('studio', query, 'home', load),
      { initialProps: { query: 's' } },
    )

    rerender({ query: 'st' })
    rerender({ query: 'sta' })
    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })

    expect(loads.map((entry) => entry.query)).toEqual(['sta'])
  })

  it('drops an answer for a search older than the last sent', async () => {
    const { load, loads } = deferred()
    const { result: answer, rerender } = renderHook(
      ({ query }) => useFindAnswer('studio', query, 'home', load),
      { initialProps: { query: 'old' } },
    )
    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })
    rerender({ query: 'new' })
    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })

    await act(async () => {
      loads[1]?.resolve(result('new'))
      loads[0]?.resolve(result('old'))
    })

    expect(answer.current).toMatchObject({
      status: 'ready',
      result: { query: 'new' },
      updating: false,
    })
  })

  it('searches again when a frame of the project reloads', () => {
    const { load, loads } = deferred()
    renderHook(() => useFindAnswer('studio', 'hero', 'home', load))
    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })

    act(() => {
      receiveReload(liveStore, ['studio/home/hero'])
    })
    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })

    expect(loads).toHaveLength(2)
  })

  it('sends nothing for a blank field', () => {
    const { load, loads } = deferred()
    const { result: answer } = renderHook(() =>
      useFindAnswer('studio', '  ', 'home', load),
    )

    act(() => {
      vi.advanceTimersByTime(QUIET_MS)
    })

    expect([loads.length, answer.current.status]).toEqual([0, 'idle'])
  })
})

describe('fetchFind', () => {
  it("throws the server's refusal message", async () => {
    const send: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'project-not-found', message: 'No project studio' },
        }),
        { status: 404 },
      )

    await expect(fetchFind('studio', 'a', send)).rejects.toThrow(
      'No project studio',
    )
  })
})
