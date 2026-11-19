import { afterEach, describe, expect, it, vi } from 'vitest'

import { frameElements } from '@/shared/frame-bridge/elements'
import { STEP_MS } from '@/shared/present-transition'
import { ask, bridgedFrame } from '@/test/frame-bridge'

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

/** Each press's elements by id, in order. */
function pressesOf(doc: Document): string[][] {
  return readSteps(doc).map((group) => group.map((item) => item.element.id))
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
  it('orders steps by number, keeping document order for ties', () => {
    const doc = slide(`
      <p id="c" data-step="3"></p>
      <p id="a" data-step="1"></p>
      <p id="b" data-step="2"></p>
    `)

    expect(pressesOf(doc)).toEqual([['a'], ['b'], ['c']])
  })

  it('closes gaps and shows equal numbers together', () => {
    const doc = slide(`
      <p id="one" data-step="1"></p>
      <p id="three" data-step="3"></p>
      <p id="three-too" data-step="3"></p>
      <p id="seven" data-step="7"></p>
    `)

    expect(pressesOf(doc)).toEqual([['one'], ['three', 'three-too'], ['seven']])
  })

  it('joins a with-previous step to the press before it, starting together', () => {
    const doc = slide(`
      <p id="a" data-step="1" data-step-effect="fade"></p>
      <p id="b" data-step="2" data-step-start="with"></p>
    `)

    const [press] = readSteps(doc)

    expect(press?.map((item) => item.delayMs)).toEqual([0, 0])
  })

  it('starts an after-previous step once the one before it finishes', () => {
    const doc = slide(`
      <p id="a" data-step="1" data-step-effect="fly"></p>
      <p id="b" data-step="2" data-step-start="after" data-step-effect="fade"></p>
      <p id="c" data-step="3" data-step-start="after"></p>
    `)

    const [press] = readSteps(doc)

    expect(press?.map((item) => item.delayMs)).toEqual([0, 400, 800])
  })

  it('reads an unknown effect as appear and a bad number as no step', () => {
    const doc = slide(`
      <p id="a" data-step="1" data-step-effect="spin"></p>
      <p id="zero" data-step="0"></p>
      <p id="word" data-step="two"></p>
    `)

    const groups = readSteps(doc)

    expect(groups.map((group) => group.map((item) => item.effect))).toEqual([
      ['appear'],
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
