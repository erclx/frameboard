import '../../../styles.css'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore, receiveClaims } from '@/client/live/store'

import { dropWaiting } from '../../claims/waiting'
import {
  createSelectionStore,
  select,
  selectElement,
  selectElements,
} from '../../selection'
import {
  type ElementChange,
  forgetText,
  type Refusal,
  writeElement,
  writeElements,
} from './write'

describe('writeElements', () => {
  const FIRST = { frame: 'studio/home/hero', index: 5, hash: 'a'.repeat(64) }
  const SECOND = { ...FIRST, index: 7 }
  const THIRD = { ...FIRST, index: 9 }
  const CHANGE: ElementChange = {
    kind: 'style',
    property: 'opacity',
    value: '0.5',
  }

  function answering(status: number, body: unknown, seen?: unknown[]) {
    const send: typeof fetch = async (_url, init) => {
      seen?.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }
    return send
  }

  it('sends every edit in one write and keeps every member selected at the answered hash', async () => {
    const selection = createSelectionStore()
    selectElements(selection, 'studio/home', [FIRST, SECOND, THIRD])
    const seen: unknown[] = []

    const written = await writeElements(
      'studio/home',
      [
        { key: FIRST, change: CHANGE },
        { key: SECOND, change: CHANGE },
      ],
      {
        selection,
        send: answering(
          200,
          {
            ok: true,
            data: {
              ref: FIRST.frame,
              index: 7,
              indexes: [5, 7],
              hash: 'b'.repeat(64),
              from: 'a'.repeat(64),
            },
          },
          seen,
        ),
        notify: () => {},
      },
    )

    expect(written).toBe(true)
    expect(seen).toEqual([
      {
        ref: FIRST.frame,
        hash: 'a'.repeat(64),
        edits: [
          { index: 5, change: CHANGE },
          { index: 7, change: CHANGE },
        ],
      },
    ])
    expect(selection.getState().elements).toEqual([
      { ...FIRST, hash: 'b'.repeat(64) },
      { ...SECOND, hash: 'b'.repeat(64) },
      { ...THIRD, hash: 'b'.repeat(64) },
    ])
    expect(selection.getState().element).toEqual({
      ...THIRD,
      hash: 'b'.repeat(64),
    })
  })

  it('drops a member the batch left alone once the others were found elsewhere', async () => {
    const selection = createSelectionStore()
    selectElements(selection, 'studio/home', [FIRST, SECOND])

    await writeElements('studio/home', [{ key: FIRST, change: CHANGE }], {
      selection,
      send: answering(200, {
        ok: true,
        data: {
          ref: FIRST.frame,
          index: 6,
          indexes: [6],
          hash: 'b'.repeat(64),
          from: 'c'.repeat(64),
        },
      }),
      notify: () => {},
    })

    expect(selection.getState().elements).toEqual([
      { ...FIRST, index: 6, hash: 'b'.repeat(64) },
    ])
  })

  it('answers false and raises the refusal, keeping the members', async () => {
    const selection = createSelectionStore()
    selectElements(selection, 'studio/home', [FIRST, SECOND])
    const refusals: Refusal[] = []

    const written = await writeElements(
      'studio/home',
      [{ key: FIRST, change: CHANGE }],
      {
        selection,
        send: answering(409, {
          ok: false,
          error: { code: 'invalid-address', message: 'no such element' },
        }),
        notify: (refusal) => refusals.push(refusal),
      },
    )

    expect(written).toBe(false)
    expect(refusals[0]?.title).toBe('Edit not saved')
    expect(selection.getState().elements).toHaveLength(2)
  })
})

