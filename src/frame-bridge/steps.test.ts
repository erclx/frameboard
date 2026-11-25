import { afterEach, describe, expect, it, vi } from 'vitest'

import { frameElements } from '@/shared/frame-bridge/elements'
import { STEP_MS } from '@/shared/present-transition'
import { ask, bridgedFrame } from '@/test/frame-bridge'
import { emulateReducedMotion } from '@/test/motion'

import {
  clearSteps,
  previewStep,
  readSteps,
  showSteps,
  touchesSteps,
} from './steps'

/** A document holding `body`, standing in for a presented frame. */
function slide(body: string): Document {
  const doc = document.implementation.createHTMLDocument('slide')
  doc.body.innerHTML = body
  return doc
}

/** Each step element's id and whether it shows. */
function visibility(doc: Document): Record<string, string> {
  return Object.fromEntries(
    [...doc.querySelectorAll('[data-step]')].map((element) => [
      element.id,
      element.getAttribute('data-frameboard-step') ?? 'unmarked',
    ]),
  )
}

/** The records one change to `doc` leaves an observer of its subtree. */
function recordsOf(doc: Document, change: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {})
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributeFilter: ['data-step'],
  })
  change()
  const records = observer.takeRecords()
  observer.disconnect()
  return records
}

describe('touchesSteps', () => {
  it('reads an unmarked node added or removed as no change to the steps', () => {
    const doc = slide('<p id="a" data-step="1"></p><span id="tick"></span>')

    const added = recordsOf(doc, () => doc.body.append(doc.createElement('i')))
    const removed = recordsOf(doc, () => doc.getElementById('tick')?.remove())

    expect([touchesSteps(added), touchesSteps(removed)]).toEqual([false, false])
  })

  it('reads a marked node added, alone or inside another, as a change', () => {
    const doc = slide('<p id="a" data-step="1"></p>')
    const wrapped = doc.createElement('div')
    wrapped.innerHTML = '<p data-step="2"></p>'

    const records = recordsOf(doc, () => doc.body.append(wrapped))

    expect(touchesSteps(records)).toBe(true)
  })

  it('reads a marked node removed as a change', () => {
    const doc = slide('<p id="a" data-step="1"></p>')

    const records = recordsOf(doc, () => doc.getElementById('a')?.remove())

    expect(touchesSteps(records)).toBe(true)
  })

  it('reads a step attribute written as a change', () => {
    const doc = slide('<p id="a" data-step="1"></p>')

    const records = recordsOf(doc, () =>
      doc.getElementById('a')?.setAttribute('data-step', '2'),
    )

    expect(touchesSteps(records)).toBe(true)
  })
})

describe('readSteps', () => {
  it('reads each marked element as its attributes say, by press', () => {
    const doc = slide(`
      <p id="late" data-step="2" data-step-delay="250"></p>
      <video id="clip" data-step="1" data-step-effect="fade" data-step-duration="900" data-step-play></video>
      <p id="after" data-step="1" data-step-start="after"></p>
      <p id="word" data-step="two"></p>
    `)

    const groups = readSteps(doc)

    expect(
      groups.map((group) =>
        group.map(({ of, step, waitMs }) => [of.id, waitMs, step.plays]),
      ),
    ).toEqual([
      [
        ['clip', 0, true],
        ['after', 900, false],
      ],
      [['late', 250, false]],
    ])
  })
})

describe('showSteps', () => {
  const doc = slide(`
    <p id="a" data-step="1" data-step-effect="fade"></p>
    <p id="b" data-step="2"></p>
    <p id="c" data-step="3" data-step-effect="wipe"></p>
  `)

  afterEach(() => {
    clearSteps(doc)
  })

  it('hides every step before the first press', () => {
    showSteps(doc, readSteps(doc), 0)

    expect(visibility(doc)).toEqual({ a: 'hidden', b: 'hidden', c: 'hidden' })
  })

  it('plays the newly revealed step and keeps the earlier ones standing', () => {
    showSteps(doc, readSteps(doc), 2, 1)

    expect(visibility(doc)).toEqual({ a: 'shown', b: 'enter', c: 'hidden' })
  })

  it('hides the last revealed step on a step back', () => {
    const groups = readSteps(doc)
    showSteps(doc, groups, 3, 2)

    showSteps(doc, groups, 2)

    expect(visibility(doc)).toEqual({ a: 'shown', b: 'shown', c: 'hidden' })
  })

  it('leaves the document as the file shows it once cleared', () => {
    showSteps(doc, readSteps(doc), 0)

    clearSteps(doc)

    expect(visibility(doc)).toEqual({
      a: 'unmarked',
      b: 'unmarked',
      c: 'unmarked',
    })
    expect(doc.getElementById('a')?.getAttribute('style')).toBe('')
  })
})

