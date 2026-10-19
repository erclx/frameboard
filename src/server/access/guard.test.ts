import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { type Access, isWriter, requireWriter } from './guard'

const TOKEN = 'a'.repeat(64)
const KEY = 'b'.repeat(64)
const PORT = 4173
const OWN = `http://127.0.0.1:${PORT}`

function access(overrides: Partial<Access> = {}): Access {
  return {
    token: () => TOKEN,
    key: KEY,
    cookieName: 'frameboard-key-111111111111',
    isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
    ...overrides,
  }
}

const cookie = (value = KEY, name = 'frameboard-key-111111111111') =>
  `theme=dark; ${name}=${value}; other=1`

describe('isWriter', () => {
  it('passes the address token as a bearer with no cookie or origin', () => {
    expect(isWriter({ authorization: `Bearer ${TOKEN}` }, access())).toBe(true)
  })

  it('passes the board cookie sent with the board own origin', () => {
    expect(isWriter({ cookie: cookie(), origin: OWN }, access())).toBe(true)
  })

  it.each([
    ['a cookie with no origin', { cookie: cookie() }],
    [
      'a cookie from another local port',
      { cookie: cookie(), origin: 'http://127.0.0.1:9999' },
    ],
    ['a cookie with a null origin', { cookie: cookie(), origin: 'null' }],
    [
      'a cookie from a foreign host',
      { cookie: cookie(), origin: 'https://evil.test' },
    ],
    ['a wrong key', { cookie: cookie('c'.repeat(64)), origin: OWN }],
    ['a key of another length', { cookie: cookie('short'), origin: OWN }],
    [
      'another board cookie name',
      { cookie: cookie(KEY, 'frameboard-key-222222222222'), origin: OWN },
    ],
    ['a wrong bearer', { authorization: `Bearer ${'c'.repeat(64)}` }],
    ['a bearer of another length', { authorization: 'Bearer short' }],
    ['a non-bearer scheme', { authorization: `Basic ${TOKEN}` }],
    ['no credentials', {}],
  ])('refuses %s', (_case, headers) => {
    expect(isWriter(headers, access())).toBe(false)
  })

  it('refuses every bearer before the address file records a token', () => {
    expect(
      isWriter(
        { authorization: `Bearer ${TOKEN}` },
        access({ token: () => null }),
      ),
    ).toBe(false)
  })
})

describe('requireWriter', () => {
  const app = new Hono()
  app.post('/write', requireWriter(access()), (c) => c.json({ ok: true }))

  it('lets a writer through to the route', async () => {
    const response = await app.request('/write', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.status).toBe(200)
  })

  it('answers 401 in the envelope to anyone else', async () => {
    const response = await app.request('/write', { method: 'POST' })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: expect.any(String) },
    })
  })
})
