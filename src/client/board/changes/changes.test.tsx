import '../../styles.css'

import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { bindKeys } from '@/client/actions/registry'
import { toast, Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import {
  createUnseenStore,
  markSeen,
  receiveChanges,
  type UnseenStore,
  unseenStore,
} from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'
import { frameOf } from '@/test/board'

import { modeStore } from '../mode'
import { endPreview, setPreview } from '../preview/store'
import { clear, select, selectionStore } from '../selection'
import { useChangeActions } from './actions'
import { toastCopy } from './copy'
import { DWELL_MS, useDwell } from './dwell'
import { ChangeGlow } from './glow'
import { glowStore } from './glow-store'
import { CHANGE_TOAST, ChangesToast, ChangeToastBody } from './toast'

const HASH = 'c'.repeat(64)

function change(
  frame: string,
  overrides: Partial<FrameChange> = {},
): FrameChange {
  return {
    id: `c-${frame}`,
    frame,
    at: '2026-10-19T12:00:00.000Z',
    hash: HASH,
    author: { session: 's-1', agent: 'claude', tag: 'claude · studio' },
    elements: [4, 6],
    removed: 0,
    whole: false,
    created: false,
    ...overrides,
  }
}

const byFrame = (...changes: FrameChange[]) =>
  Object.fromEntries(changes.map((entry) => [entry.frame, entry]))

afterEach(() => {
  act(() => {
    clear(selectionStore)
    modeStore.setState({ mode: 'edit' })
    liveStore.setState({ focus: null })
    unseenStore.setState({ unseen: {}, cursor: null })
    glowStore.setState({ glowing: {}, replays: {} })
  })
})

describe('toastCopy', () => {
  it('names the agent, the frame, and its changed elements for one frame', () => {
    const pricing = change('studio/home/pricing')

    const copy = toastCopy(byFrame(pricing), pricing, false)

    expect(copy).toMatchObject({
      initial: 'C',
      title: 'Claude updated pricing',
      detail: '2 changes',
      show: true,
      next: false,
    })
  })

  it('names no agent for a frame nobody claimed', () => {
    const pricing = change('studio/home/pricing', { author: null })

    const copy = toastCopy(byFrame(pricing), pricing, false)

    expect(copy).toMatchObject({ initial: null, title: 'pricing changed' })
  })

  it('counts a change to the whole frame once', () => {
    const pricing = change('studio/home/pricing', { whole: true })

    expect(toastCopy(byFrame(pricing), pricing, false).detail).toBe('1 change')
  })

  it('says the change glows on the frame and offers no Show', () => {
    const pricing = change('studio/home/pricing')

    const copy = toastCopy(byFrame(pricing), pricing, true)

    expect(copy).toMatchObject({
      detail: '2 changes, glowing on the frame',
      show: false,
    })
  })

  it('counts several frames over their pages with the one it is on', () => {
    const first = change('studio/home/hero', { at: '2026-10-19T12:00:01Z' })
    const second = change('studio/pricing/plans', {
      at: '2026-10-19T12:00:02Z',
    })
    const third = change('studio/pricing/faq', { at: '2026-10-19T12:00:03Z' })

    const copy = toastCopy(byFrame(first, second, third), second, false)

    expect(copy).toMatchObject({
      title: 'Claude changed 3 frames',
      detail: 'on 2 pages · 2 of 3',
      show: true,
      next: true,
    })
  })

  it('names no agent when several wrote', () => {
    const one = change('studio/home/hero')
    const other = change('studio/home/about', {
      author: { session: 's-2', agent: 'codex', tag: 'codex · studio' },
    })

    expect(toastCopy(byFrame(one, other), one, false).title).toBe(
      '2 frames changed',
    )
  })
})

describe('ChangesToast', () => {
  let store: UnseenStore
  let went: string[]

  function Harness() {
    useChangeActions(store, (url) => went.push(url))
    return (
      <Toaster bodies={{ [CHANGE_TOAST]: ChangeToastBody }}>
        <ChangesToast store={store} />
      </Toaster>
    )
  }

  let unbind = () => {}

  beforeEach(() => {
    store = createUnseenStore(null)
    went = []
  })

  afterEach(() => {
    unbind()
    unbind = () => {}
    setCharacterKeys(true)
  })

  it('opens on a change and offers Show', async () => {
    render(<Harness />)

    act(() => receiveChanges(store, [change('studio/home/pricing')]))

    expect(await screen.findByText('Claude updated pricing')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Show' })).toBeVisible()
  })

  it('shows the change from Show, moving to its page first', async () => {
    render(<Harness />)
    act(() => receiveChanges(store, [change('studio/pricing/plans')]))

    await userEvent.click(await screen.findByRole('button', { name: 'Show' }))

    expect(went).toEqual(['/p/studio/pricing'])
    expect(liveStore.getState().focus).toBe('studio/pricing/plans')
    expect(store.getState().cursor).toBe('studio/pricing/plans')
  })

  it('steps to the next change from Next, wrapping', async () => {
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
      ]),
    )
    const next = await screen.findByRole('button', { name: 'Next ]' })

    await userEvent.click(next)
    expect(store.getState().cursor).toBe('studio/home/about')
    expect(screen.getByText('on 1 page · 2 of 2')).toBeVisible()

    await userEvent.click(next)
    expect(store.getState().cursor).toBe('studio/home/hero')
  })

  it('steps to the next change on ]', async () => {
    unbind = bindKeys(window)
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
      ]),
    )
    await screen.findByRole('button', { name: 'Next ]' })

    await userEvent.keyboard(']')

    expect(store.getState().cursor).toBe('studio/home/about')
  })

  it('steps back to the previous change on [, wrapping', async () => {
    unbind = bindKeys(window)
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
        change('studio/home/faq', { at: '2026-10-19T12:00:03Z' }),
      ]),
    )
    await screen.findByRole('button', { name: 'Previous [' })

    await userEvent.keyboard('[[')
    expect(store.getState().cursor).toBe('studio/home/faq')

    await userEvent.keyboard('[[')
    expect(store.getState().cursor).toBe('studio/home/about')
  })

  it('steps neither way on [ or ] while single-key shortcuts are off', async () => {
    unbind = bindKeys(window)
    setCharacterKeys(false)
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
      ]),
    )
    await screen.findByRole('button', { name: 'Previous' })

    await userEvent.keyboard('[[]')

    expect(store.getState().cursor).toBeNull()
  })

  it('names no key on Next while single-key shortcuts are off', async () => {
    setCharacterKeys(false)
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
      ]),
    )

    const next = await screen.findByRole('button', { name: 'Next' })

    expect(next).not.toHaveAttribute('aria-keyshortcuts')
  })

  it('shows the change on Enter with the toast focused', async () => {
    render(<Harness />)
    act(() => receiveChanges(store, [change('studio/pricing/plans')]))
    await screen.findByText('Claude updated plans')
    const toast = document.querySelector<HTMLElement>('[data-change-toast]')
    if (!toast) throw new Error('The toast did not open')

    act(() => toast.focus())
    await userEvent.keyboard('{Enter}')

    expect(liveStore.getState().focus).toBe('studio/pricing/plans')
  })

  it('leaves Enter on Next to Next', async () => {
    render(<Harness />)
    act(() =>
      receiveChanges(store, [
        change('studio/home/hero', { at: '2026-10-19T12:00:01Z' }),
        change('studio/home/about', { at: '2026-10-19T12:00:02Z' }),
      ]),
    )
    const next = await screen.findByRole('button', { name: 'Next ]' })

    act(() => next.focus())
    await userEvent.keyboard('{Enter}')

    expect(store.getState().cursor).toBe('studio/home/about')
  })

  it('joins the one stack below a toast raised before it, both open with a gap', async () => {
    render(<Harness />)
    act(() => {
      toast.add({ title: 'Copied hero', timeout: 0 })
    })
    const copied = await screen.findByText('Copied hero')

    act(() => receiveChanges(store, [change('studio/home/pricing')]))
    const changed = await screen.findByText('Claude updated pricing')

    await vi.waitFor(() => {
      const above = copied
        .closest('[data-slot="toast"]')
        ?.getBoundingClientRect()
      const below = changed
        .closest('[data-slot="toast"]')
        ?.getBoundingClientRect()
      expect(above && below && below.top - above.bottom).toBeGreaterThan(0)
    })
    act(() => toast.close())
  })

  describe('closing', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('stays past 5 seconds while its change is unseen', async () => {
      render(<Harness />)
      act(() => receiveChanges(store, [change('studio/home/pricing')]))
      await screen.findByText('Claude updated pricing')

      act(() => vi.advanceTimersByTime(6000))

      expect(screen.getByText('Claude updated pricing')).toBeVisible()
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    it('closes 5 seconds after the last change is seen', async () => {
      render(<Harness />)
      act(() => receiveChanges(store, [change('studio/home/pricing')]))
      await screen.findByText('Claude updated pricing')

      act(() => markSeen(store, 'studio/home/pricing'))
      act(() => vi.advanceTimersByTime(4900))
      expect(screen.getByText('Claude updated pricing')).toBeVisible()

      act(() => vi.advanceTimersByTime(200))
      await vi.waitFor(() =>
        expect(screen.queryByText('Claude updated pricing')).toBeNull(),
      )
    })
  })
})

