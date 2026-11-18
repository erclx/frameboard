import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'

import { type Access, isWriter } from '../access/guard'
import type { Tickets } from '../access/tickets'

// Hono caps Max-Age at 400 days, the longest a browser keeps a cookie.
const COOKIE_MAX_AGE_S = 34_560_000

/**
 * How a tab becomes a writer, a used ticket still landing on a reading board.
 * `openRoute` stays off unless asked, since it makes any local browser a writer.
 */
export function accessRoutes(
  access: Access,
  tickets: Tickets,
  { openRoute = false }: { openRoute?: boolean } = {},
): Hono {
  const app = new Hono()

  app.get('/api/access/redeem', (c) => {
    const ticket = c.req.query('ticket')
    if (ticket !== undefined && tickets.redeem(ticket)) {
      setCookie(c, access.cookieName, access.key, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/api',
        maxAge: COOKIE_MAX_AGE_S,
      })
      return c.redirect('/', 303)
    }
    return c.redirect('/?link=expired', 303)
  })

  if (openRoute) {
    // Relative, never from the Host header, so the ticket stays on its origin.
    app.get('/api/access/open', (c) =>
      c.redirect(`/api/access/redeem?ticket=${tickets.mint().ticket}`, 303),
    )
  }

  // Bearer only: a cookie-holding frame must not mint tickets for itself.
  app.post('/api/access/ticket', (c) => {
    if (!isWriter({ authorization: c.req.header('authorization') }, access)) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'unauthorized',
            message: 'Minting a ticket needs the address file token.',
          },
        },
        401,
      )
    }
    const url = new URL('/api/access/redeem', c.req.url)
    const { ticket, expiresAt } = tickets.mint()
    url.searchParams.set('ticket', ticket)
    return c.json({ ok: true, data: { url: url.toString(), expiresAt } })
  })

  return app
}
