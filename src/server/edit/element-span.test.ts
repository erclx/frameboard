import { describe, expect, it } from 'vitest'

import { type ElementSpan, holdsSpan, swapSpan } from './element-span'

// Elements 0 to 2 are the implied html, head, and body, so the two
// paragraphs sit at 3 and 4.
const EDITED = '<p class="a" style="color: red">one</p><p>two</p>'

const startTag: ElementSpan = {
  scope: 'start-tag',
  index: 3,
  count: 5,
  before: '<p class="a">',
  after: '<p class="a" style="color: red">',
}

describe('swapSpan', () => {
  it('swaps the start tag back at its index', () => {
    const swapped = swapSpan(EDITED, startTag, 'after')

    expect(swapped?.html).toBe('<p class="a">one</p><p>two</p>')
  })

  it('swaps it forward again for a redo', () => {
    const swapped = swapSpan(
      '<p class="a">one</p><p>two</p>',
      startTag,
      'before',
    )

    expect(swapped?.html).toBe(EDITED)
  })

  it('keeps what an agent wrote in another element', () => {
    const swapped = swapSpan(
      '<p class="a" style="color: red">one</p><p title="agent">two</p>',
      startTag,
      'after',
    )

    expect(swapped?.html).toBe('<p class="a">one</p><p title="agent">two</p>')
  })

  it('finds the element by its bytes once an agent added one above', () => {
    const swapped = swapSpan(`<h1>new</h1>${EDITED}`, startTag, 'after')

    expect(swapped?.html).toBe('<h1>new</h1><p class="a">one</p><p>two</p>')
    expect(swapped?.span).toMatchObject({ index: 4, count: 6 })
  })

  it('finds the element by its index when a sibling reads the same', () => {
    const span: ElementSpan = {
      scope: 'start-tag',
      index: 4,
      count: 5,
      before: '<p style="color: red">',
      after: '<p>',
    }

    const swapped = swapSpan('<p>one</p><p>two</p>', span, 'after')

    expect(swapped?.html).toBe('<p>one</p><p style="color: red">two</p>')
  })

  it('refuses once an agent changed another attribute on the element', () => {
    const swapped = swapSpan(
      '<p class="b" style="color: red">one</p><p>two</p>',
      startTag,
      'after',
    )

    expect(swapped).toBeUndefined()
  })

  it('refuses once an agent removed the element', () => {
    expect(swapSpan('<p>two</p>', startTag, 'after')).toBeUndefined()
  })

  it('refuses when two elements match after the count changed', () => {
    const swapped = swapSpan(`${EDITED}${EDITED}`, startTag, 'after')

    expect(swapped).toBeUndefined()
  })

  it('refuses when the same index holds another element at the same count', () => {
    const swapped = swapSpan(
      '<p>two</p><p class="a" style="color: red">one</p>',
      startTag,
      'after',
    )

    expect(swapped).toBeUndefined()
  })

  describe('element scope', () => {
    const text: ElementSpan = {
      scope: 'element',
      index: 3,
      count: 5,
      before: '<h1>hero</h1>',
      after: '<h1>Welcome</h1>',
    }

    it('swaps the whole element back', () => {
      const swapped = swapSpan('<h1>Welcome</h1><p>x</p>', text, 'after')

      expect(swapped?.html).toBe('<h1>hero</h1><p>x</p>')
    })

    it('refuses once an agent changed the text', () => {
      expect(
        swapSpan('<h1>Welcome!</h1><p>x</p>', text, 'after'),
      ).toBeUndefined()
    })

    it('refuses once an agent changed the start tag', () => {
      expect(
        swapSpan('<h1 id="t">Welcome</h1><p>x</p>', text, 'after'),
      ).toBeUndefined()
    })
  })
})

describe('holdsSpan', () => {
  it('holds while the element reads the side asked for', () => {
    expect(holdsSpan(EDITED, startTag, 'after')).toBe(true)
  })

  it('does not hold the other side', () => {
    expect(holdsSpan(EDITED, startTag, 'before')).toBe(false)
  })
})
