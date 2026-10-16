import { describe, expect, it } from 'vitest'

import { type Element, parseFrame } from './address'
import { rawAttribute, removeAttribute, setRawAttribute } from './attribute'

function first(source: string, tag: string): Element {
  const element = parseFrame(source).elements.find(
    (candidate) => candidate.tagName === tag,
  )
  if (!element) throw new Error(`no <${tag}> in ${source}`)
  return element
}

describe('setRawAttribute', () => {
  it('should splice inside a double-quoted value and keep the tag spacing', () => {
    const source = '<p  class="a"\n  id="b">x</p>'
    expect(setRawAttribute(source, first(source, 'p'), 'class', 'new')).toBe(
      '<p  class="new"\n  id="b">x</p>',
    )
  })

  it('should encode a single quote inside a single-quoted value', () => {
    const source = "<p title='a'>x</p>"
    expect(setRawAttribute(source, first(source, 'p'), 'title', "it's")).toBe(
      "<p title='it&#39;s'>x</p>",
    )
  })

  it('should quote an unquoted value', () => {
    const source = '<p title=a>x</p>'
    expect(setRawAttribute(source, first(source, 'p'), 'title', 'b c')).toBe(
      '<p title="b c">x</p>',
    )
  })

  it('should give a bare attribute a value', () => {
    const source = '<p hidden>x</p>'
    expect(setRawAttribute(source, first(source, 'p'), 'hidden', 'y')).toBe(
      '<p hidden="y">x</p>',
    )
  })

  it('should insert a new attribute before the closing bracket', () => {
    const source = '<p class=a>x</p>'
    expect(setRawAttribute(source, first(source, 'p'), 'title', 't')).toBe(
      '<p class=a title="t">x</p>',
    )
  })

  it('should insert before a real self-closing solidus', () => {
    const source = '<svg><circle r="1"/></svg>'
    expect(setRawAttribute(source, first(source, 'circle'), 'id', 'c')).toBe(
      '<svg><circle r="1" id="c" /></svg>',
    )
  })

  it('should not close a circle whose solidus ends an unquoted value', () => {
    const source = '<svg><circle id id=x/><path d="M0 0"></path></svg>'
    expect(setRawAttribute(source, first(source, 'circle'), 'class', 'c')).toBe(
      '<svg><circle id id=x/ class="c"><path d="M0 0"></path></svg>',
    )
  })
})

describe('removeAttribute', () => {
  it('should remove the attribute and the whitespace ahead of it', () => {
    const source = '<p id="a"\n  style="color: red">x</p>'
    expect(removeAttribute(source, first(source, 'p'), 'style')).toBe(
      '<p id="a">x</p>',
    )
  })

  it('should empty a duplicated attribute rather than promote the later one', () => {
    const source = '<label Style id=a Style="color: red">x</label>'
    expect(removeAttribute(source, first(source, 'label'), 'style')).toBe(
      source,
    )
  })

  it('should empty a valued first duplicate', () => {
    const source = '<p style="color: blue" style="color: red">x</p>'
    expect(removeAttribute(source, first(source, 'p'), 'style')).toBe(
      '<p style="" style="color: red">x</p>',
    )
  })
})

describe('rawAttribute', () => {
  it('should read the value as the file encodes it', () => {
    const source = '<p style="font-family: &quot;A&quot;">x</p>'
    expect(rawAttribute(source, first(source, 'p'), 'style')).toBe(
      'font-family: &quot;A&quot;',
    )
  })

  it('should read an absent attribute as undefined', () => {
    const source = '<p>x</p>'
    expect(rawAttribute(source, first(source, 'p'), 'style')).toBeUndefined()
  })
})
