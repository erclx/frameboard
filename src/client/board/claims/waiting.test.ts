import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createLiveStore,
  type LiveStore,
  receiveClaims,
} from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import type { Claim } from '@/shared/records/claims'

import {
  afterClaims,
  dropWaiting,
  REFUSAL_GRACE_MS,
  WaitDropped,
  whenFree,
} from './waiting'

const HERO = 'studio/home/hero'

function claimOn(frame = HERO): Claim {
  return {
    frame,
    session: 'sess-a',
    agent: 'claude',
    tag: 'claude · visual-style',
    claimedAt: '2026-10-19T10:00:00.000Z',
    expiresAt: '2026-10-19T10:05:00.000Z',
  }
}

function refusedOn(frame = HERO): BoardWriteError {
  return new BoardWriteError('frame-claimed', `claude is editing ${frame}.`, {
    frame,
    tag: 'claude · visual-style',
    claimedAt: '2026-10-19T10:00:00.000Z',
    expiresAt: '2026-10-19T10:05:00.000Z',
  })
}

/** Settles the microtasks a resolved wait queues before the send runs. */
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('whenFree', () => {
  let live: LiveStore

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T10:00:40.000Z'))
    live = createLiveStore()
    live.setState({ connected: true })
  })

  afterEach(() => {
    dropWaiting()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('sends at once when nobody holds the frame', async () => {
    const send = vi.fn(async () => 'sent')

    await expect(whenFree([HERO], 'move', send, { live })).resolves.toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('holds the send while the frame is claimed, then sends once on release', async () => {
    receiveClaims(live, [claimOn()])
    const send = vi.fn(async () => 'sent')

    const sent = whenFree([HERO], 'move', send, { live })
    await flush()
    expect(send).not.toHaveBeenCalled()

    receiveClaims(live, [])
    await expect(sent).resolves.toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('holds a page edit while a frame under the page is claimed', async () => {
    receiveClaims(live, [claimOn()])
    const send = vi.fn(async () => 'sent')

    const held = whenFree(['studio/home'], 'rename', send, { live })
    await flush()

    expect(send).not.toHaveBeenCalled()
    dropWaiting()
    await expect(held).rejects.toBeInstanceOf(WaitDropped)
  })

  it('holds the send while the socket is down, since its claims are unknown', async () => {
    receiveClaims(live, [claimOn()])
    const send = vi.fn(async () => 'sent')
    const held = whenFree([HERO], 'move', send, { live })

    live.setState({ connected: false, claims: {} })
    await flush()

    expect(send).not.toHaveBeenCalled()
    dropWaiting()
    await expect(held).rejects.toBeInstanceOf(WaitDropped)
  })

  it('waits after a frame-claimed refusal and sends again once the claim drops', async () => {
    const send = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(refusedOn())
      .mockResolvedValueOnce('sent')

    const sent = whenFree([HERO], 'undo', send, { live })
    await flush()
    receiveClaims(live, [claimOn()])
    await flush()
    expect(send).toHaveBeenCalledTimes(1)

    receiveClaims(live, [])
    await expect(sent).resolves.toBe('sent')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends again after a refusal the board never shows a claim for, once the grace passes', async () => {
    const send = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(refusedOn())
      .mockResolvedValueOnce('sent')

    const sent = whenFree([HERO], 'undo', send, { live })
    await flush()
    expect(send).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(REFUSAL_GRACE_MS)
    await expect(sent).resolves.toBe('sent')
  })

  it('passes any other refusal straight to the caller', async () => {
    const stale = new BoardWriteError('stale-layout', 'The frame moved.')

    await expect(
      whenFree([HERO], 'move', () => Promise.reject(stale), { live }),
    ).rejects.toBe(stale)
  })
})

describe('afterClaims', () => {
  let live: LiveStore

  beforeEach(() => {
    live = createLiveStore()
    live.setState({ connected: true })
    receiveClaims(live, [claimOn()])
  })

  afterEach(() => {
    dropWaiting()
  })

  it('drops an older edit of the same kind on the same frame for the newer', async () => {
    const older = afterClaims([HERO], 'move', { live, replace: 'boxes' })

    const newer = afterClaims([HERO], 'resize', { live, replace: 'boxes' })

    await expect(older).rejects.toEqual(new WaitDropped('replaced'))
    receiveClaims(live, [])
    await expect(newer).resolves.toBeUndefined()
  })

  it('keeps an older edit on more frames than the newer one names', async () => {
    const older = afterClaims([HERO, 'studio/home/about'], 'move', {
      live,
      replace: 'boxes',
    })

    const newer = afterClaims([HERO], 'move', { live, replace: 'boxes' })
    receiveClaims(live, [])

    await expect(Promise.all([older, newer])).resolves.toEqual([
      undefined,
      undefined,
    ])
  })

  it('keeps both edits of a kind that does not replace', async () => {
    const first = afterClaims([HERO], 'edit', { live })
    const second = afterClaims([HERO], 'edit', { live })

    receiveClaims(live, [])

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])
  })

  it('drops every waiting edit on Esc, a page change, or Play', async () => {
    const waiting = afterClaims([HERO], 'move', { live })

    dropWaiting()

    await expect(waiting).rejects.toEqual(new WaitDropped('cancelled'))
  })
})
