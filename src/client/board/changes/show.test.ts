import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLiveStore, type LiveStore } from '@/client/live/store'

import { attachCanvas, type CanvasControls } from '../view'
import type { Busy } from './busy'
import { followStore } from './follow'
import {
  acceptOffer,
  cancelPendingShow,
  offerCopy,
  receiveShow,
  SHOW_OFFER,
  type ShowDeps,
} from './show'

const PRICING = 'studio/pricing/plans'
const OTHER_PROJECT = 'shop/home/hero'

/** A busy read the test flips by hand, running the callbacks it holds on `clear`. */
function fakeBusy() {
  let busy = false
  const waiting = new Set<() => void>()
  const read: Busy = {
    busy: () => busy,
    whenIdle: (run) => {
      waiting.add(run)
      return () => waiting.delete(run)
    },
    dispose: () => {},
  }
  return {
    read,
    waiting: () => waiting.size,
    set: (next: boolean) => {
      busy = next
    },
    clear: () => {
      busy = false
      for (const run of [...waiting]) {
        waiting.delete(run)
        run()
      }
    },
  }
}

interface Rig {
  deps: ShowDeps
  live: LiveStore
  go: ReturnType<typeof vi.fn<(url: string) => void>>
  busy: ReturnType<typeof fakeBusy>
  offers: { id: string; data: unknown }[]
  closed: string[]
  closeFromUser: (id: string) => void
}

/** A board whose open project is `studio`, with every collaborator a fake. */
function rig(project: string | null = 'studio'): Rig {
  const live = createLiveStore()
  const go = vi.fn<(url: string) => void>()
  const busy = fakeBusy()
  const offers: Rig['offers'] = []
  const closed: string[] = []
  const handlers = new Map<string, () => void>()
  const deps: ShowDeps = {
    live,
    go,
    busy: () => busy.read,
    following: () => followStore.getState().session !== null,
    project: () => project,
    toasts: {
      add: (options) => {
        const id = `toast-${offers.length}`
        offers.push({ id, data: options.data })
        handlers.set(id, () => options.onClose?.())
        return id
      },
      close: (id) => {
        if (id === undefined || closed.includes(id)) return
        closed.push(id)
        handlers.get(id)?.()
      },
    },
  }
  return {
    deps,
    live,
    go,
    busy,
    offers,
    closed,
    closeFromUser: (id) => deps.toasts.close(id),
  }
}

function follow(on: boolean): void {
  followStore.setState({ session: on ? 'abc' : null })
}

const controls: CanvasControls = {
  zoomBy: () => {},
  zoomTo: () => {},
  fit: () => {},
  fitTo: () => {},
  panBy: () => {},
  centerOn: () => {},
}

const cleanups: (() => void)[] = []

beforeEach(() => follow(false))