// Indices past the skipped injected style: html 0, head 1, body 2, h1 3, p 4.
const SOURCE = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1{margin:20px 0 0 30px;height:30px}p{margin:10px 0 0 30px;width:200px;height:20px}</style></head><body><h1>Plans</h1><p>Pick one</p></body></html>`
const PRICING = frameOf('pricing', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

describe('ChangeGlow', () => {
  let layer: HTMLDivElement | undefined

  afterEach(() => {
    layer?.remove()
    layer = undefined
  })

  async function mountFrame(): Promise<HTMLDivElement> {
    layer = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = PRICING.ref
    frame.style.cssText = `position:absolute;width:${PRICING.box.width}px;height:${PRICING.box.height}px`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = SOURCE
    frame.append(iframe)
    layer.append(frame)
    document.body.append(layer)
    await loaded
    return layer
  }

  it('glows over each changed element the frame shows', async () => {
    const container = await mountFrame()
    act(() =>
      receiveChanges(unseenStore, [
        change(PRICING.ref, { id: 'c-glow-1', elements: [4] }),
      ]),
    )

    const { container: drawn } = render(
      <ChangeGlow frames={[PRICING]} container={container} />,
    )

    const glows = drawn.querySelectorAll<HTMLElement>('[data-change-glow]')
    expect(glows).toHaveLength(1)
    // The p sits 30px in and 60px down, and the glow 4px outside it.
    expect(glows[0]?.style.left).toContain('130px')
    expect(glows[0]?.style.top).toContain('110px')
  })

  it('glows over the whole frame for a change too wide to name', async () => {
    const container = await mountFrame()
    act(() =>
      receiveChanges(unseenStore, [
        change(PRICING.ref, { id: 'c-glow-2', whole: true }),
      ]),
    )

    const { container: drawn } = render(
      <ChangeGlow frames={[PRICING]} container={container} />,
    )

    expect(
      drawn.querySelector<HTMLElement>('[data-change-glow]')?.style.width,
    ).toContain('400px')
  })

  it('glows over the whole frame at the width it is previewed at', async () => {
    const container = await mountFrame()
    act(() => setPreview([PRICING.ref], 1440))
    act(() =>
      receiveChanges(unseenStore, [
        change(PRICING.ref, { id: 'c-glow-5', whole: true }),
      ]),
    )

    const { container: drawn } = render(
      <ChangeGlow frames={[PRICING]} container={container} />,
    )

    act(() => endPreview([PRICING.ref]))
    expect(
      drawn.querySelector<HTMLElement>('[data-change-glow]')?.style.width,
    ).toContain('1440px')
  })

  it('waits for the frame to show the bytes the change left', async () => {
    const container = await mountFrame()
    act(() =>
      receiveChanges(unseenStore, [
        change(PRICING.ref, { id: 'c-glow-3', hash: 'd'.repeat(64) }),
      ]),
    )

    const { container: drawn } = render(
      <ChangeGlow frames={[PRICING]} container={container} />,
    )

    expect(drawn.querySelector('[data-change-glow]')).toBeNull()
  })

  it('draws no glow in Play', async () => {
    const container = await mountFrame()
    act(() => modeStore.setState({ mode: 'play' }))
    act(() =>
      receiveChanges(unseenStore, [
        change(PRICING.ref, { id: 'c-glow-4', elements: [4] }),
      ]),
    )

    const { container: drawn } = render(
      <ChangeGlow frames={[PRICING]} container={container} />,
    )

    expect(drawn.querySelector('[data-change-glow]')).toBeNull()
  })
})

describe('useDwell', () => {
  const VIEW = { x: 0, y: 0, k: 1 }
  const SIZE = { width: 1000, height: 800 }
  let store: UnseenStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = createUnseenStore(null)
    receiveChanges(store, [change(PRICING.ref)])
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('marks a frame seen once it has been on screen a moment', () => {
    renderHook(() =>
      useDwell({ frames: [PRICING], view: VIEW, size: SIZE }, { store }),
    )

    act(() => vi.advanceTimersByTime(DWELL_MS - 1))
    expect(store.getState().unseen).toHaveProperty([PRICING.ref])

    act(() => vi.advanceTimersByTime(1))
    expect(store.getState().unseen).toEqual({})
  })

  it('keeps the mark on a frame more than half off screen', () => {
    // 150 of the frame's 400px width shows.
    const view = { x: -350, y: 0, k: 1 }

    renderHook(() =>
      useDwell({ frames: [PRICING], view, size: SIZE }, { store }),
    )
    act(() => vi.advanceTimersByTime(DWELL_MS * 2))

    expect(store.getState().unseen).toHaveProperty([PRICING.ref])
  })

  it('keeps the mark while the tab is hidden', () => {
    const hidden = Object.assign(new EventTarget(), {
      visibilityState: 'hidden',
    }) as unknown as Document

    renderHook(() =>
      useDwell(
        { frames: [PRICING], view: VIEW, size: SIZE },
        { store, doc: hidden },
      ),
    )
    act(() => vi.advanceTimersByTime(DWELL_MS * 2))

    expect(store.getState().unseen).toHaveProperty([PRICING.ref])
  })

  it('marks a frame seen once it is selected', () => {
    renderHook(() => useDwell(null, { store }))

    act(() => select(selectionStore, 'studio/home', [PRICING.ref]))

    expect(store.getState().unseen).toEqual({})
  })
})
