import { randomBytes } from 'node:crypto'

export const TICKET_TTL_MS = 2 * 60_000

/** The most minutes `open --ttl` takes, since a link printed into a log stays live that long. */
export const MAX_TICKET_MINUTES = 60

export interface MintedTicket {
  /** 32 hex, single use. */
  ticket: string
  /** ISO time the ticket stops redeeming, on the clock `redeem` reads. */
  expiresAt: string
}

export interface Tickets {
  /** A fresh single-use ticket, valid for `ttlMs` up to an hour, or two minutes. */
  mint: (ttlMs?: number) => MintedTicket
  /** True once for a live ticket, false for a used, expired, or unknown one. */
  redeem: (ticket: string) => boolean
}

/** Tickets live in memory only, so a restart voids them and nothing reaches disk. */
export function createTickets(now: () => number = Date.now): Tickets {
  const expiries = new Map<string, number>()
  return {
    mint: (ttlMs = TICKET_TTL_MS) => {
      for (const [ticket, expiry] of expiries) {
        if (expiry <= now()) expiries.delete(ticket)
      }
      const ticket = randomBytes(16).toString('hex')
      const expiry = now() + Math.min(ttlMs, MAX_TICKET_MINUTES * 60_000)
      expiries.set(ticket, expiry)
      return { ticket, expiresAt: new Date(expiry).toISOString() }
    },
    redeem: (ticket) => {
      const expiry = expiries.get(ticket)
      expiries.delete(ticket)
      return expiry !== undefined && expiry > now()
    },
  }
}
