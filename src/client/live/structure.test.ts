import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dropWaiting } from '@/client/board/claims/waiting'

import { liveStore, receiveClaims } from './store'
import { createStructure } from './structure'

describe('createStructure on a frame another session holds', () => {
  let paths: string[]
  const send: typeof fetch = async (path) => {
    paths.push(String(path))
    return Response.json({ ok: true, data: {} })
  }

  beforeEach(() => {
    paths = []
    liveStore.setState({ connected: true })
    receiveClaims(liveStore, [
      {
        frame: 'studio/home/hero',
        session: 'sess-a',
        agent: 'claude',
        tag: 'claude · visual-style',
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2099-10-19T10:05:00.000Z',
      },
    ])
  })

  afterEach(() => {
    dropWaiting()
    receiveClaims(liveStore, [])
  })

  it.each([
    [
      'a page rename',
      (calls: ReturnType<typeof createStructure>) =>
        calls.renamePage('studio/home', 'start'),
    ],
    [
      'a page delete',
      (calls: ReturnType<typeof createStructure>) =>
        calls.deletePage('studio/home'),
    ],
    [
      'a frame rename',
      (calls: ReturnType<typeof createStructure>) =>
        calls.renameFrame('studio/home/hero', 'banner'),
    ],
    [
      'a frame delete',
      (calls: ReturnType<typeof createStructure>) =>
        calls.deleteFrames(['studio/home/hero']),
    ],
    [
      'a cut',
      (calls: ReturnType<typeof createStructure>) =>
        calls.cutFrames(['studio/home/hero']),
    ],
  ])('holds %s until the claim drops, then sends it once', async (_, call) => {
    const written = call(createStructure(send))
    await Promise.resolve()
    expect(paths).toEqual([])

    receiveClaims(liveStore, [])
    await written

    expect(paths).toHaveLength(1)
  })

  it('sends a duplicate at once, since it leaves the claimed frame alone', async () => {
    await createStructure(send).duplicateFrames(['studio/home/hero'])

    expect(paths).toEqual(['/api/frame/duplicate'])
  })
})
