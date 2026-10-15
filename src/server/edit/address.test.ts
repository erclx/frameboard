import { describe, expect, it } from 'vitest'

import { contentHash, parseFrame } from './address'

describe('parseFrame', () => {
  it('should list elements in document order, implied wrappers included', () => {
    const { elements } = parseFrame('<p>a<b>b</b></p><i>c</i>')
    expect(elements.map((element) => element.tagName)).toEqual([
      'html',
      'head',
      'body',
      'p',
      'b',
      'i',
    ])
  })

  it("should skip a template's content", () => {
    const { elements } = parseFrame('<template><li>a</li></template><p>b</p>')
    expect(elements.map((element) => element.tagName)).toEqual([
      'html',
      'head',
      'template',
      'body',
      'p',
    ])
  })

  it("should keep the wrappers' locations behind a leading BOM", () => {
    const source =
      '\uFEFF<!doctype html><html><head></head><body><p>a</p></body></html>'
    const { elements } = parseFrame(source)
    const html = elements[0]
    expect(html?.sourceCodeLocation?.startTag?.startOffset).toBe(
      source.indexOf('<html>'),
    )
  })

  it('should report an element the browser builds that the file does not state', () => {
    const { unstated } = parseFrame('<table><tr><td>a</td></tr></table>')
    expect(unstated?.tagName).toBe('tbody')
  })

  it('should report nothing unstated for implied wrappers alone', () => {
    expect(parseFrame('<p>a</p>').unstated).toBeUndefined()
  })
})

describe('contentHash', () => {
  it('should be SHA-256 hex over the raw bytes', () => {
    expect(contentHash(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
