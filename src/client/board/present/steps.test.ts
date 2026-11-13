import { afterEach, describe, expect, it } from 'vitest'

import { clearSteps, readSteps, showSteps, touchesSteps } from './steps'

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
