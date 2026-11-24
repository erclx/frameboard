import { describe, expect, it } from 'vitest'

import type { Access } from '../access/guard'
import { createTickets, TICKET_TTL_MS } from '../access/tickets'
import { type AccessRouteOptions, accessRoutes } from './access'

const TOKEN = 'a'.repeat(64)
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'
const BASE = 'http://127.0.0.1:4173'

const access: Access = {
  token: () => TOKEN,
  key: KEY,
  cookieName: COOKIE,
  // Either loopback name, as the board's own check takes them.
  isOwnOrigin: (host) => ['127.0.0.1:4173', 'localhost:4173'].includes(host),
}

describe('accessRoutes', () => {
  function setup(options: AccessRouteOptions = {}) {
    const tickets = createTickets()
    return { tickets, routes: accessRoutes(access, tickets, options) }
  }

  describe('GET /api/access/redeem', () => {
    it('trades a good ticket for a cookie carrying the key and goes home', async () => {
      const { routes, tickets } = setup()

      const response = await routes.request(
        `${BASE}/api/access/redeem?ticket=${tickets.mint().ticket}`,
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/')
      const cookie = response.headers.get('set-cookie') ?? ''
      expect(cookie).toContain(`${COOKIE}=${KEY}`)
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Path=/api')
      expect(cookie).toContain('Max-Age=34560000')
    })

    it.each([
      ['an unknown ticket', `ticket=${'f'.repeat(32)}`],
      ['no ticket', ''],
    ])(
      'sets no cookie for %s and lands on the expired flag',
      async (_case, query) => {
        const { routes } = setup()

        const response = await routes.request(
          `${BASE}/api/access/redeem?${query}`,
        )

        expect(response.status).toBe(303)
        expect(response.headers.get('location')).toBe('/?link=expired')
        expect(response.headers.get('set-cookie')).toBeNull()
      },
    )

    it('sets no cookie when the ticket is used a second time', async () => {
      const { routes, tickets } = setup()
      const url = `${BASE}/api/access/redeem?ticket=${tickets.mint().ticket}`
      await routes.request(url)

      const again = await routes.request(url)

      expect(again.status).toBe(303)
      expect(again.headers.get('location')).toBe('/?link=expired')
      expect(again.headers.get('set-cookie')).toBeNull()
    })

    it('sets no cookie for an expired ticket', async () => {
      let clock = 1_000
      const tickets = createTickets(() => clock)
      const routes = accessRoutes(access, tickets)
      const url = `${BASE}/api/access/redeem?ticket=${tickets.mint().ticket}`

      clock += TICKET_TTL_MS
      const response = await routes.request(url)

      expect(response.headers.get('location')).toBe('/?link=expired')
      expect(response.headers.get('set-cookie')).toBeNull()
    })
  })

  describe('POST /api/access/ticket', () => {
    it('answers a redeem URL to the bearer token that redeems once', async () => {
      const { routes } = setup()

      const response = await routes.request(`${BASE}/api/access/ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const { data } = await response.json()

      expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now())
      expect(data.url).toMatch(
        /^http:\/\/127\.0\.0\.1:4173\/api\/access\/redeem\?ticket=[0-9a-f]{32}$/,
      )
      const redeemed = await routes.request(data.url)
      expect(redeemed.headers.get('set-cookie')).toContain(COOKIE)
    })

    function mint(body: unknown) {
      return setup().routes.request(`${BASE}/api/access/ticket`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    }

    it.each([
      ['two minutes', {}, 2],
      ['the minutes asked for', { ttl: 10 }, 10],
      ['the hour at most', { ttl: 60 }, 60],
    ])('mints a ticket living %s', async (_case, body, minutes) => {
      const before = Date.now()

      const { data } = await (await mint(body)).json()

      const lifeMs = Date.parse(data.expiresAt) - before
      expect(lifeMs).toBeGreaterThanOrEqual(minutes * 60_000)
      expect(lifeMs).toBeLessThan(minutes * 60_000 + 10_000)
    })

    it.each([[0], [61], [1.5], ['10']])(
      'refuses a life of %s as usage and mints nothing',
      async (ttl) => {
        const response = await mint({ ttl })

        expect(response.status).toBe(400)
        const answer = await response.json()
        expect(answer.error.code).toBe('usage')
        expect(answer.data).toBeUndefined()
      },
    )

    it('refuses a tab holding only the board cookie', async () => {
      const { routes } = setup()

      const response = await routes.request(`${BASE}/api/access/ticket`, {
        method: 'POST',
        headers: { cookie: `${COOKIE}=${KEY}`, origin: BASE },
      })

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/access/open', () => {
    it('redirects to a same-origin redeem URL that redeems once', async () => {
      const { routes } = setup({ openRoute: true })

      const response = await routes.request(`${BASE}/api/access/open`)

      expect(response.status).toBe(303)
      const location = response.headers.get('location') ?? ''
      expect(location).toMatch(/^\/api\/access\/redeem\?ticket=[0-9a-f]{32}$/)
      const redeemed = await routes.request(`${BASE}${location}`)
      expect(redeemed.headers.get('set-cookie')).toContain(`${COOKIE}=${KEY}`)
      const again = await routes.request(`${BASE}${location}`)
      expect(again.headers.get('set-cookie')).toBeNull()
    })

    it('mints a fresh ticket on each request, and each redeems', async () => {
      const { routes } = setup({ openRoute: true })

      const first = await routes.request(`${BASE}/api/access/open`)
      const second = await routes.request(`${BASE}/api/access/open`)

      const firstAt = first.headers.get('location') ?? ''
      const secondAt = second.headers.get('location') ?? ''
      expect(firstAt).not.toBe(secondAt)
      const redeemed = await Promise.all(
        [firstAt, secondAt].map((at) => routes.request(`${BASE}${at}`)),
      )
      expect(redeemed.map((r) => r.headers.get('location'))).toEqual(['/', '/'])
    })

    it('answers 404 and mints nothing when the route is off', async () => {
      let minted = 0
      const tickets = createTickets()
      const counting = {
        ...tickets,
        mint: () => {
          minted += 1
          return tickets.mint()
        },
      }
      const routes = accessRoutes(access, counting)

      const response = await routes.request(`${BASE}/api/access/open`)

      expect(response.status).toBe(404)
      expect(minted).toBe(0)
    })
  })

  describe('POST /api/access/edit', () => {
    /** What a fetch from the board's own page sends in a current browser. */
    const own = {
      origin: BASE,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    }

    function edit(
      headers: Record<string, string>,
      { base = BASE, editButton = true } = {},
    ) {
      const { routes } = setup({ editButton })
      return routes.request(`${base}/api/access/edit`, {
        method: 'POST',
        headers,
        body: '{}',
      })
    }

    it("sets the key cookie for a fetch from the board's own page", async () => {
      const response = await edit(own)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, data: { write: true } })
      const cookie = response.headers.get('set-cookie') ?? ''
      expect(cookie).toContain(`${COOKIE}=${KEY}`)
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Path=/api')
    })

    it.each([
      ['a tab on localhost', 'http://localhost:4173', {}],
      [
        'a charset on the type',
        BASE,
        {
          'content-type': 'application/json; charset=utf-8',
        },
      ],
    ])('sets it for %s', async (_case, base, headers) => {
      const response = await edit(
        { ...own, origin: base, ...headers },
        { base },
      )

      expect(response.headers.get('set-cookie')).toContain(KEY)
    })

    it('sets it in a browser that sends no fetch metadata', async () => {
      const response = await edit({
        origin: BASE,
        'content-type': 'application/json',
      })

      expect(response.headers.get('set-cookie')).toContain(KEY)
    })

    it.each([
      ['another site', { ...own, origin: 'https://evil.test' }],
      [
        "a frame, on the frame port's origin",
        {
          ...own,
          origin: 'http://127.0.0.1:47123',
        },
      ],
      [
        'a page under no origin, as a sandboxed one sends',
        {
          ...own,
          origin: 'null',
        },
      ],
      [
        "the board's port over https",
        {
          ...own,
          origin: 'https://127.0.0.1:4173',
        },
      ],
      ['a request with no origin', { 'content-type': 'application/json' }],
      ['a cross-site fetch', { ...own, 'sec-fetch-site': 'cross-site' }],
      ["another port's fetch", { ...own, 'sec-fetch-site': 'same-site' }],
      [
        'a no-cors fetch',
        {
          ...own,
          'sec-fetch-mode': 'no-cors',
          'content-type': 'text/plain',
        },
      ],
      [
        "a kit page's form",
        {
          ...own,
          'sec-fetch-mode': 'navigate',
          'content-type': 'application/x-www-form-urlencoded',
        },
      ],
      [
        "a kit page's form with no fetch metadata",
        {
          origin: BASE,
          'content-type': 'text/plain',
        },
      ],
      [
        "a kit page's ping",
        {
          ...own,
          'sec-fetch-mode': 'no-cors',
          'content-type': 'text/ping',
        },
      ],
      ['a navigation sending JSON', { ...own, 'sec-fetch-mode': 'navigate' }],
      [
        "a page on [::1] under the board's port",
        {
          origin: 'http://localhost:4173',
          'content-type': 'application/json',
        },
      ],
      ['a request with no content type', { origin: BASE }],
    ])(
      'refuses %s in the envelope and sets no cookie',
      async (_case, headers) => {
        const response = await edit(headers)

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({
          ok: false,
          error: { code: 'forbidden', message: expect.any(String) },
        })
        expect(response.headers.get('set-cookie')).toBeNull()
      },
    )

    it('refuses a foreign name rebound to loopback, sent as both origin and host', async () => {
      const base = 'http://evil.test:4173'

      const response = await edit({ ...own, origin: base }, { base })

      expect(response.status).toBe(403)
      expect(response.headers.get('set-cookie')).toBeNull()
    })

    it('answers 404 and sets no cookie when the button is off', async () => {
      const response = await edit(own, { editButton: false })

      expect(response.status).toBe(404)
      expect(response.headers.get('set-cookie')).toBeNull()
    })
  })
})