describe('previewStep', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The element's marks and whether the step style is in, as one record. */
  const marksOf = (doc: Document, id: string) => {
    const element = doc.getElementById(id)
    return {
      state: element?.getAttribute('data-frameboard-step') ?? null,
      effect: element?.getAttribute('data-frameboard-step-effect') ?? null,
      style: doc.getElementById('frameboard-present-steps') !== null,
    }
  }

  it('plays the effect on the element alone', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p><p id="b"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')

    previewStep(element, 'fly')

    expect([marksOf(doc, 'a'), marksOf(doc, 'b').state]).toEqual([
      { state: 'enter', effect: 'fly', style: true },
      null,
    ])
  })

  it('leaves the document as the file shows it once the effect ends', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')
    const before = doc.documentElement.outerHTML

    previewStep(element, 'wipe')
    vi.advanceTimersByTime(STEP_MS)

    expect(doc.documentElement.outerHTML).toBe(before)
  })

  it('holds its marks for the length it is given, then leaves the document as the file shows it', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')
    const before = doc.documentElement.outerHTML

    previewStep(element, 'fade', 1500)
    vi.advanceTimersByTime(1499)
    const held = marksOf(doc, 'a').state
    vi.advanceTimersByTime(1)

    expect([held, doc.documentElement.outerHTML]).toEqual(['enter', before])
  })

  it('takes its marks back at once when ended early', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')

    const end = previewStep(element, 'zoom')
    end()

    expect(marksOf(doc, 'a')).toEqual({
      state: null,
      effect: null,
      style: false,
    })
  })

  it('leaves every element index in place while it plays', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p><p id="b"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')
    const before = frameElements(doc)

    previewStep(element, 'fade')

    expect(frameElements(doc)).toEqual(before)
  })

  it('blinks an Appear by hiding the element for a beat', () => {
    vi.useFakeTimers()
    const doc = slide('<p id="a" data-step="1"></p>')
    const element = doc.getElementById('a')
    if (!element) throw new Error('No step element')

    previewStep(element, 'appear')
    const held = marksOf(doc, 'a').state
    vi.advanceTimersByTime(STEP_MS)

    expect([held, marksOf(doc, 'a').state]).toEqual(['hidden', null])
  })
})

