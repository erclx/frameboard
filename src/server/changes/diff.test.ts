import { describe, expect, it } from 'vitest'

import { changedElements } from './diff'

const page = (body: string) =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

// html 0, head 1, title 2, body 3, then the body's elements from 4.
const CARDS = '<main><h1>Plans</h1><p>Pick one</p><ul><li>Free</li></ul></main>'

describe('changedElements', () => {
  it('names the one element whose text changed', () => {
    const after = CARDS.replace('Pick one', 'Choose a plan')

    const diff = changedElements(page(CARDS), page(after))

    expect(diff).toEqual({ elements: [6], removed: 0, whole: false })
  })

  it('names an inserted card by its outer element alone', () => {
    const after = CARDS.replace(
      '</ul>',
      '</ul><section><h2>Pro</h2><p>$9</p></section>',
    )

    const diff = changedElements(page(CARDS), page(after))

    expect(diff).toEqual({ elements: [9], removed: 0, whole: false })
  })

  it('names an element whose attribute changed', () => {
    const after = CARDS.replace('<ul>', '<ul class="grid">')

    const diff = changedElements(page(CARDS), page(after))

    expect(diff.elements).toEqual([7])
  })

  it('counts a removed element with nothing to name', () => {
    const after = CARDS.replace('<p>Pick one</p>', '')

    const diff = changedElements(page(CARDS), page(after))

    expect(diff).toEqual({ elements: [], removed: 1, whole: false })
  })

  it('names nothing for a file that only reflowed its whitespace', () => {
    const after = CARDS.replace('<h1>', '\n  <h1>')

    const diff = changedElements(page(CARDS), page(after))

    expect(diff).toEqual({ elements: [], removed: 0, whole: false })
  })

  it('reports a wholesale rewrite as whole', () => {
    const after = '<div><span>a</span><span>b</span><em>c</em></div>'

    const diff = changedElements(page(CARDS), page(after))

    expect(diff.whole).toBe(true)
  })

  it('reports more than 8 changed elements as whole', () => {
    const before = Array.from({ length: 30 }, (_, i) => `<p>${i}</p>`).join('')
    const after = before.replace(/<p>([0-8])<\/p>/g, '<p>new $1</p>')

    const diff = changedElements(page(before), page(after))

    expect(diff.whole).toBe(true)
  })

  it('names 8 changed elements one by one', () => {
    const before = Array.from({ length: 30 }, (_, i) => `<p>${i}</p>`).join('')
    const after = before.replace(/<p>([0-7])<\/p>/g, '<p>new $1</p>')

    const diff = changedElements(page(before), page(after))

    expect(diff).toMatchObject({ whole: false, removed: 0 })
    expect(diff.elements).toHaveLength(8)
  })

  it('reports a frame the browser builds differently from its file as whole', () => {
    const after = '<table><tr><td>x</td></tr></table>'

    const diff = changedElements(page(CARDS), page(after))

    expect(diff.whole).toBe(true)
  })

  it('reports a new file as whole', () => {
    const diff = changedElements('', page(CARDS))

    expect(diff.whole).toBe(true)
  })
})
