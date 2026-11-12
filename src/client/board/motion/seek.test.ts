import { afterEach, describe, expect, it } from 'vitest'

import { createSeeker, readFrameMotion } from './seek'

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

const mounted: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of mounted.splice(0)) frame.remove()
})

/** A live frame's window, its page loaded from `html`. */
async function frameWith(html: string): Promise<Window> {
  const iframe = document.createElement('iframe')
  mounted.push(iframe)
  const loaded = new Promise((done) => iframe.addEventListener('load', done))
  iframe.srcdoc = html
  document.body.append(iframe)
  await loaded
  const view = iframe.contentWindow
  if (!view) throw new Error('The frame has no window.')
  return view
}

function box(view: Window): HTMLElement {
  const found = view.document.getElementById('box')
  if (!found) throw new Error('The page has no box.')
  return found
}

describe('holding a live frame', () => {
  it('holds a CSS slide mid-way in the frame, not the board', async () => {
    const view = await frameWith(SLIDE)
    const found = await readFrameMotion(view, 1_000)
    if (!found) throw new Error('No motion found.')

    await createSeeker(view, found.motion)(1000)

    expect(found).toEqual({
      motion: { source: 'css', duration: 2000 },
      span: 2000,
    })
    expect(Math.round(box(view).getBoundingClientRect().left)).toBe(100)
  })

  it('holds a __hf page at the moment asked, in seconds', async () => {
    const view = await frameWith(HF)
    const found = await readFrameMotion(view, 1_000)
    if (!found) throw new Error('No motion found.')

    await createSeeker(view, found.motion)(1500)

    expect(found.motion).toEqual({ source: 'hf', duration: 3000 })
    expect(box(view).dataset.time).toBe('1.5')
  })

  it('holds every __timelines entry across the longest', async () => {
    const view = await frameWith(TIMELINES)
    const found = await readFrameMotion(view, 1_000)
    if (!found) throw new Error('No motion found.')

    await createSeeker(view, found.motion)(1000)

    expect(found.span).toBe(4000)
    expect([box(view).dataset.intro, box(view).dataset.launch]).toEqual([
      '1',
      '1',
    ])
  })

  it('spans one iteration, delay included, of an animation that repeats forever', async () => {
    const view = await frameWith(SPIN)

    expect(await readFrameMotion(view, 1_000)).toEqual({
      motion: { source: 'css', duration: null },
      span: 2000,
    })
  })

  it('reads a still page as having nothing to seek', async () => {
    const view = await frameWith('<p>Still</p>')

    expect(await readFrameMotion(view, 100)).toBeNull()
  })
})

describe('a drag over a slow seek', () => {
  it('seeks only the latest position once the running seek ends', async () => {
    const view = await frameWith(HF)
    const found = await readFrameMotion(view, 1_000)
    if (!found) throw new Error('No motion found.')
    const seek = createSeeker(view, found.motion)

    const positions = Array.from({ length: 60 }, (_, index) => index * 50)
    const runs = positions.map((ms) => seek(ms))
    await Promise.all(runs)

    expect((view as unknown as { seeks: number[] }).seeks).toEqual([0, 2.95])
  })
})