describe('the step ops', () => {
  const STEPPED =
    '<p id="a" data-step="1">One</p><p id="b" data-step="2">Two</p>'

  let iframe: HTMLIFrameElement | undefined

  afterEach(() => {
    iframe?.remove()
    iframe = undefined
  })

  async function frameOf(body: string): Promise<Document> {
    iframe = await bridgedFrame(body)
    const doc = iframe.contentDocument
    if (!doc) throw new Error('The iframe holds no page')
    return doc
  }

  function frame(): HTMLIFrameElement {
    if (!iframe) throw new Error('No frame open')
    return iframe
  }

  it('answers how many presses a page holds and shows the first it is asked to', async () => {
    const doc = await frameOf(STEPPED)

    const { reply } = await ask(frame(), 'steps', { shown: 1 })

    expect(reply).toEqual({ value: 2 })
    expect(visibility(doc)).toEqual({ a: 'shown', b: 'hidden' })
  })

  it('shows a walk at the step the board names, playing its entrance', async () => {
    const doc = await frameOf(STEPPED)
    const walk = await ask(frame(), 'steps', { shown: 0 })

    const { reply } = await ask(frame(), 'steps-show', {
      steps: walk.id,
      shown: 2,
      entering: 1,
    })

    expect(reply).toEqual({ value: true })
    expect(visibility(doc)).toEqual({ a: 'shown', b: 'enter' })
  })

  it('gives each entrance its own length and wait', async () => {
    const doc = await frameOf(`
      <p id="long" data-step="1" data-step-effect="fade" data-step-duration="900"></p>
      <p id="late" data-step="1" data-step-effect="fly" data-step-delay="250"></p>
      <p id="cut" data-step="1" data-step-duration="900"></p>
    `)
    const walk = await ask(frame(), 'steps', { shown: 0 })
    const timing = (id: string) => {
      const element = doc.getElementById(id)
      const style = element && doc.defaultView?.getComputedStyle(element)
      return [style?.animationDuration, style?.animationDelay]
    }

    await ask(frame(), 'steps-show', { steps: walk.id, shown: 1, entering: 0 })

    expect([timing('long'), timing('late'), timing('cut')]).toEqual([
      ['0.9s', '0s'],
      ['0.4s', '0.25s'],
      ['0.001s', '0s'],
    ])
  })

  it('refuses to show a walk the board never opened', async () => {
    await frameOf(STEPPED)

    const { reply } = await ask(frame(), 'steps-show', {
      steps: 'gone',
      shown: 1,
      entering: null,
    })

    expect(reply).toEqual({ value: false })
  })

  it('hides a step an agent adds at once, keeping the step it holds, and pushes the new count', async () => {
    const doc = await frameOf(STEPPED)
    const { pushes } = await ask(frame(), 'steps', { shown: 1 })

    doc.body.insertAdjacentHTML(
      'beforeend',
      '<p id="c" data-step="3">Three</p>',
    )

    await expect.poll(() => pushes).toEqual([3])
    expect(visibility(doc)).toEqual({ a: 'shown', b: 'hidden', c: 'hidden' })
  })

  it('reads nothing again once closed', async () => {
    const doc = await frameOf(STEPPED)
    const { pushes, close } = await ask(frame(), 'steps', { shown: 0 })
    close()
    await ask(frame(), 'live-body', {})

    doc.body.insertAdjacentHTML(
      'beforeend',
      '<p id="c" data-step="3">Three</p>',
    )
    await ask(frame(), 'live-body', {})

    expect(pushes).toEqual([])
    expect(visibility(doc).c).toBe('unmarked')
  })

  it('plays a preview on the element at an index and takes it back on close', async () => {
    const doc = await frameOf('<p id="a" data-step="1">One</p>')
    const index = frameElements(doc).findIndex((element) => element.id === 'a')

    const { reply, close } = await ask(frame(), 'step-preview', {
      index,
      effect: 'fade',
    })
    const playing = doc
      .getElementById('a')
      ?.getAttribute('data-frameboard-step')
    close()
    await ask(frame(), 'live-body', {})

    expect([reply, playing]).toEqual([{ value: true }, 'enter'])
    expect(visibility(doc).a).toBe('unmarked')
  })

  it('answers false for a preview at no element', async () => {
    await frameOf('<p>Plain</p>')

    const { reply } = await ask(frame(), 'step-preview', {
      index: 99,
      effect: 'fade',
    })

    expect(reply).toEqual({ value: false })
  })
})