describe('writeElement', () => {
  const KEY = { frame: 'studio/home/hero', index: 5, hash: 'a'.repeat(64) }

  function answering(status: number, body: unknown): typeof fetch {
    return async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  }

  it('rekeys the selected element to the answered hash', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: { ref: KEY.frame, index: 5, hash: 'b'.repeat(64) },
        }),
        notify: () => {},
      },
    )

    expect(written).toBe(true)
    expect(selection.getState().element?.hash).toBe('b'.repeat(64))
  })

  it('answers a landed edit as written when the tree catch-up after it rejects', async () => {
    const selection = createSelectionStore()
    const told: string[] = []

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'style', property: 'background-color', value: '#e02b2b' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: { ref: KEY.frame, index: 5, hash: 'b'.repeat(64) },
        }),
        notify: ({ title }) => told.push(title),
        catchUp: () => Promise.reject(new Error('the tree read failed')),
      },
    )

    expect(written).toBe(true)
    expect(told).toEqual([])
  })

  it('reselects the element at the index it landed at, once the agent’s reload dropped it', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    select(selection, 'studio/home', [KEY.frame])

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: {
            ref: KEY.frame,
            index: 6,
            hash: 'b'.repeat(64),
            from: 'c'.repeat(64),
          },
        }),
        notify: () => {},
      },
    )

    expect(selection.getState().element).toEqual({
      frame: KEY.frame,
      index: 6,
      hash: 'b'.repeat(64),
    })
  })

  it('leaves another element the person selected meanwhile alone', async () => {
    const selection = createSelectionStore()
    const other = { ...KEY, index: 3 }
    selectElement(selection, 'studio/home', other)

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: { ref: KEY.frame, index: 6, hash: 'b'.repeat(64) },
        }),
        notify: () => {},
      },
    )

    expect(selection.getState().element).toEqual(other)
  })

  it('keeps a leading file name’s case in the toast', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'style', property: 'opacity', value: '0.5' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'stats.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(told[0]?.description).toBe(
      'stats.html changed after this edit was made, so nothing was written.',
    )
  })

  it('tells a text edit the agent collided with that Enter applies it anyway, with a copy of the text', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'the agent changed this <h1> in stats.html while your edit waited, so nothing was written',
            details: { ref: KEY.frame, index: KEY.index, moved: false },
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )
    forgetText(KEY)

    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'The agent changed this <h1> in stats.html while your edit waited, so nothing was written. Press Enter to apply your text anyway.',
        copy: 'Welcome',
      },
    ])
  })

  it('offers only the copy once the element’s index moved, since Enter would write elsewhere', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'the agent changed this <h1> in stats.html while your edit waited, so nothing was written',
            details: { ref: KEY.frame, index: KEY.index, moved: true },
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'The agent changed this <h1> in stats.html while your edit waited, so nothing was written.',
        copy: 'Welcome',
      },
    ])
  })

  it('raises the refusal and keeps the selection on a stale edit', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    const told: Refusal[] = []

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'style', property: 'opacity', value: '0.5' },
      {
        selection,
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'hero.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(written).toBe(false)
    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'hero.html changed after this edit was made, so nothing was written.',
      },
    ])
    expect(selection.getState().element).toEqual(KEY)
  })

  describe('on a frame another session holds', () => {
    const OPACITY: ElementChange = {
      kind: 'style',
      property: 'opacity',
      value: '0.5',
    }
    const RADIUS: ElementChange = {
      kind: 'style',
      property: 'border-radius',
      value: '8px',
    }
    let sent: { hash: string; change: ElementChange }[]
    /** Answers each edit with the next hash, as the frame's bytes change. */
    const server: typeof fetch = async (_path, init) => {
      const body = JSON.parse(String(init?.body))
      sent.push({ hash: body.hash, change: body.change })
      return Response.json({
        ok: true,
        data: {
          ref: KEY.frame,
          index: 5,
          hash: String(sent.length).repeat(64),
        },
      })
    }

    beforeEach(() => {
      sent = []
      liveStore.setState({ connected: true })
      receiveClaims(liveStore, [
        {
          frame: KEY.frame,
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

    it('waits, then sends once the claim is released', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection,
        send: server,
        notify: () => {},
      })
      await Promise.resolve()
      expect(sent).toEqual([])

      receiveClaims(liveStore, [])

      expect(await written).toBe(true)
      expect(sent).toEqual([{ hash: KEY.hash, change: OPACITY }])
    })

    it('sends two waiting edits in order, the second from the hash the first left', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      const deps = { selection, send: server, notify: () => {} }

      const first = writeElement('studio/home', KEY, OPACITY, deps)
      const second = writeElement('studio/home', KEY, RADIUS, deps)
      receiveClaims(liveStore, [])

      expect(await Promise.all([first, second])).toEqual([true, true])
      expect(sent).toEqual([
        { hash: KEY.hash, change: OPACITY },
        { hash: '1'.repeat(64), change: RADIUS },
      ])
    })

    describe('behind an edit the server found again elsewhere', () => {
      let sentAt: { index: number; hash: string }[]
      /** Lands the first edit at index 6 over the agent's bytes, and each later one where it was sent. */
      const relocating: typeof fetch = async (_path, init) => {
        const body = JSON.parse(String(init?.body))
        sentAt.push({ index: body.index, hash: body.hash })
        const first = sentAt.length === 1
        return Response.json({
          ok: true,
          data: {
            ref: KEY.frame,
            index: first ? 6 : body.index,
            hash: String(sentAt.length).repeat(64),
            from: first ? 'c'.repeat(64) : body.hash,
          },
        })
      }

      beforeEach(() => {
        sentAt = []
      })

      it('sends a follower on the same element at the index the first landed at, from its hash', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement('studio/home', KEY, RADIUS, deps)
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second])).toEqual([true, true])
        expect(sentAt).toEqual([
          { index: 5, hash: KEY.hash },
          { index: 6, hash: '1'.repeat(64) },
        ])
      })

      it('sends a follower on another element from its own hash, for the server to find again', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement(
          'studio/home',
          { ...KEY, index: 3 },
          RADIUS,
          deps,
        )
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second])).toEqual([true, true])
        expect(sentAt).toEqual([
          { index: 5, hash: KEY.hash },
          { index: 3, hash: KEY.hash },
        ])
      })

      it('keeps a third edit on the first element at its new index past one on another', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement(
          'studio/home',
          { ...KEY, index: 3 },
          RADIUS,
          deps,
        )
        const third = writeElement(
          'studio/home',
          KEY,
          { kind: 'text', value: 'Welcome' },
          deps,
        )
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second, third])).toEqual([
          true,
          true,
          true,
        ])
        expect(sentAt[2]).toEqual({ index: 6, hash: '2'.repeat(64) })
      })
    })

    it('answers false with the stale toast when the agent wrote the frame meanwhile', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      const told: Refusal[] = []

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection,
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'hero.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      })
      receiveClaims(liveStore, [])

      expect(await written).toBe(false)
      expect(told).toEqual([
        {
          title: 'Edit not saved',
          description:
            'hero.html changed after this edit was made, so nothing was written.',
        },
      ])
    })

    it('drops the edits queued behind a refused one without sending them', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      let calls = 0
      const refusing: typeof fetch = async () => {
        calls += 1
        return Response.json(
          {
            ok: false,
            error: { code: 'stale-address', message: 'hero.html changed' },
          },
          { status: 409 },
        )
      }
      const deps = { selection, send: refusing, notify: () => {} }

      const first = writeElement('studio/home', KEY, OPACITY, deps)
      const second = writeElement('studio/home', KEY, RADIUS, deps)
      receiveClaims(liveStore, [])

      expect(await Promise.all([first, second])).toEqual([false, false])
      expect(calls).toBe(1)
    })

    it('answers false and raises nothing when the wait is cancelled', async () => {
      const told: unknown[] = []

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection: createSelectionStore(),
        send: server,
        notify: (refusal) => told.push(refusal),
      })
      dropWaiting()

      expect(await written).toBe(false)
      expect(told).toEqual([])
      expect(sent).toEqual([])
    })
  })
})
