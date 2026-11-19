import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BRIDGE } from '@/test/frame-bridge'

import { useMotionDriver } from './seek'
import { holdMotion, motionHoldOf, playMotion, releaseMotion } from './store'

// A box sliding 200 px right over 2 s, so its left edge names the moment.
// canon-allow-embedded: the page whose slide the hold assertions read, kept beside them
const SLIDE = `<style>
  @keyframes slide { from { transform: translateX(0) } to { transform: translateX(200px) } }
  body { margin: 0 }
  #box { width: 10px; height: 10px; animation: slide 2s linear forwards }
</style><div id="box"></div>`

const SPIN = `<style>
  @keyframes spin { to { transform: rotate(360deg) } }
  #box { width: 10px; height: 10px; animation: spin 1.5s 500ms linear infinite }
</style><div id="box"></div>`

/** A page holding `body` with the stamp and the bridge the frame route injects. */
function bridgedPage(body: string): string {
  return `<!doctype html><html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style>${BRIDGE}</head><body>${body}</body></html>`
}

const mounted: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of mounted.splice(0)) frame.remove()
})

/** A live frame's window, its page loaded from `html`. */
async function frameWith(html: string): Promise<Window> {
  const iframe = document.createElement('iframe')
  mounted.push(iframe)
  const loaded = new Promise((done) => iframe.addEventListener('load', done))
  iframe.srcdoc = bridgedPage(html)
  document.body.append(iframe)
  await loaded
  const view = iframe.contentWindow
  if (!view) throw new Error('The frame has no window.')
  return view
}

describe('a held frame an agent rewrites while its timeline is read', () => {
  afterEach(() => {
    releaseMotion('studio/home/slide')
  })

  it('holds the page it reloads into, though the read of the page it left never settles', async () => {
    const view = await frameWith(SLIDE)
    const iframe = mounted[0]
    if (!iframe) throw new Error('No frame mounted.')
    renderHook(() =>
      useMotionDriver({ current: iframe }, 'studio/home/slide', true, false),
    )

    holdMotion('studio/home/slide', 1000)
    const reloaded = new Promise((done) =>
      iframe.addEventListener('load', done, { once: true }),
    )
    // A write landing before the first read's frame runs discards that document.
    iframe.srcdoc = bridgedPage(`${SLIDE}<!-- rewritten -->`)
    await reloaded

    await waitFor(() => {
      const animation = view.document.getAnimations()[0]
      expect(animation?.playState).toBe('paused')
      expect(animation?.currentTime).toBe(1000)
    })
  })
})

describe('playing a live frame', () => {
  const REF = 'studio/home/slide'

  afterEach(() => {
    releaseMotion(REF)
  })

  async function playFrom(html: string, from: number): Promise<void> {
    await frameWith(html)
    const iframe = mounted[0]
    if (!iframe) throw new Error('No frame mounted.')
    renderHook(() => useMotionDriver({ current: iframe }, REF, true, false))
    playMotion(REF, from)
  }

  it('holds a timeline that ends at its end once the clock reaches it', async () => {
    await playFrom(SLIDE, 1900)

    await waitFor(() =>
      expect(motionHoldOf(REF)).toEqual({ at: 2000, playing: false }),
    )
  })

  it('wraps a timeline that repeats forever back over its iteration', async () => {
    await playFrom(SPIN, 1900)

    await waitFor(() => {
      const hold = motionHoldOf(REF)
      expect(hold?.playing).toBe(true)
      expect(hold?.at).toBeLessThan(1900)
    })
  })
})
