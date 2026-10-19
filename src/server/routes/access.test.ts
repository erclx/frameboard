import { describe, expect, it } from 'vitest'

import type { Access } from '../access/guard'
import { createTickets } from '../access/tickets'
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
  function setup() {
    const tickets = createTickets()
    return { tickets, routes: accessRoutes(access, tickets) }
  }

  describe('GET /api/access/redeem', () => {
    it('trades a good ticket for a cookie carrying the key and goes home', async () => {
      const { routes, tickets } = setup()

      const response = await routes.request(
        `${BASE}/api/access/redeem?ticket=${tickets.mint()}`,
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
    ])('sets no cookie for %s and still goes home', async (_case, query) => {
      const { routes } = setup()

      const response = await routes.request(
        `${BASE}/api/access/redeem?${query}`,
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/')
      expect(response.headers.get('set-cookie')).toBeNull()
    })

    it('sets no cookie when the ticket is used a second time', async () => {
      const { routes, tickets } = setup()
      const url = `${BASE}/api/access/redeem?ticket=${tickets.mint()}`
      await routes.request(url)

      const again = await routes.request(url)

      expect(again.status).toBe(303)
      expect(again.headers.get('set-cookie')).toBeNull()
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
})
