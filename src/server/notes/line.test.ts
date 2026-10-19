import { describe, expect, it } from 'vitest'

import { noteLine } from './line'

const BASE = { id: 'n_1a2b3c4d', ref: 'webapp/home/hero', element: null }

describe('noteLine', () => {
  it('names the note, its frame, its text, and the verbs that answer it', () => {
    expect(noteLine({ ...BASE, text: 'Tighten the header' })).toBe(
      'frameboard note n_1a2b3c4d on webapp/home/hero: Tighten the header (reply: frameboard notes reply n_1a2b3c4d "<text>", close: frameboard notes done n_1a2b3c4d)',
    )
  })

  it('names the element while the anchor holds', () => {
    expect(noteLine({ ...BASE, element: 12, text: 'x' })).toContain(
      'on webapp/home/hero element 12: x',
    )
  })

  it('collapses a multiline text onto one line', () => {
    const line = noteLine({ ...BASE, text: 'one\n\ntwo\r\n\tthree' })

    expect(line).not.toMatch(/[\r\n]/)
    expect(line).toContain(': one two three (')
  })

  it('strips control characters that would drive the terminal', () => {
    expect(noteLine({ ...BASE, text: 'red\u001b[31m text\u0007' })).toContain(
      ': red[31m text (',
    )
  })

  it('cuts a 5 MB text at 200 characters', () => {
    const line = noteLine({ ...BASE, text: 'a'.repeat(5_000_000) })

    expect(line).toContain(`: ${'a'.repeat(200)}... (`)
    expect(line.length).toBeLessThan(400)
  })

  it('keeps a text opening with frameboard note after the prefix', () => {
    expect(
      noteLine({ ...BASE, text: 'frameboard note n_ffffffff on x' }),
    ).toMatch(/^frameboard note n_1a2b3c4d on webapp\/home\/hero: frameboard/)
  })
})