describe('a playing step', () => {
  /** Muted, so a page nobody pressed plays it, and holding no file, which plays and pauses all the same. */
  const video = (attributes = '') =>
    `<video id="clip" muted data-step="1" data-step-effect="fade" data-step-play ${attributes}></video>`

  const VIEWER_SCRIPT =
    '<script type="module" src="/src/test/model-viewer-stub.js"></script>'
  const model = (attributes = '') =>
    `<model-viewer id="clip" src="spin.glb" data-step="1" data-step-effect="fade" data-step-play ${attributes}></model-viewer>`

  /** What the walk reads off a clip of either kind. */
  type Clip = Element & {
    paused: boolean
    currentTime: number
    loaded?: boolean
  }

  let iframe: HTMLIFrameElement | undefined

  afterEach(async () => {
    await emulateReducedMotion(false)
    iframe?.remove()
    iframe = undefined
  })

  /** The clip on a bridged page holding `body`. */
  async function clipOn(body: string, head = ''): Promise<Clip> {
    iframe = await bridgedFrame(body, { head })
    return clipIn(iframe)
  }

  function clipIn(frame: HTMLIFrameElement): Clip {
    const clip = frame.contentDocument?.getElementById('clip')
    if (!clip) throw new Error('No clip on the page')
    return clip as Element as Clip
  }

  function frame(): HTMLIFrameElement {
    if (!iframe) throw new Error('No frame open')
    return iframe
  }

  /** Opens a walk on the page and answers the call that shows it at a step. */
  async function walk(plays?: boolean, shown = 0) {
    const { id } = await ask(frame(), 'steps', {
      shown,
      ...(plays === undefined ? {} : { plays }),
    })
    return (at: number, entering: number | null) =>
      ask(frame(), 'steps-show', { steps: id, shown: at, entering })
  }

  it('starts its video as its press reveals it', async () => {
    const clip = await clipOn(video())
    const show = await walk(true)
    const before = clip.paused

    await show(1, 0)

    expect([before, clip.paused]).toEqual([true, false])
  })

  it('starts its model as its press reveals it', async () => {
    const clip = await clipOn(model(), VIEWER_SCRIPT)
    await expect.poll(() => clip.loaded).toBe(true)
    const show = await walk(true)

    await show(1, 0)

    expect(clip.paused).toBe(false)
  })

  it('starts a model that loads after its press', async () => {
    const clip = await clipOn(model())
    const show = await walk(true)
    await show(1, 0)
    const script = clip.ownerDocument.createElement('script')
    script.type = 'module'
    script.src = '/src/test/model-viewer-stub.js'

    clip.ownerDocument.head.append(script)

    await expect.poll(() => clip.paused).toBe(false)
  })

  it('plays nothing on a walk that never asked to', async () => {
    const clip = await clipOn(video())
    const show = await walk()

    await show(1, 0)

    expect(clip.paused).toBe(true)
  })

  it('plays nothing for an element that holds no play', async () => {
    const clip = await clipOn('<video id="clip" muted data-step="1"></video>')
    const show = await walk(true)

    await show(1, 0)

    expect(clip.paused).toBe(true)
  })

  it('waits its delay before its clip', async () => {
    const clip = await clipOn(video('data-step-delay="300"'))
    const show = await walk(true)

    await show(1, 0)
    const before = clip.paused

    expect(before).toBe(true)
    await expect.poll(() => clip.paused).toBe(false)
  })

  it('starts its clip at once when the next press comes during its delay', async () => {
    const clip = await clipOn(
      `${video('data-step-delay="10000"')}<p data-step="2">Next</p>`,
    )
    const show = await walk(true)
    await show(1, 0)

    await show(2, 1)

    expect(clip.paused).toBe(false)
  })

  it('leaves nothing to start once stepped back during its delay', async () => {
    const clip = await clipOn(video('data-step-delay="200"'))
    const show = await walk(true)
    await show(1, 0)

    await show(0, null)
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(clip.paused).toBe(true)
  })

  it('rests a running model at its start on a step back', async () => {
    const clip = await clipOn(model(), VIEWER_SCRIPT)
    await expect.poll(() => clip.loaded).toBe(true)
    const show = await walk(true)
    await show(1, 0)
    const running = clip.currentTime

    await show(0, null)

    expect([running, clip.paused, clip.currentTime]).toEqual([0.4, true, 0])
  })

  it('rests a running video on a step back', async () => {
    const clip = await clipOn(video())
    const show = await walk(true)
    await show(1, 0)

    await show(0, null)

    expect(clip.paused).toBe(true)
  })

  it('rests a model whose autoplay starts it while hidden', async () => {
    const clip = await clipOn(model('autoplay'))
    await walk(true)
    const script = clip.ownerDocument.createElement('script')
    script.type = 'module'
    script.src = '/src/test/model-viewer-stub.js'

    clip.ownerDocument.head.append(script)

    await expect.poll(() => clip.loaded).toBe(true)
    expect([clip.paused, clip.currentTime]).toEqual([true, 0])
  })

  it('starts nothing for a step the walk opens past', async () => {
    const clip = await clipOn(video())

    await walk(true, 1)

    expect(clip.paused).toBe(true)
  })

  it('never restarts a clip on a reread of its step', async () => {
    const clip = await clipOn(video())
    const show = await walk(true)
    await show(1, 0)
    ;(clip as unknown as HTMLVideoElement).pause()

    clip.setAttribute('data-step-effect', 'zoom')
    await ask(frame(), 'live-body', {})

    expect(clip.paused).toBe(true)
  })

  it('shows its step where the page refuses to play', async () => {
    const clip = await clipOn(video())
    ;(clip as unknown as HTMLVideoElement).play = () =>
      Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
    const show = await walk(true)

    await show(1, 0)

    expect(clip.getAttribute('data-frameboard-step')).toBe('enter')
  })

  it('plays a video at once under reduced motion, whatever its delay', async () => {
    await emulateReducedMotion(true)
    const clip = await clipOn(video('data-step-delay="10000"'))
    const show = await walk(true)

    await show(1, 0)

    expect(clip.paused).toBe(false)
  })

  it('keeps a model at rest under reduced motion', async () => {
    await emulateReducedMotion(true)
    const clip = await clipOn(model('autoplay'), VIEWER_SCRIPT)
    await expect.poll(() => clip.loaded).toBe(true)
    const show = await walk(true)

    await show(1, 0)

    expect([clip.paused, clip.currentTime]).toEqual([true, 0])
  })
})
