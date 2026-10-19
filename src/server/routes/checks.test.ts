import { describe, expect, it } from 'vitest'

import type { Finding } from '@/shared/records/check'

import { type BrowserChecks, checkRoutes } from './checks'

const TOKEN = 'a'.repeat(64)

const ACCESS = {
  token: () => TOKEN,
  key: 'b'.repeat(64),
  cookieName: 'frameboard-key-111111111111',
  isOwnOrigin: () => false,
}

const CLIPPED: Finding = {
  rule: 'clipped',
  severity: 'error',
  frame: 'site/home/hero',
  path: 'site/home/hero.html',
  message: 'site/home/hero is cut off.',
  location: null,
}

/** A checker holding `held` by ref, settling once `settled` is called. */
function fakeChecks(
  held: Record<string, Finding[]>,
  unavailable: 'browser-not-found' | null = null,
) {
  const asked: string[][] = []
  const checks: BrowserChecks = {
    settle: async (refs) => {
      asked.push(refs)
    },
    rendered: (refs) =>
      Object.fromEntries(refs.map((ref) => [ref, held[ref] ?? []])),
    unavailable: () => unavailable,
  }
  return { checks, asked }
}

function post(
  checks: BrowserChecks,
  body: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
) {
  return checkRoutes(ACCESS, checks).request('/api/checks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/checks', () => {
  it('settles the asked frames, then answers their findings', async () => {
    const { checks, asked } = fakeChecks({ 'site/home/hero': [CLIPPED] })

    const response = await post(checks, {
      refs: ['site/home/hero', 'site/home/about'],
    })

    expect(asked).toEqual([['site/home/hero', 'site/home/about']])
    expect(await response.json()).toEqual({
      ok: true,
      data: { findings: [CLIPPED], browser: { ran: true } },
    })
  })

  it('answers browser-not-found when the warm browser does not launch', async () => {
    const { checks } = fakeChecks({}, 'browser-not-found')

    const response = await post(checks, { refs: ['site/home/hero'] })

    expect(await response.json()).toEqual({
      ok: true,
      data: {
        findings: [],
        browser: { ran: false, reason: 'browser-not-found' },
      },
    })
  })

  it('refuses a caller without the token, 401', async () => {
    const { checks, asked } = fakeChecks({})

    const response = await post(checks, { refs: [] }, {})

    expect(response.status).toBe(401)
    expect(asked).toEqual([])
  })

  it('refuses a body with no refs list as usage, 400', async () => {
    const { checks } = fakeChecks({})

    const response = await post(checks, { ref: 'site/home/hero' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    })
  })
})
