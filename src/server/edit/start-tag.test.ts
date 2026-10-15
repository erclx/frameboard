import { describe, expect, it } from 'vitest'

import { scanStartTag } from './start-tag'

function scan(tag: string) {
  return scanStartTag(tag, { startOffset: 0, endOffset: tag.length })
}

describe('scanStartTag', () => {
  it('should find the self-closing solidus before the closing bracket', () => {
    expect(scan('<circle r="1"/>').slash).toBe(13)
  })

  it('should read a solidus ending an unquoted value as part of the value', () => {
    expect(scan('<circle id id=x/>').slash).toBeUndefined()
  })

  it('should read a solidus followed by more of the tag as no self-closing', () => {
    expect(scan('<br/ class=a>').slash).toBeUndefined()
  })

  it('should find the solidus after a space', () => {
    expect(scan('<br />').slash).toBe(4)
  })

  it('should list every attribute name in order, lowercased, duplicates included', () => {
    expect(scan('<label Style id=a Style="color: red">').names).toEqual([
      'style',
      'id',
      'style',
    ])
  })

  it('should list a bare attribute at the end of the tag', () => {
    expect(scan('<input disabled>').names).toEqual(['disabled'])
  })

  it('should read no names inside a quoted value', () => {
    expect(scan('<a title="x id=y" href=z>').names).toEqual(['title', 'href'])
  })
})
