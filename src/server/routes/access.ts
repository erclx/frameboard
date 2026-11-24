import { type Context, Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'

import { type Access, isWriter } from '../access/guard'
import { MAX_TICKET_MINUTES, type Tickets } from '../access/tickets'
import { answerRefusal, parseBody } from './envelope'

// Hono caps Max-Age at 400 days, the longest a browser keeps a cookie.
const COOKIE_MAX_AGE_S = 34_560_000

const ticketSchema = z.object({
  /** Minutes the ticket lives, the default life when left out. */
  ttl: z.number().int().min(1).max(MAX_TICKET_MINUTES).optional(),
})

export interface AccessRouteOptions {
  /** Mounts the open route, which makes any local browser a writer. */
  openRoute?: boolean
  /** Mounts the grant the Edit button posts, which makes any local program a writer. */
  editButton?: boolean
}

/**
 * How a tab becomes a writer, a used ticket still landing on a reading board.
 * Both options stay off unless asked, since each widens who may write.
 */
export function accessRoutes(
  access: Access,
  tickets: Tickets,
  { openRoute = false, editButton = false }: AccessRouteOptions = {},
): Hono {
  const app = new Hono()

  app.get('/api/access/redeem', (c) => {
    const ticket = c.req.query('ticket')
    if (ticket !== undefined && tickets.redeem(ticket)) {
      setKeyCookie(c, access)
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

  if (editButton) {
    app.post('/api/access/edit', (c) => {
      if (!isBoardPageFetch(c, access)) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'forbidden',
              message: "Only the board's own page can ask for edit access.",
            },
          },
          403,
        )
      }
      setKeyCookie(c, access)
      return c.json({ ok: true, data: { write: true } })
    })
  }

  // Bearer only: a cookie-holding frame must not mint tickets for itself.
  app.post('/api/access/ticket', async (c) => {
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
    // A caller from before `ttl` posts no body.
    const { ttl } = c.req.header('content-type')
      ? await parseBody(c.req.raw, ticketSchema)
      : {}
    const url = new URL('/api/access/redeem', c.req.url)
    const { ticket, expiresAt } = tickets.mint(
      ttl === undefined ? undefined : ttl * 60_000,
    )
    url.searchParams.set('ticket', ticket)
    return c.json({ ok: true, data: { url: url.toString(), expiresAt } })
  })

  app.onError(answerRefusal)

  return app
}

function setKeyCookie(c: Context, access: Access): void {
  setCookie(c, access.cookieName, access.key, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api',
    maxAge: COOKIE_MAX_AGE_S,
  })
}

/**
 * True for a fetch a script on the board's own page sent, which keeps out other
 * pages, frames, and the forms and pings a scriptless kit page can send from
 * the board's origin. A program that is no browser can send the same headers.
 */
function isBoardPageFetch(c: Context, access: Access): boolean {
  const own = new URL(c.req.url)
  if (c.req.header('origin') !== own.origin) return false
  if (!access.isOwnOrigin(own.host)) return false
  // A form or a ping cannot send JSON, and another origin's JSON is preflighted.
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') return false
  // Absent in an older browser, so each refuses only when it is sent.
  return (
    absentOr(c.req.header('sec-fetch-site'), 'same-origin') &&
    absentOr(c.req.header('sec-fetch-mode'), 'cors')
  )
}

function absentOr(header: string | undefined, expected: string): boolean {
  return header === undefined || header === expected
}
