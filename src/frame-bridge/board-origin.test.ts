import { describe, expect, it } from 'vitest'

import { answersParent } from './board-origin'

const OWN = 'http://127.0.0.1:47123'

describe('answersParent', () => {
  it.each([
    ['the board on 127.0.0.1', 'http://127.0.0.1:4321'],
    ['the board on localhost', 'http://localhost:4321'],
    ['Vite on its own port', 'http://localhost:5173'],
    ['a srcdoc frame on its own origin', OWN],
  ])('answers %s', (_case, origin) => {
    expect(answersParent(origin, OWN)).toBe(true)
  })

  it.each([
    ['a foreign host', 'http://evil.test'],
    ['a foreign host on a loopback port', 'http://evil.test:4321'],
    ['a loopback name inside a foreign one', 'http://localhost.evil.test:4321'],
    ['an opaque origin', 'null'],
    ['a loopback name over https', 'https://localhost:4321'],
    ['a malformed origin', 'http://127.0.0.1:4321/path'],
    ['no origin', ''],
  ])('refuses %s', (_case, origin) => {
    expect(answersParent(origin, OWN)).toBe(false)
  })

  it('refuses an opaque origin even when the frame is opaque too', () => {
    expect(answersParent('null', 'null')).toBe(false)
  })
})
