import { afterEach, describe, expect, it } from 'vitest'

import type { FrameMotion } from '@/shared/frame-bridge/motion'
import { ask, bridgedFrame } from '@/test/frame-bridge'

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

// A HyperFrames-shaped runtime of 3 s whose seek takes 30 ms and counts its calls.
// canon-allow-embedded: the window.__hf contract the hold drives, kept beside it
const HF = `<div id="box"></div><script>
  window.seeks = []
  window.__hf = {
    duration: 3,
    seek(time) {
      window.seeks.push(time)
      document.getElementById('box').dataset.time = String(time)
      return new Promise((done) => setTimeout(done, 30))
    },
  }
</script>`

// Two paused GSAP-shaped timelines, the longer 4 s, each recording its seek.
// canon-allow-embedded: the window.__timelines registry the hold drives, kept beside it
const TIMELINES = `<div id="box"></div><script>
  const timeline = (name, length) => ({
    duration: () => length,
    pause() {},
    seek(time) { document.getElementById('box').dataset[name] = String(time) },
  })
  window.__timelines = { intro: timeline('intro', 1.5), launch: timeline('launch', 4) }
</script>`

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

function pageOf(frame: HTMLIFrameElement): Window {
  const view = frame.contentWindow
  if (!view) throw new Error('The iframe holds no window')
  return view
}

function box(frame: HTMLIFrameElement): HTMLElement {
  const found = pageOf(frame).document.getElementById('box')
  if (!found) throw new Error('The page has no box.')
  return found
}

/** A frame showing `body`, with the timeline its `motion` subscription found. */
async function timelineOf(
  body: string,
): Promise<{ frame: HTMLIFrameElement; id: string; found: FrameMotion }> {
  iframe = await bridgedFrame(body)
  const frame = iframe
  const { id, pushes } = await ask(frame, 'motion', {})
  await expect.poll(() => pushes).toHaveLength(1)
  const [found] = pushes
  if (!found) throw new Error('No motion found.')
  return { frame, id, found }
}

describe('motion', () => {
  it('pushes a CSS slide once it runs', async () => {
    const { found } = await timelineOf(SLIDE)

    expect(found).toEqual({
      motion: { source: 'css', duration: 2000 },
      span: 2000,
    })
  })

  it('spans one iteration, delay included, of an animation that repeats forever', async () => {
    const { found } = await timelineOf(SPIN)

    expect(found).toEqual({
      motion: { source: 'css', duration: null },
      span: 2000,
    })
  })

  it('spans every __timelines entry across the longest', async () => {
    const { found } = await timelineOf(TIMELINES)

    expect(found.span).toBe(4000)
  })
})

describe('motion-seek', () => {
  it('holds a CSS slide mid-way in the frame', async () => {
    const { frame, id } = await timelineOf(SLIDE)

    const { reply } = await ask(frame, 'motion-seek', { motion: id, at: 1000 })

    expect(reply).toEqual({ value: true })
    await expect
      .poll(() => Math.round(box(frame).getBoundingClientRect().left))
      .toBe(100)
  })

  it('holds a __hf page at the moment asked, in seconds', async () => {
    const { frame, id } = await timelineOf(HF)

    await ask(frame, 'motion-seek', { motion: id, at: 1500 })

    await expect.poll(() => box(frame).dataset.time).toBe('1.5')
  })

  it('holds every __timelines entry at the moment asked', async () => {
    const { frame, id } = await timelineOf(TIMELINES)

    await ask(frame, 'motion-seek', { motion: id, at: 1000 })

    await expect
      .poll(() => [box(frame).dataset.intro, box(frame).dataset.launch])
      .toEqual(['1', '1'])
  })

  it('seeks only the newest moment once the running seek ends', async () => {
    const { frame, id } = await timelineOf(HF)

    await Promise.all(
      [0, 50, 100, 2950].map((at) =>
        ask(frame, 'motion-seek', { motion: id, at }),
      ),
    )

    await expect
      .poll(() => (pageOf(frame) as unknown as { seeks: number[] }).seeks)
      .toEqual([0, 2.95])
  })

  it('answers false for a subscription it holds no timeline under', async () => {
    iframe = await bridgedFrame(SLIDE)

    const { reply } = await ask(iframe, 'motion-seek', {
      motion: 'gone',
      at: 0,
    })

    expect(reply).toEqual({ value: false })
  })
})

describe('motion-release', () => {
  it('plays a held CSS slide on from where it stands', async () => {
    const { frame, id } = await timelineOf(SLIDE)
    await ask(frame, 'motion-seek', { motion: id, at: 1000 })
    const animation = () => pageOf(frame).document.getAnimations()[0]
    await expect.poll(() => animation()?.playState).toBe('paused')

    const { reply } = await ask(frame, 'motion-release', { motion: id })

    expect(reply).toEqual({ value: true })
    expect(animation()?.playState).toBe('running')
  })
})

describe('motion-moment', () => {
  it('reads where a free-running CSS slide stands', async () => {
    const { frame, id, found } = await timelineOf(SLIDE)
    await ask(frame, 'motion-seek', { motion: id, at: 1200 })
    await expect
      .poll(() => pageOf(frame).document.getAnimations()[0]?.currentTime)
      .toBe(1200)

    const { reply } = await ask(frame, 'motion-moment', found)

    expect(reply).toEqual({ value: 1200 })
  })

  it('reads a HyperFrames page at its start, which exposes no reading', async () => {
    const { frame, found } = await timelineOf(HF)

    const { reply } = await ask(frame, 'motion-moment', found)

    expect(reply).toEqual({ value: 0 })
  })
})
