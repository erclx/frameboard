import { timingSafeEqual } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

/** What decides who may write, built once by the server that owns the key. */
export interface Access {
  /** The address file's token, null until the file records one. */
  token: () => string | null
  /** The board key a tab's cookie carries. */
  key: string
  /** The name of this board's cookie. */
  cookieName: string
  /** True when an `Origin` header names the board's own host and port. */
  isOwnOrigin: (origin: string) => boolean
}

/** The request headers the rule reads, as a route or the socket upgrade has them. */
export interface WriterHeaders {
  authorization?: string
  cookie?: string
  origin?: string
}

/**
 * True for the address token as a bearer, or for the board's cookie carrying
 * the key when `Origin` names the board itself. Cookies and SameSite both
 * ignore the port, so the cookie alone would let a page on another local port
 * write, and a request with no `Origin` is refused rather than trusted.
 */
export function isWriter(headers: WriterHeaders, access: Access): boolean {
  const bearer = /^Bearer (.+)$/.exec(headers.authorization ?? '')?.[1]
  if (bearer !== undefined && matches(bearer, access.token())) return true

  const { origin } = headers
  if (origin === undefined || !isOwnOrigin(origin, access)) return false
  const cookie = readCookie(headers.cookie, access.cookieName)
  return cookie !== undefined && matches(cookie, access.key)
}

/** Hono middleware answering 401 in the envelope to anyone who is not a writer. */
export function requireWriter(access: Access): MiddlewareHandler {
  return async (c, next) => {
    const headers = {
      authorization: c.req.header('authorization'),
      cookie: c.req.header('cookie'),
      origin: c.req.header('origin'),
    }
    if (!isWriter(headers, access)) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'unauthorized',
            message:
              'Writes need the board key. Run `frameboard serve` to open a tab that has it.',
          },
        },
        401,
      )
    }
    await next()
  }
}

function isOwnOrigin(origin: string, access: Access): boolean {
  try {
    return access.isOwnOrigin(new URL(origin).host)
  } catch {
    return false
  }
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at !== -1 && part.slice(0, at).trim() === name) {
      return part.slice(at + 1).trim()
    }
  }
  return undefined
}

function matches(given: string, expected: string | null): boolean {
  if (expected === null) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
