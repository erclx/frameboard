import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import { createRenderedFindings } from './rendered-findings'

/** A board of one page holding frames by name, each at the box and file time given. */
function boardOf(
  frames: Record<
    string,
    { width: number; height: number; modifiedAt?: string }
  >,
) {
  const records: FrameRecord[] = Object.entries(frames).map(
    ([name, { modifiedAt = '2026-10-19T00:00:00.000Z', ...box }], order) => ({
      ref: `site/home/${name}`,
      project: 'site',
      page: 'home',
      name,
      path: `/board/site/home/${name}.html`,
      box: { x: 0, y: 0, ...box },
      order,
      hidden: false,
      locked: false,
      placed: true,
      modifiedAt,
    }),
  )
  const board: ListResult = {
    root: '/board',
    projects: [
      {
        name: 'site',
        path: '/board/site',
        modifiedAt: '2026-10-19T00:00:00.000Z',
        createdAt: null,
        pages: [
          {
            ref: 'site/home',
            project: 'site',
            name: 'home',
            path: '/board/site/home',
            index: 0,
            layoutError: null,
            frames: records,
          },
        ],
      },
    ],
  } as ListResult
  return board
}

function clipped(ref: string, message = 'cut off'): Finding {
  return {
    rule: 'clipped',
    severity: 'error',
    frame: ref,
    path: `${ref}.html`,
    message,
    location: null,
  }
}

/** A check whose every call waits until the test releases it. */
function heldCheck() {
  const calls: {
    frame: FrameRecord
    land: (findings: Finding[]) => void
    fail: (error: Error) => void
  }[] = []
  const check = (frame: FrameRecord) =>
    new Promise<Finding[]>((resolve, reject) => {
      calls.push({ frame, land: resolve, fail: reject })
    })
  return { calls, check }
}

const BOX = { width: 400, height: 300 }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createRenderedFindings', () => {
  it('sweeps every frame on the first queue, one at a time', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })

    rendered.queue(boardOf({ hero: BOX, about: BOX }), [])
    await tick()
    const startedFirst = calls.map((call) => call.frame.ref)
    calls[0]?.land([])
    await tick()

    expect(startedFirst).toEqual(['site/home/hero'])
    expect(calls.map((call) => call.frame.ref)).toEqual([
      'site/home/hero',
      'site/home/about',
    ])
  })

  it('drops a result for a frame queued again before it landed', async () => {
    const { calls, check } = heldCheck()
    const landed: [string, Finding[]][] = []
    const rendered = createRenderedFindings({
      check,
      onResult: (ref, findings) => landed.push([ref, findings]),
    })
    const board = boardOf({ hero: BOX })
    rendered.queue(board, [])
    await tick()

    rendered.queue(board, ['site/home/hero'])
    calls[0]?.land([clipped('site/home/hero', 'older file')])
    await tick()
    calls[1]?.land([])
    await tick()

    expect(landed).toEqual([['site/home/hero', []]])
  })

  it('queues a frame whose box changed with no file write', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    rendered.queue(boardOf({ hero: BOX }), [])
    await tick()
    calls[0]?.land([])
    await tick()

    rendered.queue(boardOf({ hero: { width: 400, height: 120 } }), [])
    await tick()

    expect(calls.map((call) => call.frame.box.height)).toEqual([300, 120])
  })

  it('queues a frame whose file changed before any batch named it', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    rendered.queue(boardOf({ hero: BOX }), [])
    await tick()
    calls[0]?.land([])
    await tick()

    rendered.queue(
      boardOf({ hero: { ...BOX, modifiedAt: '2026-10-19T00:00:05.000Z' } }),
      [],
    )
    await tick()

    expect(calls).toHaveLength(2)
  })

  it('lands an empty list for a frame whose recheck failed', async () => {
    const { calls, check } = heldCheck()
    const landed: [string, Finding[]][] = []
    const rendered = createRenderedFindings({
      check,
      onResult: (ref, findings) => landed.push([ref, findings]),
    })
    rendered.queue(boardOf({ hero: BOX }), [])
    await tick()

    calls[0]?.fail(new Error('Timeout 10000ms exceeded.'))
    await rendered.settle(['site/home/hero'])

    expect(landed).toEqual([['site/home/hero', []]])
  })

  it('queues every frame again once a browser launches after one did not', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    rendered.queue(boardOf({ hero: BOX, about: BOX }), [])
    await tick()
    calls[0]?.fail(new FrameboardError('browser-not-found', 'No shell.'))
    await tick()
    calls[1]?.fail(new FrameboardError('browser-not-found', 'No shell.'))
    await tick()

    rendered.queue(boardOf({ hero: BOX, about: BOX }), ['site/home/hero'])
    await tick()
    calls[2]?.land([])
    await tick()

    expect(calls.map((call) => call.frame.ref)).toEqual([
      'site/home/hero',
      'site/home/about',
      'site/home/hero',
      'site/home/about',
    ])
  })

  it('queues nothing for a batch that names no frame and moves no box', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    const board = boardOf({ hero: BOX })
    rendered.queue(board, [])
    await tick()
    calls[0]?.land([])
    await tick()

    rendered.queue(board, [])
    await tick()

    expect(calls).toHaveLength(1)
  })

  it('settles once the asked frames have landed', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    rendered.queue(boardOf({ hero: BOX, about: BOX }), [])
    let settled = false
    const settling = rendered.settle(['site/home/hero']).then(() => {
      settled = true
    })
    await tick()
    const beforeLanding = settled

    calls[0]?.land([])
    await settling

    expect(beforeLanding).toBe(false)
    expect(settled).toBe(true)
  })

  it('settles at once for frames with nothing queued', async () => {
    const rendered = createRenderedFindings({
      check: async () => [],
      onResult: () => {},
    })

    await expect(rendered.settle(['site/home/none'])).resolves.toBeUndefined()
  })

  it('reports browser-not-found while the browser does not launch', async () => {
    const { calls, check } = heldCheck()
    const rendered = createRenderedFindings({ check, onResult: () => {} })
    rendered.queue(boardOf({ hero: BOX }), [])
    await tick()

    calls[0]?.fail(new FrameboardError('browser-not-found', 'No shell.'))
    await rendered.settle(['site/home/hero'])

    expect(rendered.unavailable()).toBe('browser-not-found')
  })

  it('lands nothing and settles every wait once closed', async () => {
    const { calls, check } = heldCheck()
    const landed: string[] = []
    const rendered = createRenderedFindings({
      check,
      onResult: (ref) => landed.push(ref),
    })
    rendered.queue(boardOf({ hero: BOX, about: BOX }), [])
    const settling = rendered.settle(['site/home/about'])
    await tick()

    rendered.close()
    calls[0]?.land([])
    await settling

    expect(landed).toEqual([])
  })
})