afterEach(() => {
  follow(false)
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('an idle board', () => {
  it('jumps to a frame of the open project and sets the focus', () => {
    const { deps, go, live, offers } = rig()

    receiveShow(PRICING, deps)

    expect(go).toHaveBeenCalledExactlyOnceWith('/p/studio/pricing')
    expect(live.getState().focus).toBe(PRICING)
    expect(offers).toEqual([])
  })

  it('offers a frame of another project and moves nothing', () => {
    const { deps, go, live, offers } = rig()

    receiveShow(OTHER_PROJECT, deps)

    expect(go).not.toHaveBeenCalled()
    expect(live.getState().focus).toBeNull()
    expect(offers).toEqual([{ id: 'toast-0', data: offerCopy(OTHER_PROJECT) }])
  })

  it('offers from the home view, where no project is open', () => {
    const { deps, go, offers } = rig(null)

    receiveShow(PRICING, deps)

    expect(go).not.toHaveBeenCalled()
    expect(offers).toHaveLength(1)
  })
})

describe('following', () => {
  it('jumps across projects', () => {
    follow(true)
    const { deps, go } = rig()

    receiveShow(OTHER_PROJECT, deps)

    expect(go).toHaveBeenCalledExactlyOnceWith('/p/shop/home')
  })

  it('waits while busy and jumps once the last signal clears', () => {
    follow(true)
    const { deps, go, busy, offers } = rig()
    busy.set(true)

    receiveShow(PRICING, deps)
    expect(go).not.toHaveBeenCalled()
    expect(offers).toEqual([])

    busy.clear()
    expect(go).toHaveBeenCalledExactlyOnceWith('/p/studio/pricing')
  })

  it('reads Follow again when the wait ends, offering a cross-project show it no longer follows', () => {
    follow(true)
    const { deps, go, busy, offers } = rig()
    busy.set(true)
    receiveShow(OTHER_PROJECT, deps)

    follow(false)
    busy.clear()

    expect(go).not.toHaveBeenCalled()
    expect(offers).toHaveLength(1)
  })

  it('jumps a same-project show once the wait ends with Follow gone', () => {
    follow(true)
    const { deps, go, busy } = rig()
    busy.set(true)
    receiveShow(PRICING, deps)

    follow(false)
    busy.clear()

    expect(go).toHaveBeenCalledExactlyOnceWith('/p/studio/pricing')
  })
})

describe('not following and mid-action', () => {
  it('offers rather than waiting, and moves nothing', () => {
    const { deps, go, live, busy, offers } = rig()
    busy.set(true)

    receiveShow(PRICING, deps)

    expect(go).not.toHaveBeenCalled()
    expect(live.getState().focus).toBeNull()
    expect(offers).toEqual([{ id: 'toast-0', data: offerCopy(PRICING) }])
    expect(busy.waiting()).toBe(0)
  })
})

describe('a newer show', () => {
  it('replaces a waiting one, so only the latest lands', () => {
    follow(true)
    const { deps, go, busy } = rig()
    busy.set(true)
    receiveShow(PRICING, deps)

    receiveShow('studio/about/team', deps)
    expect(busy.waiting()).toBe(1)
    busy.clear()

    expect(go).toHaveBeenCalledExactlyOnceWith('/p/studio/about')
  })

  it('is dropped by a cancel, as when the socket closes', () => {
    follow(true)
    const { deps, go, busy } = rig()
    busy.set(true)
    receiveShow(PRICING, deps)

    cancelPendingShow()
    busy.clear()

    expect(go).not.toHaveBeenCalled()
  })

  it('closes an open offer', () => {
    const { deps, offers, closed } = rig()
    receiveShow(OTHER_PROJECT, deps)

    receiveShow('shop/cart/total', deps)

    expect(closed).toEqual(['toast-0'])
    expect(offers).toHaveLength(2)
  })

  it('closes an open offer when it jumps', () => {
    const { deps, go, closed } = rig()
    receiveShow(OTHER_PROJECT, deps)

    receiveShow(PRICING, deps)

    expect(closed).toEqual(['toast-0'])
    expect(go).toHaveBeenCalledExactlyOnceWith('/p/studio/pricing')
  })
})

describe('the offer', () => {
  it('names the frame, its page, and its project', () => {
    expect(offerCopy(OTHER_PROJECT)).toEqual({
      ref: OTHER_PROJECT,
      title: 'An agent showed hero',
      detail: 'home in shop',
    })
  })

  it('draws as the show offer toast, with no timer', () => {
    const add = vi.fn(() => 'id')
    const { deps } = rig()

    receiveShow(OTHER_PROJECT, { ...deps, toasts: { add, close: vi.fn() } })

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: SHOW_OFFER, timeout: 0 }),
    )
  })

  it('jumps and closes on Go', () => {
    const { deps, go, live, closed } = rig()
    receiveShow(OTHER_PROJECT, deps)

    acceptOffer(OTHER_PROJECT, deps)

    expect(go).toHaveBeenCalledExactlyOnceWith('/p/shop/home')
    expect(live.getState().focus).toBe(OTHER_PROJECT)
    expect(closed).toEqual(['toast-0'])
  })

  it('closes when the developer opens the offered page unaided', () => {
    const { deps, closed } = rig()
    receiveShow(OTHER_PROJECT, deps)

    cleanups.push(attachCanvas(controls, 'shop/home'))

    expect(closed).toEqual(['toast-0'])
  })

  it('stays when the developer opens another page', () => {
    const { deps, closed } = rig()
    receiveShow(OTHER_PROJECT, deps)

    cleanups.push(attachCanvas(controls, 'shop/cart'))

    expect(closed).toEqual([])
  })

  it('stops watching pages once the developer closes it', () => {
    const { deps, closed, closeFromUser } = rig()
    receiveShow(OTHER_PROJECT, deps)
    closeFromUser('toast-0')

    cleanups.push(attachCanvas(controls, 'shop/home'))

    expect(closed).toEqual(['toast-0'])
  })
})
