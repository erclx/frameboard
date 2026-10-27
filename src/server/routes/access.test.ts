import { describe, expect, it } from 'vitest'

import type { Access } from '../access/guard'
import { createTickets, TICKET_TTL_MS } from '../access/tickets'
import { accessRoutes } from './access'

const TOKEN = 'a'.repeat(64)
const KEY = 'b'.repeat(64)
const COOKIE = 'frameboard-key-111111111111'
const BASE = 'http://127.0.0.1:4173'

const access: Access = {
  token: () => TOKEN,
  key: KEY,
  cookieName: COOKIE,
  isOwnOrigin: (host) => host === '127.0.0.1:4173',
}

describe('accessRoutes', () => {
  function setup(options: { openRoute?: boolean } = {}) {
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
})
