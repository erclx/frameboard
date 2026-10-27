import { afterEach, describe, expect, it } from 'vitest'

import { createLiveStore } from '@/client/live/store'
import type { ElementTree, TreeElement } from '@/shared/records/elements'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import { createSelectionStore, selectElement } from '../selection'
import {
  deleteElement,
  moveElement,
  moveElementTo,
  placeElement,
} from './write'

const HASH = 'c'.repeat(64)
const ANSWERED = 'd'.repeat(64)
const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

// Indices: html 0, head 1, the injected style is skipped, body 2, main 3, then its divs 4 and 5.
const COLUMN =
  '<main><div style="height:40px"></div><div style="height:40px"></div></main>'
const ROW =
  '<main style="display:flex"><div style="width:100px;height:40px"></div><div style="width:100px;height:40px"></div></main>'

let layer: HTMLDivElement | undefined

afterEach(() => {
  layer?.remove()
  layer = undefined
})

/** A canvas layer holding one live frame showing `body`, resolved once it has loaded. */
async function mount(body: string): Promise<HTMLDivElement> {
  layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;left:0;top:0'
  const frame = document.createElement('div')
  frame.dataset.frame = HERO.ref
  frame.style.cssText = `position:absolute;left:${HERO.box.x}px;top:${HERO.box.y}px;width:${HERO.box.width}px;height:${HERO.box.height}px`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}</style></head><body>${body}</body></html>`
  frame.append(iframe)
  layer.append(frame)
  document.body.append(layer)
  await loaded
  iframe.dataset.renderedAt = HERO.modifiedAt
  return layer
}

/** A server answering every request with `status` and `body`, keeping each request's body. */
function server(status: number, body: unknown) {
  const sent: unknown[] = []
  const send: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { sent, send }
}

describe('placeElement', () => {
  it('sends the gap under the point from the rendered hash, then selects the new element and returns to Move', async () => {
    const container = await mount(COLUMN)
    const selection = createSelectionStore()
    const mode = createModeStore(1280)
    mode.setState({ tool: 'shape' })
    const { sent, send } = server(200, {
      ok: true,
      data: { ref: HERO.ref, index: 5, hash: ANSWERED },
    })

    // Past the first div's middle, so the gap is ahead of the second.
    const placed = await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 30 },
      'rectangle',
      { selection, mode, live: createLiveStore(), send },
    )

    expect(sent).toEqual([
      {
        ref: HERO.ref,
        hash: HASH,
        parent: 3,
        before: 5,
        element: { kind: 'rectangle' },
      },
    ])
    expect(placed).toEqual({ frame: HERO.ref, index: 5, hash: ANSWERED })
    expect(selection.getState().element).toEqual(placed)
    expect(mode.getState().tool).toBe('move')
  })

  it('draws a divider in a row down its side', async () => {
    const container = await mount(ROW)
    const { sent, send } = server(200, {
      ok: true,
      data: { ref: HERO.ref, index: 5, hash: ANSWERED },
    })

    await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 120, y: HERO.box.y + 20 },
      'divider',
      {
        selection: createSelectionStore(),
        mode: createModeStore(1280),
        live: createLiveStore(),
        send,
      },
    )

    expect(sent).toMatchObject([
      { element: { kind: 'divider', vertical: true } },
    ])
  })

  it('refuses a frame another session holds and sends nothing', async () => {
    const container = await mount(COLUMN)
    const live = createLiveStore()
    live.setState({
      claims: {
        [HERO.ref]: {
          frame: HERO.ref,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: '2026-10-15T00:00:00.000Z',
          expiresAt: '2026-10-15T01:00:00.000Z',
        },
      },
    })
    const { sent, send } = server(200, {})
    const told: string[] = []

    const placed = await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 30 },
      'text',
      {
        selection: createSelectionStore(),
        mode: createModeStore(1280),
        live,
        send,
        notify: ({ description }) => told.push(description),
      },
    )

    expect(placed).toBeNull()
    expect(sent).toEqual([])
    expect(told).toEqual([
      'claude · studio is editing hero, so nothing was written.',
    ])
  })

  it('shows a refusal, selects nothing, and keeps the tool on', async () => {
    const container = await mount(COLUMN)
    const selection = createSelectionStore()
    const mode = createModeStore(1280)
    mode.setState({ tool: 'text' })
    const { send } = server(409, {
      ok: false,
      error: {
        code: 'stale-address',
        message:
          'hero.html changed after this edit was made, so nothing was written',
      },
    })
    const told: string[] = []

    const placed = await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 30 },
      'text',
      {
        selection,
        mode,
        live: createLiveStore(),
        send,
        notify: ({ description }) => told.push(description),
      },
    )

    expect(placed).toBeNull()
    expect(told).toEqual([
      'hero.html changed after this edit was made, so nothing was written.',
    ])
    expect(selection.getState().element).toBeUndefined()
    expect(mode.getState().tool).toBe('text')
  })

  it('places nothing over bare canvas', async () => {
    const container = await mount(COLUMN)
    const { sent, send } = server(200, {})

    const placed = await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: 10, y: 10 },
      'text',
      {
        selection: createSelectionStore(),
        mode: createModeStore(1280),
        live: createLiveStore(),
        send,
      },
    )

    expect(placed).toBeNull()
    expect(sent).toEqual([])
  })

  it('sends the size a drag gave a shape', async () => {
    const container = await mount(COLUMN)
    const { sent, send } = server(200, {
      ok: true,
      data: { ref: HERO.ref, index: 5, hash: ANSWERED },
    })

    await placeElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 30 },
      'ellipse',
      {
        selection: createSelectionStore(),
        mode: createModeStore(1280),
        live: createLiveStore(),
        send,
        size: { width: 240, height: 48 },
      },
    )

    expect(sent).toMatchObject([
      { element: { kind: 'ellipse', width: 240, height: 48 } },
    ])
  })
})

describe('moveElement', () => {
  /** The first of the column's two divs, as the selection holds it. */
  const FIRST_DIV = { frame: HERO.ref, index: 4, hash: HASH }

  it('sends the element and the gap under the point, then selects it where it landed', async () => {
    const container = await mount(COLUMN)
    const selection = createSelectionStore()
    const { sent, send } = server(200, {
      ok: true,
      data: { ref: HERO.ref, index: 5, hash: ANSWERED },
    })

    // Past the second div's middle, so the gap is the column's end.
    const moved = await moveElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 70 },
      FIRST_DIV,
      { selection, live: createLiveStore(), send },
    )

    expect(sent).toEqual([
      { ref: HERO.ref, hash: HASH, index: 4, parent: 3, before: null },
    ])
    expect(moved).toEqual({ frame: HERO.ref, index: 5, hash: ANSWERED })
    expect(selection.getState().element).toEqual(moved)
  })

  it('sends nothing for the gap the element already sits in', async () => {
    const container = await mount(COLUMN)
    const { sent, send } = server(200, {})

    // Past the first div's middle, ahead of the second: the gap it closes.
    const moved = await moveElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 30 },
      FIRST_DIV,
      { selection: createSelectionStore(), live: createLiveStore(), send },
    )

    expect(moved).toBeNull()
    expect(sent).toEqual([])
  })

  it('sends nothing released over bare canvas', async () => {
    const container = await mount(COLUMN)
    const { sent, send } = server(200, {})

    const moved = await moveElement(
      container,
      'studio/home',
      [HERO],
      { x: 10, y: 10 },
      FIRST_DIV,
      { selection: createSelectionStore(), live: createLiveStore(), send },
    )

    expect(moved).toBeNull()
    expect(sent).toEqual([])
  })

  it('refuses a frame another session holds and sends nothing', async () => {
    const container = await mount(COLUMN)
    const live = createLiveStore()
    live.setState({
      claims: {
        [HERO.ref]: {
          frame: HERO.ref,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: '2026-10-15T00:00:00.000Z',
          expiresAt: '2026-10-15T01:00:00.000Z',
        },
      },
    })
    const { sent, send } = server(200, {})
    const told: string[] = []

    const moved = await moveElement(
      container,
      'studio/home',
      [HERO],
      { x: HERO.box.x + 50, y: HERO.box.y + 70 },
      FIRST_DIV,
      {
        selection: createSelectionStore(),
        live,
        send,
        notify: ({ description }) => told.push(description),
      },
    )

    expect(moved).toBeNull()
    expect(sent).toEqual([])
    expect(told).toEqual([
      'claude · studio is editing hero, so nothing was written.',
    ])
  })
})

describe('moveElementTo', () => {
  const FIRST_DIV = { frame: HERO.ref, index: 4, hash: HASH }
  const SECOND_HASH = 'e'.repeat(64)

  function element(index: number, parent: number | null): TreeElement {
    return {
      index,
      parent,
      tag: 'div',
      name: 'div',
      textOnly: false,
      layout: 'block',
      round: false,
    }
  }

  /** A main at 3 holding divs 4, 5, and 6 under body at 2, at whichever bytes are asked for, since a move keeps that shape. */
  const tree = async (ref: string, hash: string): Promise<ElementTree> => ({
    ref,
    hash,
    elements: [element(3, null), element(4, 3), element(5, 3), element(6, 3)],
  })

  /** A server answering each request in turn with the next of `data`, keeping each request's body. */
  function answers(...data: unknown[]) {
    const sent: unknown[] = []
    const send: typeof fetch = async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)))
      return new Response(
        JSON.stringify({ ok: true, data: data[sent.length - 1] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return { sent, send }
  }

  it('sends the gap one place down among its siblings, then selects it where it landed', async () => {
    const selection = createSelectionStore()
    const { sent, send } = answers({ ref: HERO.ref, index: 5, hash: ANSWERED })

    const moved = await moveElementTo(
      'studio/home',
      FIRST_DIV,
      (place) => place + 1,
      { selection, live: createLiveStore(), send, tree },
    )

    expect(sent).toEqual([
      { ref: HERO.ref, hash: HASH, index: 4, parent: 3, before: 6 },
    ])
    expect(moved).toEqual({ frame: HERO.ref, index: 5, hash: ANSWERED })
    expect(selection.getState().element).toEqual(moved)
  })

  it('sends nothing and tells nothing for the first child moved up', async () => {
    const { sent, send } = answers()
    const told: string[] = []

    const moved = await moveElementTo(
      'studio/home',
      FIRST_DIV,
      (place) => place - 1,
      {
        selection: createSelectionStore(),
        live: createLiveStore(),
        send,
        tree,
        notify: ({ description }) => told.push(description),
      },
    )

    expect(moved).toBeNull()
    expect(sent).toEqual([])
    expect(told).toEqual([])
  })

  it('sends a second move queued behind the first from the hash and index the first answered', async () => {
    const { sent, send } = answers(
      { ref: HERO.ref, index: 5, hash: ANSWERED },
      { ref: HERO.ref, index: 6, hash: SECOND_HASH },
    )
    const deps = {
      selection: createSelectionStore(),
      live: createLiveStore(),
      send,
      tree,
    }

    // Both go before the first answers, as two quick presses do.
    const [first, second] = await Promise.all([
      moveElementTo('studio/home', FIRST_DIV, (place) => place + 1, deps),
      moveElementTo('studio/home', FIRST_DIV, (place) => place + 1, deps),
    ])

    expect(sent).toEqual([
      { ref: HERO.ref, hash: HASH, index: 4, parent: 3, before: 6 },
      { ref: HERO.ref, hash: ANSWERED, index: 5, parent: 3, before: null },
    ])
    expect(first).toEqual({ frame: HERO.ref, index: 5, hash: ANSWERED })
    expect(second).toEqual({ frame: HERO.ref, index: 6, hash: SECOND_HASH })
  })

  it('refuses a frame another session holds and sends nothing', async () => {
    const live = createLiveStore()
    live.setState({
      claims: {
        [HERO.ref]: {
          frame: HERO.ref,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: '2026-10-15T00:00:00.000Z',
          expiresAt: '2026-10-15T01:00:00.000Z',
        },
      },
    })
    const { sent, send } = answers()
    const told: string[] = []

    const moved = await moveElementTo(
      'studio/home',
      FIRST_DIV,
      (place) => place + 1,
      {
        selection: createSelectionStore(),
        live,
        send,
        tree,
        notify: ({ description }) => told.push(description),
      },
    )

    expect(moved).toBeNull()
    expect(sent).toEqual([])
    expect(told).toEqual([
      'claude · studio is editing hero, so nothing was written.',
    ])
  })

  it("shows the server's refusal and keeps the element selected", async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', FIRST_DIV)
    const { send } = server(409, {
      ok: false,
      error: { code: 'invalid-placement', message: 'the parser would move it' },
    })
    const told: string[] = []

    const moved = await moveElementTo(
      'studio/home',
      FIRST_DIV,
      (place) => place + 1,
      {
        selection,
        live: createLiveStore(),
        send,
        tree,
        notify: ({ title }) => told.push(title),
      },
    )

    expect(moved).toBeNull()
    expect(told).toEqual(['Nothing moved'])
    expect(selection.getState().element).toEqual(FIRST_DIV)
  })
})

describe('deleteElement', () => {
  const KEY = { frame: HERO.ref, index: 4, hash: HASH }

  it('sends the element and the hash it was selected at, then selects its frame', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    const { sent, send } = server(200, {
      ok: true,
      data: { ref: HERO.ref, hash: ANSWERED },
    })

    const deleted = await deleteElement('studio/home', KEY, {
      selection,
      live: createLiveStore(),
      send,
    })

    expect(deleted).toBe(true)
    expect(sent).toEqual([{ ref: HERO.ref, index: 4, hash: HASH }])
    expect(selection.getState()).toMatchObject({
      frames: [HERO.ref],
      element: null,
    })
  })

  it('shows a refusal and keeps the element selected', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    const notes: string[] = []
    const { send } = server(409, {
      ok: false,
      error: { code: 'stale-address', message: 'the file moved' },
    })

    const deleted = await deleteElement('studio/home', KEY, {
      selection,
      live: createLiveStore(),
      send,
      notify: (refusal) => void notes.push(refusal.title),
    })

    expect(deleted).toBe(false)
    expect(notes).toEqual(['Nothing deleted'])
    expect(selection.getState().element).toEqual(KEY)
  })
})
